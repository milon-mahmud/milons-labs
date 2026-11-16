import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { buildSrtString, secondsToSrtTimestamp } from './src/utils/srt.ts';
import { extractEmotionTags } from './src/utils/scriptParser.ts';
import type { SrtCue } from './src/types/studio.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const keyCooldownUntil = new Map<string, number>();
let keyRoundRobinCursor = 0;

function getConfiguredGeminiKeys(): string[] {
  const candidates: string[] = [];

  const multi = process.env.GEMINI_API_KEYS;
  if (multi) {
    multi
      .split(/[,;\n\r]+/)
      .map((k) => k.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
      .forEach((k) => candidates.push(k));
  }

  if (process.env.GEMINI_API_KEY) {
    candidates.push(process.env.GEMINI_API_KEY.trim());
  }

  for (let i = 1; i <= 25; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k) candidates.push(k.trim());
  }

  const seen = new Set<string>();
  const valid: string[] = [];
  for (const k of candidates) {
    if (!k || k === 'MY_GEMINI_API_KEY' || k.startsWith('MY_GEMINI_KEY_')) continue;
    if (!seen.has(k)) {
      seen.add(k);
      valid.push(k);
    }
  }
  return valid;
}

function createClientForKey(apiKey: string, apiVersion = 'v1beta'): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeAudioMimeType(rawMime: string, originalName: string): string {
  const base = rawMime.split(';')[0].trim().toLowerCase();
  const ext = path.extname(originalName).toLowerCase();

  if (base === 'audio/mpeg' || ext === '.mp3') return 'audio/mp3';
  if (base === 'audio/x-wav' || base === 'audio/wave' || ext === '.wav') return 'audio/wav';
  if (base === 'audio/x-m4a' || base === 'audio/m4a' || ext === '.m4a') return 'audio/mp4';
  if (base === 'audio/ogg' || ext === '.ogg') return 'audio/ogg';
  if (base === 'audio/flac' || ext === '.flac') return 'audio/flac';
  if (base === 'audio/aac' || ext === '.aac') return 'audio/aac';
  if (base === 'audio/webm' || ext === '.webm') return 'audio/webm';
  if (base === 'video/mp4' || ext === '.mp4') return 'video/mp4';
  if (base === 'video/webm') return 'video/webm';
  if (base.startsWith('audio/') || base.startsWith('video/')) return base;
  return 'audio/mp3';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429');
}

function isKeyAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403');
}

function parseRetrySeconds(rawMessage: string): number | null {
  const match = rawMessage.match(/retry(?:\s+in)?\s+(\d+(?:\.\d+)?)s/i);
  if (match) {
    return Math.ceil(Number(match[1]));
  }
  const delayMatch = rawMessage.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (delayMatch) {
    return parseInt(delayMatch[1], 10);
  }
  return null;
}

async function runWithKeyRotation<T>(
  fn: (ai: GoogleGenAI) => Promise<T>,
  apiVersion = 'v1beta'
): Promise<T> {
  const keys = getConfiguredGeminiKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const now = Date.now();
  const rotated = keys.map((_, idx) => keys[(keyRoundRobinCursor + idx) % keys.length]);
  keyRoundRobinCursor = (keyRoundRobinCursor + 1) % keys.length;

  const healthy = rotated.filter((k) => (keyCooldownUntil.get(k) || 0) <= now);
  const orderedKeys =
    healthy.length > 0
      ? healthy
      : [...rotated].sort(
          (a, b) => (keyCooldownUntil.get(a) || 0) - (keyCooldownUntil.get(b) || 0)
        );

  let lastErr: unknown;

  for (let i = 0; i < orderedKeys.length; i++) {
    const key = orderedKeys[i];
    const ai = createClientForKey(key, apiVersion);
    try {
      return await fn(ai);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);

      if (isRateLimitError(err)) {
        const hintedSec = parseRetrySeconds(msg);
        const cooldownMs = hintedSec ? Math.min(120_000, hintedSec * 1000) : 45_000;
        keyCooldownUntil.set(key, Date.now() + cooldownMs);

        // If more keys remain, fail over immediately to the next key
        if (i < orderedKeys.length - 1) {
          continue;
        }
        // Only 1 key (or last key) and short wait hinted: do one brief retry
        if (hintedSec && hintedSec <= 12) {
          await sleep(hintedSec * 1000 + 500);
          return await fn(ai);
        }
        throw err;
      }

      if (isKeyAuthError(err) && i < orderedKeys.length - 1) {
        keyCooldownUntil.set(key, Date.now() + 300_000);
        continue;
      }

      throw err;
    }
  }

  throw lastErr;
}

function extractApiErrorMessage(err: unknown): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  if (rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('400')) {
    return { status: 400, message: `Invalid request or API key issue: ${rawMessage}` };
  }
  if (rawMessage.includes('PERMISSION_DENIED') || rawMessage.includes('403')) {
    return {
      status: 403,
      message: 'API permission denied. Please verify your GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('429')) {
    const retrySec = parseRetrySeconds(rawMessage);
    const isDaily =
      rawMessage.includes('PerDay') ||
      rawMessage.includes('RPD') ||
      rawMessage.toLowerCase().includes('daily') ||
      (retrySec !== null && retrySec > 180);

    if (isDaily) {
      const timeHint =
        retrySec && retrySec >= 3600
          ? `about ${Math.round(retrySec / 3600)}h`
          : retrySec && retrySec > 180
            ? `about ${Math.ceil(retrySec / 60)} min`
            : 'at midnight US Pacific Time';
      return {
        status: 429,
        message: `Daily free-tier quota reached across your configured API key(s) (resets in ${timeHint}). Add extra keys in GEMINI_API_KEYS or switch to Standard (Fast) mode for higher daily quota.`,
      };
    }

    const waitHint = retrySec
      ? `Please wait about ${retrySec} seconds and try again.`
      : 'Per-minute rate limit usually resets in 30–60 seconds. Please wait a moment and try again.';
    return {
      status: 429,
      message: `Rate limit reached. ${waitHint}`,
    };
  }
  if (rawMessage.includes('NOT_FOUND') || rawMessage.includes('404')) {
    return {
      status: 404,
      message: `Requested Gemini model was not found: ${rawMessage}`,
    };
  }
  return { status: 500, message: rawMessage || 'Unexpected server error.' };
}

function extractCleanWavData(wavBuffer: Buffer): {
  pcm: Buffer;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
} {
  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let pcm: Buffer;

  if (
    wavBuffer.length < 44 ||
    wavBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
    wavBuffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    // Raw L16 PCM returned by Gemini 2.5 TTS models
    pcm = Buffer.from(wavBuffer);
  } else {
    let dataOffset = 44;
    let dataSize = Math.max(0, wavBuffer.length - 44);
    let offset = 12;

    while (offset + 8 <= wavBuffer.length) {
      const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = wavBuffer.readUInt32LE(offset + 4);
      const payloadStart = offset + 8;

      if (chunkId === 'fmt ' && payloadStart + 16 <= wavBuffer.length) {
        numChannels = wavBuffer.readUInt16LE(payloadStart + 2) || 1;
        sampleRate = wavBuffer.readUInt32LE(payloadStart + 4) || 24000;
        bitsPerSample = wavBuffer.readUInt16LE(payloadStart + 14) || 16;
      } else if (chunkId === 'data') {
        dataOffset = payloadStart;
        dataSize = Math.min(chunkSize, wavBuffer.length - payloadStart);
        break;
      }

      offset = payloadStart + chunkSize + (chunkSize % 2);
    }

    // Copy only the pure audio PCM bytes (excludes C2PA or any trailing metadata chunks)
    pcm = Buffer.from(wavBuffer.subarray(dataOffset, dataOffset + dataSize));
  }

  // Apply smooth 15ms fade-in and fade-out on 16-bit PCM to eliminate clicks/pops at boundaries
  if (bitsPerSample === 16 && pcm.length >= 4) {
    const totalSamples = Math.floor(pcm.length / 2);
    const fadeSamples = Math.min(Math.floor((sampleRate * 15) / 1000), Math.floor(totalSamples / 4));
    for (let i = 0; i < fadeSamples; i++) {
      const gain = i / fadeSamples;
      const startVal = pcm.readInt16LE(i * 2);
      pcm.writeInt16LE(Math.round(startVal * gain), i * 2);

      const endIdx = (totalSamples - 1 - i) * 2;
      const endVal = pcm.readInt16LE(endIdx);
      pcm.writeInt16LE(Math.round(endVal * gain), endIdx);
    }
  }

  return { pcm, sampleRate, numChannels, bitsPerSample };
}

function buildCanonicalWavHeader(params: {
  dataSize: number;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
}): Buffer {
  const { dataSize, sampleRate, numChannels, bitsPerSample } = params;
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // PCM subchunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return header;
}

/**
 * Merges multiple WAV buffers into a single clean canonical WAV buffer,
 * stripping non-audio metadata chunks (e.g. C2PA) and smoothing boundaries.
 */
function mergeWavBuffers(wavBuffers: Buffer[], gapMs = 150): Buffer {
  if (wavBuffers.length === 0) return Buffer.alloc(0);

  const extracted = wavBuffers.map(extractCleanWavData);
  const { sampleRate, numChannels, bitsPerSample } = extracted[0];
  const bytesPerSample = (bitsPerSample / 8) * numChannels;
  const gapByteCount = Math.floor((sampleRate * gapMs) / 1000) * bytesPerSample;
  const silenceGap = gapByteCount > 0 ? Buffer.alloc(gapByteCount, 0) : Buffer.alloc(0);

  const pcmParts: Buffer[] = [];
  extracted.forEach((clip, index) => {
    pcmParts.push(clip.pcm);
    if (index < extracted.length - 1 && gapByteCount > 0) {
      pcmParts.push(silenceGap);
    }
  });

  const mergedPcm = Buffer.concat(pcmParts);
  const header = buildCanonicalWavHeader({
    dataSize: mergedPcm.length,
    sampleRate,
    numChannels,
    bitsPerSample,
  });

  return Buffer.concat([header, mergedPcm]);
}

function containsBengali(text: string): boolean {
  return /[\u0980-\u09FF]/.test(text);
}

function splitScriptIntoChunks(text: string, maxChars = 2200): string[] {
  const cleaned = text.trim();
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = cleaned.split(/(?<=[।.!?])\s+|\n+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;
    if (current && current.length + s.length + 1 > maxChars) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = current ? `${current} ${s}` : s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [cleaned];
}

function enhanceSpeechDelivery(
  text: string,
  style?: string,
  emotionHint?: string
): {
  cleanText: string;
  enhancedStyle: string;
  hasBangla: boolean;
} {
  // Strip accidental speaker prefix (e.g. "[ন্যারেটর]:" or "রিমি:") and [scene]/[emotion] tags
  const withoutSpeakerPrefix = text.replace(
    /^\s*(?:\[[^\]]+\]\s*:|[\p{L}\p{N}_\-\s]{1,28}:)\s*/u,
    ''
  );
  const { cleanText: tagStripped, emotions } = extractEmotionTags(withoutSpeakerPrefix);

  const hasBangla = containsBengali(tagStripped);
  // Normalize Bengali dari and ellipsis spacing for natural human breath cadence
  const cleanText = tagStripped
    .replace(/।\s*/g, '। ')
    .replace(/\.{3}\s*/g, '... ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const styleParts = [
    style?.trim() || 'Natural conversational delivery',
    emotionHint?.trim(),
    ...emotions,
  ].filter(Boolean);
  const combinedBase = Array.from(new Set(styleParts)).join('. ');

  if (hasBangla) {
    return {
      cleanText,
      enhancedStyle: `${combinedBase}. Fluent native Bengali speaker delivering Shuddho, natural, soulful Bangla with crystal-clear pronunciation, warm human intonation, lifelike cadence, and studio condenser clarity`,
      hasBangla: true,
    };
  }

  return {
    cleanText,
    enhancedStyle: `${combinedBase}. Clean studio condenser clarity, warm human intonation, natural expressive phrasing and lifelike cadence`,
    hasBangla: false,
  };
}

type SupportedTtsModel =
  | 'gemini-3.8-flash-tts'
  | 'gemini-3.8-flash-lite-tts'
  | 'gemini-2.5-flash-preview-tts'
  | 'gemini-2.5-pro-preview-tts';

const TTS_FALLBACK_ORDER: SupportedTtsModel[] = [
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
];

function adaptTextFor25Tts(text: string): string {
  return text
    .replace(/<breath>/gi, ', ')
    .replace(/<laugh>/gi, ' (laughs lightly) ')
    .replace(/<gasp>/gi, ' (gasps softly) ')
    .replace(/\|mhm\|/gi, 'mhm, ')
    .replace(/\|yeah\|/gi, 'yeah, ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function synthesizeSingleClip(params: {
  model: SupportedTtsModel;
  allowQuotaFallback?: boolean;
  text: string;
  voiceName: string;
  style?: string;
  emotionHint?: string;
}): Promise<{ wav: Buffer; modelUsed: string }> {
  const { model, allowQuotaFallback = true, text, voiceName, style, emotionHint } = params;
  const { cleanText, enhancedStyle } = enhanceSpeechDelivery(text, style, emotionHint);

  if (!cleanText) {
    throw new Error('Script line contains no speakable text after removing labels.');
  }

  const callModel = async (targetModel: SupportedTtsModel) => {
    const is25Model = targetModel.startsWith('gemini-2.5-');
    const contentsPayload = is25Model
      ? `Read the following script aloud naturally in this voice direction (${enhancedStyle}). Speak ONLY the script text itself:\n\n${adaptTextFor25Tts(cleanText)}`
      : [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: { style: enhancedStyle },
              },
            ],
          },
        ];

    const response = await runWithKeyRotation((ai) =>
      ai.models.generateContent({
        model: targetModel,
        contents: contentsPayload,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      })
    );

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('Voice engine did not return audio data.');
    }
    return {
      wav: mergeWavBuffers([Buffer.from(base64Audio, 'base64')], 0),
      modelUsed: targetModel,
    };
  };

  if (!allowQuotaFallback) {
    return await callModel(model);
  }

  const candidates = [model, ...TTS_FALLBACK_ORDER.filter((m) => m !== model)];
  let lastErr: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const target = candidates[i];
    try {
      return await callModel(target);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRecoverableModelSwitch = isRateLimitError(err) || msg.includes('NOT_FOUND') || msg.includes('404');
      if (isRecoverableModelSwitch && i < candidates.length - 1) {
        console.warn(`TTS model ${target} unavailable/rate-limited, failing over to ${candidates[i + 1]}`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function resolveTtsModelSelection(body: {
  ttsModel?: unknown;
  mode?: unknown;
}): {
  model: SupportedTtsModel;
  allowQuotaFallback: boolean;
} {
  const requested = String(body.ttsModel || '').trim();
  if (requested === 'gemini-3.8-flash-lite-tts') {
    return { model: 'gemini-3.8-flash-lite-tts', allowQuotaFallback: false };
  }
  if (requested === 'gemini-3.8-flash-tts') {
    return { model: 'gemini-3.8-flash-tts', allowQuotaFallback: false };
  }
  if (requested === 'gemini-2.5-flash-preview-tts') {
    return { model: 'gemini-2.5-flash-preview-tts', allowQuotaFallback: false };
  }
  if (requested === 'gemini-2.5-pro-preview-tts') {
    return { model: 'gemini-2.5-pro-preview-tts', allowQuotaFallback: false };
  }
  if (requested === 'auto') {
    return { model: 'gemini-3.8-flash-tts', allowQuotaFallback: true };
  }
  return body.mode === 'standard'
    ? { model: 'gemini-3.8-flash-lite-tts', allowQuotaFallback: false }
    : { model: 'gemini-3.8-flash-tts', allowQuotaFallback: true };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Short-lived in-memory files generated for the ChatGPT integration.
  const integrationFiles = new Map<string, { buffer: Buffer; mimeType: string; filename: string; expiresAt: number }>();
  const integrationFileTtlMs = 30 * 60 * 1000;

  function isValidIntegrationToken(req: Request): boolean {
    const expected = process.env.CHATGPT_API_TOKEN || '';
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '').trim();
    if (!expected || !supplied) return false;
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  }

  app.post('/api/integrations/chatgpt/voice-srt', async (req: Request, res: Response) => {
    if (!process.env.CHATGPT_API_TOKEN) {
      res.status(503).json({ error: 'ChatGPT integration is not configured. Set CHATGPT_API_TOKEN on the server.' });
      return;
    }
    if (!isValidIntegrationToken(req)) {
      res.status(401).json({ error: 'Unauthorized. Provide a valid Bearer token.' });
      return;
    }

    try {
      const script = String(req.body.script || req.body.text || '').trim();
      const voiceName = String(req.body.voiceName || 'Kore').trim();
      const style = String(req.body.style || 'Warm, natural Bengali storytelling with clear pronunciation').trim();
      if (!script) {
        res.status(400).json({ error: 'script is required.' });
        return;
      }
      if (script.length > 12000) {
        res.status(413).json({ error: 'Script is too long. Maximum length is 12000 characters.' });
        return;
      }
      const allowedVoices = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
      if (!allowedVoices.has(voiceName)) {
        res.status(400).json({ error: 'voiceName must be Kore, Zephyr, Puck, Charon, or Fenrir.' });
        return;
      }

      const { model, allowQuotaFallback } = resolveTtsModelSelection(req.body);
      const chunks = splitScriptIntoChunks(script, 2200);
      const wavParts: Buffer[] = [];
      let modelUsed: string = model;
      for (let i = 0; i < chunks.length; i++) {
        const clip = await synthesizeSingleClip({
          model,
          allowQuotaFallback,
          text: chunks[i],
          voiceName,
          style,
        });
        wavParts.push(clip.wav);
        modelUsed = clip.modelUsed;
        if (i < chunks.length - 1) await sleep(250);
      }
      const wav = wavParts.length === 1 ? wavParts[0] : mergeWavBuffers(wavParts, 140);

      const srtResponse = await runWithKeyRotation((ai) =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
              { text: 'Transcribe this audio into tightly synchronized Bengali subtitle cues. Keep the exact original spoken language. Split speech into natural subtitle segments of roughly 42 characters max per cue. Ensure startSeconds and endSeconds are accurate and strictly increasing.' },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detectedLanguage: { type: Type.STRING },
                cues: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      startSeconds: { type: Type.NUMBER },
                      endSeconds: { type: Type.NUMBER },
                      text: { type: Type.STRING },
                    },
                    required: ['startSeconds', 'endSeconds', 'text'],
                  },
                },
              },
              required: ['cues'],
            },
          },
        })
      );
      const parsed = JSON.parse((srtResponse.text ?? '{}').trim()) as {
        detectedLanguage?: string;
        cues?: Array<{ startSeconds: number; endSeconds: number; text: string }>;
      };
      const cues: SrtCue[] = (Array.isArray(parsed.cues) ? parsed.cues : [])
        .filter((cue) => cue && typeof cue.text === 'string' && cue.text.trim())
        .map((cue, index) => {
          const start = Math.max(0, Number(cue.startSeconds) || 0);
          const end = Math.max(start + 0.25, Number(cue.endSeconds) || start + 1.5);
          return {
            id: index + 1,
            startTime: secondsToSrtTimestamp(start),
            endTime: secondsToSrtTimestamp(end),
            startSeconds: start,
            endSeconds: end,
            text: cue.text.trim(),
          };
        });
      if (!cues.length) {
        res.status(422).json({ error: 'Voice was generated, but no subtitle cues were returned.' });
        return;
      }

      const now = Date.now();
      for (const [id, file] of integrationFiles) {
        if (file.expiresAt <= now) integrationFiles.delete(id);
      }
      const expiresAt = new Date(now + integrationFileTtlMs).toISOString();
      const audioId = randomUUID();
      const srtId = randomUUID();
      integrationFiles.set(audioId, { buffer: wav, mimeType: 'audio/wav', filename: 'milons-labs-voice.wav', expiresAt: now + integrationFileTtlMs });
      integrationFiles.set(srtId, { buffer: Buffer.from(buildSrtString(cues), 'utf8'), mimeType: 'application/x-subrip; charset=utf-8', filename: 'milons-labs-subtitles.srt', expiresAt: now + integrationFileTtlMs });
      const baseUrl = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\\/+$/, '');
      res.json({
        success: true,
        audioUrl: `${baseUrl}/api/integrations/download/${audioId}`,
        srtUrl: `${baseUrl}/api/integrations/download/${srtId}`,
        detectedLanguage: parsed.detectedLanguage || 'Auto-detected',
        cueCount: cues.length,
        cues,
        modelUsed,
        srtModelUsed: 'gemini-4-hydrogen',
        expiresAt,
        note: 'Download links expire after 30 minutes. Files are held temporarily in server memory.',
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // UUID download links act as temporary, unguessable capabilities; no API token is exposed in URLs.
  app.get('/api/integrations/download/:id', (req: Request, res: Response) => {
    const file = integrationFiles.get(String(req.params.id || ''));
    if (!file || file.expiresAt <= Date.now()) {
      integrationFiles.delete(String(req.params.id || ''));
      res.status(404).json({ error: 'This download link is invalid or has expired. Generate the files again.' });
      return;
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  });

  // Fast Single-Pass Audio -> SRT Subtitle Generator
  app.post('/api/transcribe-srt', upload.single('audio'), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Please upload or record an audio file first.' });
        return;
      }

      const sourceLanguage = String(req.body.language || 'auto').trim();
      const translateTo = String(req.body.translateTo || 'none').trim();
      const maxCharsPerLine = Math.min(84, Math.max(20, Number(req.body.maxCharsPerLine) || 42));
      const srtModelChoice =
        String(req.body.srtModel || '').trim() === 'gemini-3.5-transcribe'
          ? 'gemini-3.5-transcribe'
          : 'gemini-4-hydrogen';

      const mimeType = normalizeAudioMimeType(file.mimetype, file.originalname);
      const base64Audio = file.buffer.toString('base64');

      const audioPart = {
        inlineData: {
          mimeType,
          data: base64Audio,
        },
      };

      const langDirective =
        sourceLanguage && sourceLanguage !== 'auto'
          ? `The spoken language in the audio is ${sourceLanguage}.`
          : 'Auto-detect the spoken language accurately (including Bengali, English, Hindi, or mixed speech).';

      const translateDirective =
        translateTo && translateTo !== 'none'
          ? `Translate all subtitle cue text naturally into ${translateTo} while keeping exact audio timing.`
          : 'Keep the subtitle text in the exact original spoken language.';

      let verbatimTranscriptHint = '';
      if (srtModelChoice === 'gemini-3.5-transcribe') {
        const transcribeResp = await runWithKeyRotation((ai) =>
          ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                audioPart,
                {
                  text: `Provide an accurate verbatim transcript of this audio. ${langDirective}`,
                },
              ],
            },
          })
        );
        const transcriptText = (transcribeResp.text ?? '').trim();
        if (transcriptText) {
          verbatimTranscriptHint = `Use this verbatim transcript as your exact wording reference while syncing audio timestamps: """${transcriptText}"""`;
        }
      }

      const prompt = [
        'Transcribe this audio into tightly synchronized subtitle cues in a single fast pass.',
        langDirective,
        translateDirective,
        verbatimTranscriptHint,
        `Split speech into natural subtitle segments of roughly ${maxCharsPerLine} characters max per cue.`,
        'Ensure startSeconds and endSeconds are accurate and strictly increasing.',
      ]
        .filter(Boolean)
        .join(' ');

      const response = await runWithKeyRotation((ai) =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [audioPart, { text: prompt }],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguage: {
                type: Type.STRING,
                description: 'Primary spoken language detected in the audio.',
              },
              cues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    startSeconds: {
                      type: Type.NUMBER,
                      description: 'Cue start timestamp in seconds.',
                    },
                    endSeconds: {
                      type: Type.NUMBER,
                      description: 'Cue end timestamp in seconds.',
                    },
                    text: {
                      type: Type.STRING,
                      description: 'Subtitle cue text.',
                    },
                  },
                  required: ['startSeconds', 'endSeconds', 'text'],
                },
              },
            },
            required: ['cues'],
          },
        },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        detectedLanguage?: string;
        cues?: Array<{ startSeconds: number; endSeconds: number; text: string }>;
      };

      const rawCues = Array.isArray(parsed.cues) ? parsed.cues : [];
      const cues: SrtCue[] = rawCues
        .filter((item) => item && typeof item.text === 'string' && item.text.trim().length > 0)
        .map((item, idx) => {
          const start = Math.max(0, Number(item.startSeconds) || 0);
          const end = Math.max(start + 0.25, Number(item.endSeconds) || start + 1.5);
          return {
            id: idx + 1,
            startTime: secondsToSrtTimestamp(start),
            endTime: secondsToSrtTimestamp(end),
            startSeconds: start,
            endSeconds: end,
            text: item.text.trim(),
          };
        });

      if (cues.length === 0) {
        res.status(422).json({
          error:
            'No speech could be detected in this audio file. Please check that the audio contains clear speech and try again.',
        });
        return;
      }

      const detectedLanguage =
        parsed.detectedLanguage || (sourceLanguage !== 'auto' ? sourceLanguage : 'Auto-detected');

      res.json({
        cues,
        srtText: buildSrtString(cues),
        detectedLanguage,
        rawTranscript: cues.map((c) => c.text).join(' '),
        modelUsed: srtModelChoice,
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // Single-Speaker TTS & Prompt-Based Voice Design (with long-script auto-chunking)
  app.post('/api/tts/single', async (req: Request, res: Response) => {
    try {
      const text = String(req.body.text || '').trim();
      const voiceName = String(req.body.voiceName || 'Kore').trim();
      const style = String(req.body.style || '').trim();

      if (!text) {
        res.status(400).json({ error: 'Please enter script text to generate speech.' });
        return;
      }

      const { model, allowQuotaFallback } = resolveTtsModelSelection(req.body);

      const textChunks = splitScriptIntoChunks(text, 2200);
      const wavParts: Buffer[] = [];
      let actualModelUsed: string = model;

      for (let i = 0; i < textChunks.length; i++) {
        const result = await synthesizeSingleClip({
          model,
          allowQuotaFallback,
          text: textChunks[i],
          voiceName,
          style,
        });
        wavParts.push(result.wav);
        actualModelUsed = result.modelUsed;
        if (i < textChunks.length - 1) {
          await sleep(250);
        }
      }

      const finalWav = wavParts.length === 1 ? wavParts[0] : mergeWavBuffers(wavParts, 140);

      res.json({
        audioBase64: finalWav.toString('base64'),
        mimeType: 'audio/wav',
        modelUsed: actualModelUsed,
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // Auto-select best base voice from a user's Voice Design prompt
  app.post('/api/voice-design-plan', async (req: Request, res: Response) => {
    try {
      const prompt = String(req.body.prompt || '').trim();
      if (!prompt) {
        res.status(400).json({ error: 'Please enter a voice design description.' });
        return;
      }

      const response = await runWithKeyRotation((ai) =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [
            'Pick the best matching prebuilt base voice for this voice design prompt and refine a concise TTS acting direction.',
            'Available voices:',
            '- Kore (Female, clear, balanced studio voice)',
            '- Zephyr (Female, soft, warm, gentle conversational voice)',
            '- Puck (Male, bright, youthful, energetic voice)',
            '- Charon (Male, deep, grounded, authoritative voice)',
            '- Fenrir (Male, bold, textured, resonant dramatic voice)',
            `\nUser voice design prompt: "${prompt}"`,
          ].join('\n'),
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              baseVoice: {
                type: Type.STRING,
                description: 'Must be one of: Kore, Zephyr, Puck, Charon, Fenrir',
              },
              refinedStyle: {
                type: Type.STRING,
                description: 'Concise TTS acting direction capturing the requested persona, gender feel, tone, and pacing.',
              },
              label: {
                type: Type.STRING,
                description: 'Short 2-4 word name for this designed voice.',
              },
            },
            required: ['baseVoice', 'refinedStyle', 'label'],
          },
        },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        baseVoice?: string;
        refinedStyle?: string;
        label?: string;
      };

      const allowed = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
      const baseVoice = parsed.baseVoice && allowed.has(parsed.baseVoice) ? parsed.baseVoice : 'Kore';

      res.json({
        baseVoice,
        refinedStyle: parsed.refinedStyle?.trim() || prompt,
        label: parsed.label?.trim() || 'Designed Voice',
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // Multi-Speaker Studio (Supports 2 up to 10 distinct speakers with Male/Female voice switching)
  app.post('/api/tts/multispeaker', async (req: Request, res: Response) => {
    try {
      const speakers = req.body.speakers as Array<{
        name: string;
        voiceName: string;
        style?: string;
      }>;
      const turns = req.body.turns as Array<{
        speaker: string;
        text: string;
        emotionHint?: string;
      }>;
      const { model: preferredModel, allowQuotaFallback } = resolveTtsModelSelection(req.body);

      if (!Array.isArray(speakers) || speakers.length < 2 || speakers.length > 10) {
        res.status(400).json({ error: 'Please configure between 2 and 10 speakers.' });
        return;
      }

      if (!Array.isArray(turns) || turns.length === 0) {
        res.status(400).json({ error: 'Please add at least one dialogue line.' });
        return;
      }

      const validTurns = turns.filter((t) => t.text && t.text.trim().length > 0);
      if (validTurns.length === 0) {
        res.status(400).json({ error: 'Dialogue lines cannot be empty.' });
        return;
      }

      const speakerMap = new Map(speakers.map((s) => [s.name, s]));
      const activeSpeakerNames = Array.from(new Set(validTurns.map((t) => t.speaker)));
      const activeSpeakers = activeSpeakerNames
        .map((name) => speakerMap.get(name))
        .filter((s): s is { name: string; voiceName: string; style?: string } => Boolean(s));

      // Fast path: when exactly 2 distinct speakers appear in turns and Flash Expressive is active, use 1-call native multiSpeakerVoiceConfig
      if (activeSpeakers.length === 2 && preferredModel === 'gemini-3.8-flash-tts') {
        const parts = validTurns
          .map((turn) => {
            const spk = speakerMap.get(turn.speaker) ?? activeSpeakers[0];
            const { cleanText, enhancedStyle } = enhanceSpeechDelivery(
              turn.text,
              spk.style,
              turn.emotionHint
            );
            if (!cleanText) return null;
            return {
              text: `${spk.name}: ${cleanText}`,
              speechMetadata: {
                speaker: spk.name,
                style: enhancedStyle,
              },
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);

        if (parts.length > 0) {
          try {
            const response = await runWithKeyRotation((ai) =>
              ai.models.generateContent({
                model: 'gemini-3.8-flash-tts',
                contents: [{ role: 'user', parts }],
                config: {
                  responseModalities: ['AUDIO'],
                  speechConfig: {
                    multiSpeakerVoiceConfig: {
                      speakerVoiceConfigs: activeSpeakers.map((spk) => ({
                        speaker: spk.name,
                        voiceConfig: {
                          prebuiltVoiceConfig: {
                            voiceName: spk.voiceName,
                          },
                        },
                      })),
                    },
                  },
                },
              })
            );

            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const cleaned = mergeWavBuffers([Buffer.from(base64Audio, 'base64')], 0);
              res.json({
                audioBase64: cleaned.toString('base64'),
                mimeType: 'audio/wav',
                modelUsed: 'gemini-3.8-flash-tts',
              });
              return;
            }
          } catch (nativeErr) {
            console.warn('Native dual-speaker fallback to stitched multi-speaker:', nativeErr);
          }
        }
      }

      // General 2–10 Speaker Studio path: synthesize each turn with pacing, key rotation, & quota fallback
      const clips: Buffer[] = new Array(validTurns.length);
      let modelUsed: string = preferredModel;

      const batchSize = 2;
      for (let i = 0; i < validTurns.length; i += batchSize) {
        const batch = validTurns.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((turn) => {
            const spk = speakerMap.get(turn.speaker) ?? speakers[0];
            return synthesizeSingleClip({
              model: preferredModel,
              allowQuotaFallback,
              text: turn.text.trim(),
              voiceName: spk.voiceName,
              style: spk.style?.trim() || 'Natural conversational delivery',
              emotionHint: turn.emotionHint,
            });
          })
        );
        results.forEach((resClip, offset) => {
          clips[i + offset] = resClip.wav;
          modelUsed = resClip.modelUsed;
        });
        if (i + batchSize < validTurns.length) {
          await sleep(300);
        }
      }

      const merged = mergeWavBuffers(clips, 160);
      res.json({
        audioBase64: merged.toString('base64'),
        mimeType: 'audio/wav',
        modelUsed,
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // Keep /api/tts/dialogue alias for compatibility
  app.post('/api/tts/dialogue', (req: Request, res: Response, next) => {
    req.url = '/api/tts/multispeaker';
    next();
  });

  // One Speaker shifting across different vocal tones, genders, & emotional styles line-by-line
  app.post('/api/tts/voice-shift', async (req: Request, res: Response) => {
    try {
      const segments = req.body.segments as Array<{
        voiceName: string;
        style?: string;
        text: string;
      }>;
      const { model: preferredModel, allowQuotaFallback } = resolveTtsModelSelection(req.body);

      if (!Array.isArray(segments) || segments.length === 0) {
        res.status(400).json({ error: 'Please add at least one line to synthesize.' });
        return;
      }

      const validSegments = segments.filter((s) => s.text && s.text.trim().length > 0);
      if (validSegments.length === 0) {
        res.status(400).json({ error: 'Voice-shifting script lines cannot be empty.' });
        return;
      }

      const clips: Buffer[] = new Array(validSegments.length);
      let modelUsed: string = preferredModel;

      const batchSize = 2;
      for (let i = 0; i < validSegments.length; i += batchSize) {
        const batch = validSegments.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((seg) =>
            synthesizeSingleClip({
              model: preferredModel,
              allowQuotaFallback,
              text: seg.text.trim(),
              voiceName: seg.voiceName || 'Kore',
              style: seg.style?.trim() || 'Expressive natural storytelling',
            })
          )
        );
        results.forEach((resClip, offset) => {
          clips[i + offset] = resClip.wav;
          modelUsed = resClip.modelUsed;
        });
        if (i + batchSize < validSegments.length) {
          await sleep(300);
        }
      }

      const merged = mergeWavBuffers(clips, 110);
      res.json({
        audioBase64: merged.toString('base64'),
        mimeType: 'audio/wav',
        modelUsed,
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // Analyze a reference audio clip to match base voice & extract Voice Acting Direction
  app.post('/api/voice-persona-match', upload.single('audio'), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Please upload or record a short voice sample first.' });
        return;
      }

      const personaName = String(req.body.name || 'Custom Voice').trim() || 'Custom Voice';
      const mimeType = normalizeAudioMimeType(file.mimetype, file.originalname);
      const base64Audio = file.buffer.toString('base64');

      const response = await runWithKeyRotation((ai) =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Audio,
                },
              },
              {
                text: [
                  'Listen carefully to the speaker in this reference audio clip.',
                  'Analyze their pitch range, warmth, vocal texture, speaking pace, accent/language cadence, and emotional delivery.',
                  'Choose the closest matching prebuilt voice from ONLY these 5 options:',
                  '- Kore (female, clear, balanced studio voice)',
                  '- Zephyr (female, soft, warm, conversational voice)',
                  '- Puck (male, bright, energetic, expressive voice)',
                  '- Charon (male, deep, grounded, authoritative voice)',
                  '- Fenrir (male, bold, textured, resonant voice)',
                  'Then write a concise, vivid Voice Acting Direction prompt (max 22 words) that instructs a TTS actor to reproduce this exact speaking style, cadence, and tone.',
                  'Also write a short 1-sentence vocal profile summary.',
                ].join('\n'),
              },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                baseVoice: {
                  type: Type.STRING,
                  description: 'Must be one of: Kore, Zephyr, Puck, Charon, Fenrir',
                },
                styleDirection: {
                  type: Type.STRING,
                  description: 'Concise TTS acting direction capturing tone, pace, warmth, and cadence.',
                },
                summary: {
                  type: Type.STRING,
                  description: 'Short 1-sentence description of the analyzed voice characteristics.',
                },
              },
              required: ['baseVoice', 'styleDirection', 'summary'],
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        baseVoice?: string;
        styleDirection?: string;
        summary?: string;
      };

      const allowed = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
      const baseVoice = parsed.baseVoice && allowed.has(parsed.baseVoice) ? parsed.baseVoice : 'Kore';

      res.json({
        name: personaName,
        baseVoice,
        styleDirection:
          parsed.styleDirection?.trim() || 'Warm, natural conversational delivery with steady pacing',
        summary: parsed.summary?.trim() || 'Matched vocal tone and cadence from audio sample.',
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // Polish or convert a topic/draft into an expressive voice script or multi-speaker dialogue
  app.post('/api/script-assist', async (req: Request, res: Response) => {
    try {
      const draft = String(req.body.draft || '').trim();
      const format = req.body.format === 'dialogue' ? 'dialogue' : 'narration';
      const speakerNames = Array.isArray(req.body.speakers)
        ? (req.body.speakers as string[]).filter(Boolean)
        : [
            String(req.body.speakerA || 'Maya').trim(),
            String(req.body.speakerB || 'Arif').trim(),
          ];

      if (!draft) {
        res.status(400).json({ error: 'Enter a topic or draft text first.' });
        return;
      }

      if (format === 'dialogue') {
        const response = await runWithKeyRotation((ai) =>
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Turn the following idea or draft into a natural conversation rotating between these speakers: ${speakerNames.join(', ')}. Keep it in the same language as the input (Bengali if input is Bengali, English if English). Optionally include subtle vocal cues like <breath>, <laugh>, |mhm|, or |yeah| where natural.\n\nDraft:\n${draft}`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  turns: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        speaker: { type: Type.STRING },
                        text: { type: Type.STRING },
                      },
                      required: ['speaker', 'text'],
                    },
                  },
                },
                required: ['turns'],
              },
            },
          })
        );

        const parsed = JSON.parse((response.text ?? '{}').trim()) as {
          turns?: Array<{ speaker: string; text: string }>;
        };
        res.json({ turns: parsed.turns ?? [] });
        return;
      }

      const response = await runWithKeyRotation((ai) =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Rewrite or expand the following draft into a smooth, natural voiceover narration script ready for text-to-speech. Keep the exact language of the user's input (Bengali or English). Add natural punctuation and subtle <breath> pauses where appropriate. Return ONLY the script text.\n\nDraft:\n${draft}`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );

      res.json({ script: (response.text ?? '').trim() });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  const httpServer = http.createServer(app);

  if (!isProd) {
    let viteInitError: unknown = null;
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      return createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        },
        appType: 'spa',
      });
    })().catch((err) => {
      viteInitError = err;
      console.error('Failed to initialize Vite dev middleware:', err);
      return null;
    });

    app.use(async (req, res, next) => {
      const vite = await vitePromise;
      if (!vite) {
        next(viteInitError ?? new Error('Vite dev middleware failed to initialize.'));
        return;
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Milons Labs server running on http://localhost:${PORT} (${getConfiguredGeminiKeys().length} Gemini key(s) configured)`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

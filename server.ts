import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { buildSrtString, secondsToSrtTimestamp } from './src/utils/srt';
import type { SrtCue } from './src/types/studio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

function getAiClient(apiVersion = 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
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
    return {
      status: 429,
      message: 'Rate limit reached. Please wait a few seconds and try again.',
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

  if (
    wavBuffer.length < 44 ||
    wavBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
    wavBuffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return { pcm: Buffer.from(wavBuffer), sampleRate, numChannels, bitsPerSample };
  }

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
  const pcm = Buffer.from(wavBuffer.subarray(dataOffset, dataOffset + dataSize));

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

function enhanceSpeechDelivery(text: string, style?: string): {
  cleanText: string;
  enhancedStyle: string;
  hasBangla: boolean;
} {
  const hasBangla = containsBengali(text);
  // Normalize Bengali dari punctuation spacing cleanly without altering vocal tags
  const cleanText = text.replace(/।\s*/g, '। ').replace(/\s{2,}/g, ' ').trim();
  const baseStyle = style?.trim() || 'Natural conversational delivery';

  if (hasBangla) {
    return {
      cleanText,
      enhancedStyle: `${baseStyle}. Native fluent Bengali speaker, crystal-clear Bangla diction, clean studio microphone quality with zero background noise or throat artifacts, warm human intonation, never robotic`,
      hasBangla: true,
    };
  }

  return {
    cleanText,
    enhancedStyle: `${baseStyle}. Clean studio microphone quality with zero background noise or throat artifacts, natural human intonation and warm conversational phrasing, never robotic`,
    hasBangla: false,
  };
}

async function synthesizeSingleClip(params: {
  ai: GoogleGenAI;
  model: 'gemini-3.8-flash-lite-tts' | 'gemini-3.8-flash-tts';
  text: string;
  voiceName: string;
  style?: string;
}): Promise<Buffer> {
  const { ai, model, text, voiceName, style } = params;
  const { cleanText, enhancedStyle, hasBangla } = enhanceSpeechDelivery(text, style);
  const chosenModel = hasBangla ? 'gemini-3.8-flash-tts' : model;

  const part: { text: string; speechMetadata?: { style: string } } = {
    text: cleanText,
    speechMetadata: { style: enhancedStyle },
  };

  const response = await ai.models.generateContent({
    model: chosenModel,
    contents: [
      {
        role: 'user',
        parts: [part],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('Voice engine did not return audio data.');
  }
  return mergeWavBuffers([Buffer.from(base64Audio, 'base64')], 0);
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

      const mimeType = normalizeAudioMimeType(file.mimetype, file.originalname);
      const base64Audio = file.buffer.toString('base64');

      const ai = getAiClient('v1beta');
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

      const prompt = [
        'Transcribe this audio into tightly synchronized subtitle cues in a single fast pass.',
        langDirective,
        translateDirective,
        `Split speech into natural subtitle segments of roughly ${maxCharsPerLine} characters max per cue.`,
        'Ensure startSeconds and endSeconds are accurate and strictly increasing.',
      ].join(' ');

      const response = await ai.models.generateContent({
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
      });

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
        modelUsed: 'gemini-4-hydrogen',
      });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  // Single-Speaker TTS & Prompt-Based Voice Design
  app.post('/api/tts/single', async (req: Request, res: Response) => {
    try {
      const text = String(req.body.text || '').trim();
      const voiceName = String(req.body.voiceName || 'Kore').trim();
      const style = String(req.body.style || '').trim();
      const mode = req.body.mode === 'expressive' ? 'expressive' : 'standard';

      if (!text) {
        res.status(400).json({ error: 'Please enter script text to generate speech.' });
        return;
      }

      const ai = getAiClient('v1beta');
      const model = mode === 'expressive' ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';

      const wavBuffer = await synthesizeSingleClip({
        ai,
        model,
        text,
        voiceName,
        style,
      });

      res.json({
        audioBase64: wavBuffer.toString('base64'),
        mimeType: 'audio/wav',
        modelUsed: model,
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

      const ai = getAiClient('v1beta');
      const response = await ai.models.generateContent({
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
      });

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
      const turns = req.body.turns as Array<{ speaker: string; text: string }>;

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

      const ai = getAiClient('v1beta');

      // Fast path: when exactly 2 distinct speakers are used and <= 8 turns, try native multiSpeakerVoiceConfig
      if (speakers.length === 2) {
        const speakerMap = new Map(speakers.map((s) => [s.name, s]));
        const parts = validTurns.map((turn) => {
          const spk = speakerMap.get(turn.speaker) ?? speakers[0];
          const { cleanText, enhancedStyle } = enhanceSpeechDelivery(turn.text, spk.style);
          return {
            text: `${spk.name}: ${cleanText}`,
            speechMetadata: {
              speaker: spk.name,
              style: enhancedStyle,
            },
          };
        });

        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash-tts',
            contents: [{ role: 'user', parts }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: speakers.map((spk) => ({
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
          });

          const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            res.json({
              audioBase64: base64Audio,
              mimeType: 'audio/wav',
              modelUsed: 'gemini-3.8-flash-tts',
            });
            return;
          }
        } catch (nativeErr) {
          console.warn('Native dual-speaker fallback to stitched multi-speaker:', nativeErr);
        }
      }

      // General 2–10 Speaker Studio path: synthesize each turn with its speaker's voice & style and stitch seamlessly
      const speakerMap = new Map(speakers.map((s) => [s.name, s]));
      const clips: Buffer[] = new Array(validTurns.length);

      // Process in batches of 3 to stay fast while respecting concurrency
      const batchSize = 3;
      for (let i = 0; i < validTurns.length; i += batchSize) {
        const batch = validTurns.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((turn) => {
            const spk = speakerMap.get(turn.speaker) ?? speakers[0];
            return synthesizeSingleClip({
              ai,
              model: 'gemini-3.8-flash-tts',
              text: turn.text.trim(),
              voiceName: spk.voiceName,
              style: spk.style?.trim() || 'Natural conversational delivery',
            });
          })
        );
        results.forEach((buf, offset) => {
          clips[i + offset] = buf;
        });
      }

      const merged = mergeWavBuffers(clips, 180);
      res.json({
        audioBase64: merged.toString('base64'),
        mimeType: 'audio/wav',
        modelUsed: 'gemini-3.8-flash-tts',
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

      if (!Array.isArray(segments) || segments.length === 0) {
        res.status(400).json({ error: 'Please add at least one line to synthesize.' });
        return;
      }

      const validSegments = segments.filter((s) => s.text && s.text.trim().length > 0);
      if (validSegments.length === 0) {
        res.status(400).json({ error: 'Voice-shifting script lines cannot be empty.' });
        return;
      }

      const ai = getAiClient('v1beta');
      const clips: Buffer[] = new Array(validSegments.length);

      const batchSize = 3;
      for (let i = 0; i < validSegments.length; i += batchSize) {
        const batch = validSegments.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((seg) =>
            synthesizeSingleClip({
              ai,
              model: 'gemini-3.8-flash-tts',
              text: seg.text.trim(),
              voiceName: seg.voiceName || 'Kore',
              style: seg.style?.trim() || 'Expressive natural storytelling',
            })
          )
        );
        results.forEach((buf, offset) => {
          clips[i + offset] = buf;
        });
      }

      const merged = mergeWavBuffers(clips, 110);
      res.json({
        audioBase64: merged.toString('base64'),
        mimeType: 'audio/wav',
        modelUsed: 'gemini-3.8-flash-tts',
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

      const ai = getAiClient('v1beta');
      const response = await ai.models.generateContent({
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
      });

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

      const ai = getAiClient('v1beta');

      if (format === 'dialogue') {
        const response = await ai.models.generateContent({
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
        });

        const parsed = JSON.parse((response.text ?? '{}').trim()) as {
          turns?: Array<{ speaker: string; text: string }>;
        };
        res.json({ turns: parsed.turns ?? [] });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Rewrite or expand the following draft into a smooth, natural voiceover narration script ready for text-to-speech. Keep the exact language of the user's input (Bengali or English). Add natural punctuation and subtle <breath> pauses where appropriate. Return ONLY the script text.\n\nDraft:\n${draft}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      res.json({ script: (response.text ?? '').trim() });
    } catch (err) {
      const { status, message } = extractApiErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VoxCraft Studio server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

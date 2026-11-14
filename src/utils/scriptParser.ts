import type { DialogueSpeaker, DialogueTurn, VoiceName } from '../types/studio.ts';

export const EMOTION_STYLE_MAP: Record<string, string> = {
  curious: 'Curious, intrigued, gently questioning vocal tone',
  softly: 'Soft, quiet, tender, close-mic gentle delivery',
  warmly: 'Warm, affectionate, comforting storytelling voice',
  shy: 'Shy, hesitant, sweet, delicate soft-spoken voice',
  relieved: 'Relieved, calm exhale, hopeful gentle tone',
  cheerful: 'Cheerful, smiling, bright lively delivery',
  happy: 'Happy, joyful, warm smiling voice',
  sad: 'Sad, melancholic, tender emotional inflection',
  excited: 'Excited, enthusiastic, energetic bright tone',
  whisper: 'Soft hushed whisper, intimate close microphone',
  whispering: 'Soft hushed whisper, intimate close microphone',
  angry: 'Firm, intense, frustrated emotional tone',
  scared: 'Nervous, trembling, anxious hushed voice',
  fearful: 'Nervous, trembling, anxious hushed voice',
  calm: 'Calm, unhurried, peaceful balanced tone',
  dramatic: 'Dramatic, cinematic, expressive storytelling gravity',
  serious: 'Serious, grounded, measured authoritative tone',
};

const SCENE_HEADER_REGEX =
  /^\s*(?:\[(?:দৃশ্য|scene|অংশ|part|act)\s*[^\]]*\]|\((?:দৃশ্য|scene|অংশ|part|act)\s*[^)]*\))\s*$/i;

const INLINE_SCENE_REGEX =
  /\[(?:দৃশ্য|scene|অংশ|part|act)\s*[^\]]*\]/gi;

const SPEAKER_BRACKET_LINE_REGEX = /^\s*\[([^\]]+)\]\s*:\s*(.*)$/;
const SPEAKER_PLAIN_LINE_REGEX =
  /^\s*([\p{L}\p{N}_\-\s]{1,36})\s*:\s*(.*)$/u;

export function inferCharacterVoiceProfile(speakerName: string): {
  voiceName: VoiceName;
  style: string;
} {
  const lower = speakerName.toLowerCase();

  if (
    lower.includes('রিমি') ||
    lower.includes('rimi') ||
    lower.includes('খুকি') ||
    lower.includes('বাচ্চা') ||
    lower.includes('মেয়ে')
  ) {
    return {
      voiceName: 'Zephyr',
      style:
        'Sweet, innocent 7-year-old Bengali girl voice, bright youthful pitch, expressive playful Bangla diction',
    };
  }

  if (
    lower.includes('তুলতুল') ||
    lower.includes('tultul') ||
    lower.includes('ভূত') ||
    lower.includes('ghost')
  ) {
    return {
      voiceName: 'Zephyr',
      style:
        'Soft, airy, gentle whisper-like cute child voice, shy and sweet Bengali tone with delicate pauses',
    };
  }

  if (
    lower.includes('দাদু') ||
    lower.includes('dadu') ||
    lower.includes('নানা') ||
    lower.includes('বৃদ্ধ') ||
    lower.includes('grandfather')
  ) {
    return {
      voiceName: 'Charon',
      style:
        'Warm, wise 65-year-old Bengali grandfather voice, calm unhurried elderly cadence, affectionate depth',
    };
  }

  if (
    lower.includes('দোকানদার') ||
    lower.includes('রহিম') ||
    lower.includes('কাকা') ||
    lower.includes('rahim') ||
    lower.includes('kaka')
  ) {
    return {
      voiceName: 'Fenrir',
      style:
        'Deep, friendly 40-year-old Bangladeshi village shopkeeper male voice, warm conversational Bangla tone',
    };
  }

  if (
    lower.includes('ন্যারেটর') ||
    lower.includes('narrator') ||
    lower.includes('কথক') ||
    lower.includes('গল্পকার')
  ) {
    return {
      voiceName: 'Kore',
      style:
        'Warm, expressive female Bengali storyteller, Shuddho Bangla pronunciation, smooth emotional rhythm',
    };
  }

  if (
    lower.includes('arif') ||
    lower.includes('rafi') ||
    lower.includes('tariq') ||
    lower.includes('kamal') ||
    lower.includes('imran') ||
    lower.includes('বাবা') ||
    lower.includes('ভাই')
  ) {
    return {
      voiceName: 'Puck',
      style: 'Warm, expressive male voice with natural Bengali and English clarity',
    };
  }

  return {
    voiceName: 'Kore',
    style: 'Natural, expressive storyteller with clear pronunciation',
  };
}

export function extractEmotionTags(rawText: string): {
  cleanText: string;
  emotions: string[];
} {
  const emotions: string[] = [];
  let text = rawText.replace(INLINE_SCENE_REGEX, ' ');

  // Extract [emotion] bracket tags while preserving <breath>, <laugh>, <gasp>, |mhm|, |yeah|
  text = text.replace(/\[([a-zA-Z\s_-]{2,28})\]/g, (_match, tagInner: string) => {
    const key = tagInner.trim().toLowerCase();
    const mapped = EMOTION_STYLE_MAP[key] || `${key} vocal tone`;
    if (!emotions.includes(mapped)) {
      emotions.push(mapped);
    }
    return ' ';
  });

  // Remove any standalone Bengali scene markers inside brackets
  text = text.replace(/\[[^\]]*(?:দৃশ্য|scene)[^\]]*\]/gi, ' ');

  return {
    cleanText: text.replace(/\s{2,}/g, ' ').trim(),
    emotions,
  };
}

export function parseScreenplayScript(
  rawScript: string,
  existingSpeakers: DialogueSpeaker[] = []
): {
  speakers: DialogueSpeaker[];
  turns: Array<DialogueTurn & { emotionHint?: string }>;
} {
  const lines = rawScript.split(/\r?\n/);
  const speakerMap = new Map<string, DialogueSpeaker>();

  for (const spk of existingSpeakers) {
    speakerMap.set(spk.name.trim(), spk);
  }

  const ensureSpeaker = (name: string): DialogueSpeaker => {
    const cleanName = name.trim();
    const existing = speakerMap.get(cleanName);
    if (existing) return existing;

    const inferred = inferCharacterVoiceProfile(cleanName);
    const created: DialogueSpeaker = {
      id: `spk-${speakerMap.size + 1}-${Date.now()}`,
      name: cleanName,
      voiceName: inferred.voiceName,
      style: inferred.style,
    };
    speakerMap.set(cleanName, created);
    return created;
  };

  let currentSpeakerName = existingSpeakers[0]?.name || 'ন্যারেটর';
  const rawTurns: Array<{ speaker: string; line: string }> = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Skip scene headings like [দৃশ্য ১] or (Scene 1)
    if (SCENE_HEADER_REGEX.test(trimmed)) continue;

    const bracketSpeakerMatch = trimmed.match(SPEAKER_BRACKET_LINE_REGEX);
    if (bracketSpeakerMatch) {
      const candidate = bracketSpeakerMatch[1].trim();
      const rest = bracketSpeakerMatch[2].trim();
      // Ignore if bracket was actually an emotion tag without dialogue label
      if (!EMOTION_STYLE_MAP[candidate.toLowerCase()]) {
        currentSpeakerName = candidate;
        ensureSpeaker(currentSpeakerName);
        if (rest) {
          rawTurns.push({ speaker: currentSpeakerName, line: rest });
        }
        continue;
      }
    }

    const plainSpeakerMatch = trimmed.match(SPEAKER_PLAIN_LINE_REGEX);
    if (plainSpeakerMatch && !trimmed.startsWith('[')) {
      const candidate = plainSpeakerMatch[1].trim();
      const rest = plainSpeakerMatch[2].trim();
      // Only treat as speaker label if line doesn't look like a URL or time (e.g. 12:30)
      if (!/^\d+$/.test(candidate) && candidate.length <= 30) {
        currentSpeakerName = candidate;
        ensureSpeaker(currentSpeakerName);
        if (rest) {
          rawTurns.push({ speaker: currentSpeakerName, line: rest });
        }
        continue;
      }
    }

    ensureSpeaker(currentSpeakerName);
    rawTurns.push({ speaker: currentSpeakerName, line: trimmed });
  }

  // Merge consecutive lines belonging to the same speaker into cohesive turns
  // so each speaker turn uses minimal API quota while preserving all emotion hints.
  const mergedTurns: Array<DialogueTurn & { emotionHint?: string }> = [];

  for (const item of rawTurns) {
    const { cleanText, emotions } = extractEmotionTags(item.line);
    if (!cleanText) continue;

    const prev = mergedTurns[mergedTurns.length - 1];
    if (prev && prev.speaker === item.speaker) {
      prev.text = `${prev.text} ${cleanText}`.trim();
      if (emotions.length > 0) {
        const combined = [prev.emotionHint, ...emotions].filter(Boolean);
        prev.emotionHint = Array.from(new Set(combined)).join(' -> ');
      }
    } else {
      mergedTurns.push({
        id: `turn-${mergedTurns.length + 1}-${Date.now()}`,
        speaker: item.speaker,
        text: cleanText,
        emotionHint: emotions.length > 0 ? emotions.join(' -> ') : undefined,
      });
    }
  }

  // Cap speakers list at 10 while ensuring at least 2 speakers for Multi-Speaker mode
  let finalSpeakers = Array.from(speakerMap.values()).slice(0, 10);
  if (finalSpeakers.length === 1) {
    const fallback = inferCharacterVoiceProfile('রিমি');
    finalSpeakers.push({
      id: `spk-2-${Date.now()}`,
      name: finalSpeakers[0].name === 'রিমি' ? 'ন্যারেটর' : 'রিমি',
      voiceName: fallback.voiceName,
      style: fallback.style,
    });
  }

  return {
    speakers: finalSpeakers,
    turns: mergedTurns,
  };
}

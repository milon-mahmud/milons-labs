export type StudioTab = 'srt' | 'voice' | 'history';

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface VoiceProfile {
  id: VoiceName;
  name: string;
  tone: string;
  gender: string;
  bestFor: string;
  samplePrompt: string;
}

export interface CustomVoicePersona {
  id: string;
  name: string;
  baseVoice: VoiceName;
  styleDirection: string;
  summary: string;
  createdAt: number;
}

export interface SrtCue {
  id: number;
  startTime: string; // HH:MM:SS,mmm
  endTime: string;   // HH:MM:SS,mmm
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface SrtGenerationResult {
  cues: SrtCue[];
  srtText: string;
  detectedLanguage?: string;
  rawTranscript?: string;
  modelUsed: string;
}

export interface SingleTtsRequest {
  text: string;
  voiceName: VoiceName;
  style?: string;
  mode: 'standard' | 'expressive';
}

export interface DialogueSpeaker {
  id?: string;
  name: string;
  voiceName: VoiceName;
  style: string;
}

export interface DialogueTurn {
  id: string;
  speaker: string;
  text: string;
}

export interface VoiceShiftSegment {
  id: string;
  presetLabel: string;
  voiceName: VoiceName;
  style: string;
  text: string;
}

export interface DialogueTtsRequest {
  speakers: [DialogueSpeaker, DialogueSpeaker];
  turns: Array<{ speaker: string; text: string }>;
}

export interface TtsResponse {
  audioBase64: string;
  mimeType: string;
  modelUsed: string;
}

export interface HistoryItem {
  id: string;
  type: 'srt' | 'voice';
  title: string;
  subtitle: string;
  createdAt: number;
  // For SRT items
  cues?: SrtCue[];
  language?: string;
  // For Voice items (audioUrl is session-scoped object URL or data URL if small)
  voiceLabel?: string;
  scriptPreview?: string;
  audioDataUrl?: string;
}

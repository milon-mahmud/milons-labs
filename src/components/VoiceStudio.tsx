import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  Sparkles,
  Plus,
  Trash2,
  Download,
  Subtitles,
  AlertCircle,
  Wand2,
  Mic,
  Square,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  BANGLA_VOICE_SHIFT_DEMO,
  SAMPLE_SCRIPTS,
  STUDIO_VOICES,
  STYLE_PRESETS,
  VOCAL_TAGS,
  VOICE_SHIFT_PRESETS,
} from '../data/voices';
import { WaveformPlayer } from './WaveformPlayer';
import { formatDisplayTime } from '../utils/srt';
import type {
  CustomVoicePersona,
  DialogueSpeaker,
  DialogueTurn,
  TtsResponse,
  VoiceName,
  VoiceShiftSegment,
} from '../types/studio';

const PERSONA_STORAGE_KEY = 'voxcraft_custom_personas_v1';

const DEFAULT_SPEAKER_TEMPLATES: Array<{
  name: string;
  voiceName: VoiceName;
  style: string;
}> = [
  { name: 'Maya', voiceName: 'Kore', style: 'Warm, articulate female host' },
  { name: 'Arif', voiceName: 'Puck', style: 'Energetic, friendly male co-host' },
  { name: 'Nadia', voiceName: 'Zephyr', style: 'Calm, gentle female storyteller' },
  { name: 'Tariq', voiceName: 'Charon', style: 'Deep, authoritative male narrator' },
  { name: 'Rafi', voiceName: 'Fenrir', style: 'Bold, expressive male voice actor' },
  { name: 'Farah', voiceName: 'Kore', style: 'Bright, cheerful young female' },
  { name: 'Kamal', voiceName: 'Charon', style: 'Measured, wise senior male' },
  { name: 'Sadia', voiceName: 'Zephyr', style: 'Soft-spoken female analyst' },
  { name: 'Imran', voiceName: 'Puck', style: 'Fast-paced male reporter' },
  { name: 'Zoya', voiceName: 'Kore', style: 'Confident, dramatic female lead' },
];

function getVoiceGender(voiceName: VoiceName): string {
  return STUDIO_VOICES.find((v) => v.id === voiceName)?.gender || 'Studio';
}

interface VoiceStudioProps {
  onSendAudioToSrt: (file: File) => void;
  onSaveHistory: (item: {
    title: string;
    voiceLabel: string;
    scriptPreview: string;
    audioDataUrl: string;
  }) => void;
  loadedAudioUrl?: string | null;
  loadedTitle?: string | null;
  onClearLoaded?: () => void;
}

export const VoiceStudio: React.FC<VoiceStudioProps> = ({
  onSendAudioToSrt,
  onSaveHistory,
  loadedAudioUrl,
  loadedTitle,
  onClearLoaded,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sampleInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [studioMode, setStudioMode] = useState<'single' | 'shift' | 'dialogue' | 'persona'>('single');
  const [expressiveMode, setExpressiveMode] = useState<'standard' | 'expressive'>('expressive');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Kore');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [styleDirection, setStyleDirection] = useState<string>(
    'Warm, natural studio narrator with clear pronunciation'
  );
  const [voiceDesignPrompt, setVoiceDesignPrompt] = useState<string>('');
  const [isDesigningVoice, setIsDesigningVoice] = useState<boolean>(false);
  const [pace, setPace] = useState<'slow' | 'natural' | 'fast'>('natural');
  const [emotionLevel, setEmotionLevel] = useState<'subtle' | 'balanced' | 'expressive'>('expressive');
  const [scriptText, setScriptText] = useState<string>(SAMPLE_SCRIPTS.english);

  const [customPersonas, setCustomPersonas] = useState<CustomVoicePersona[]>(() => {
    try {
      const raw = localStorage.getItem(PERSONA_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CustomVoicePersona[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PERSONA_STORAGE_KEY, JSON.stringify(customPersonas));
    } catch {
      // Ignore quota errors
    }
  }, [customPersonas]);

  // Voice Persona Matcher state
  const [personaName, setPersonaName] = useState('My Custom Voice');
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [isRecordingSample, setIsRecordingSample] = useState(false);
  const [sampleRecordSeconds, setSampleRecordSeconds] = useState(0);
  const [isMatchingPersona, setIsMatchingPersona] = useState(false);

  // Multi-Speaker Studio (2 up to 10 speakers, Male & Female switching)
  const [speakers, setSpeakers] = useState<DialogueSpeaker[]>([
    { id: 'spk-1', ...DEFAULT_SPEAKER_TEMPLATES[0] },
    { id: 'spk-2', ...DEFAULT_SPEAKER_TEMPLATES[1] },
  ]);
  const [turns, setTurns] = useState<DialogueTurn[]>([
    { id: 't1', speaker: 'Maya', text: SAMPLE_SCRIPTS.podcastA },
    { id: 't2', speaker: 'Arif', text: SAMPLE_SCRIPTS.podcastB },
  ]);
  const [activeTurnId, setActiveTurnId] = useState<string>('t1');

  // One Speaker · Multi-Voice Shifting state
  const [shiftSegments, setShiftSegments] = useState<VoiceShiftSegment[]>(() =>
    BANGLA_VOICE_SHIFT_DEMO.map((seg, i) => ({
      id: `seg-${i + 1}`,
      ...seg,
    }))
  );
  const [activeSegmentId, setActiveSegmentId] = useState<string>('seg-1');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string>('');
  const [generatedTitle, setGeneratedTitle] = useState<string>('voiceover.wav');
  const [generatedBase64, setGeneratedBase64] = useState<string>('');

  useEffect(() => {
    if (loadedAudioUrl) {
      setGeneratedAudioUrl(loadedAudioUrl);
      setGeneratedTitle(loadedTitle || 'saved-voiceover.wav');
      onClearLoaded?.();
    }
  }, [loadedAudioUrl, loadedTitle, onClearLoaded]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const insertVocalTag = (tag: string) => {
    if (studioMode === 'shift') {
      const targetId = activeSegmentId || shiftSegments[shiftSegments.length - 1]?.id;
      if (!targetId) return;
      setShiftSegments((prev) =>
        prev.map((seg) =>
          seg.id === targetId
            ? { ...seg, text: `${seg.text.trim()}${seg.text.trim() ? ' ' : ''}${tag} ` }
            : seg
        )
      );
      return;
    }

    if (studioMode === 'dialogue') {
      const targetId = activeTurnId || turns[turns.length - 1]?.id;
      if (!targetId) return;
      setTurns((prev) =>
        prev.map((t) =>
          t.id === targetId
            ? { ...t, text: `${t.text.trim()}${t.text.trim() ? ' ' : ''}${tag} ` }
            : t
        )
      );
      return;
    }

    const el = textareaRef.current;
    if (!el) {
      setScriptText((prev) => `${prev.trim()} ${tag} `);
      return;
    }
    const start = el.selectionStart ?? scriptText.length;
    const end = el.selectionEnd ?? scriptText.length;
    const next = `${scriptText.slice(0, start)} ${tag} ${scriptText.slice(end)}`;
    setScriptText(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = start + tag.length + 2;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleDesignVoiceFromPrompt = async () => {
    if (!voiceDesignPrompt.trim()) {
      setError('Describe the voice you want to design first.');
      return;
    }
    setError(null);
    setIsDesigningVoice(true);
    try {
      const res = await fetch('/api/voice-design-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: voiceDesignPrompt }),
      });
      const data = (await res.json()) as {
        baseVoice?: VoiceName;
        refinedStyle?: string;
        label?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Voice design failed.');

      const baseVoice = data.baseVoice || 'Kore';
      const refinedStyle = data.refinedStyle || voiceDesignPrompt.trim();
      const label = data.label || 'Designed Voice';

      const newPersona: CustomVoicePersona = {
        id: `design-${Date.now()}`,
        name: label,
        baseVoice,
        styleDirection: refinedStyle,
        summary: voiceDesignPrompt.trim(),
        createdAt: Date.now(),
      };

      setCustomPersonas((prev) => [newPersona, ...prev]);
      setSelectedPersonaId(newPersona.id);
      setSelectedVoice(baseVoice);
      setStyleDirection(refinedStyle);
      setExpressiveMode('expressive');
      setVoiceDesignPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to design voice.');
    } finally {
      setIsDesigningVoice(false);
    }
  };

  const handlePolishScript = async () => {
    setError(null);
    setIsPolishing(true);
    try {
      if (studioMode === 'single') {
        const res = await fetch('/api/script-assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: scriptText,
            format: 'narration',
          }),
        });
        const data = (await res.json()) as { script?: string; error?: string };
        if (!res.ok) throw new Error(data.error || 'Could not polish script.');
        if (data.script) setScriptText(data.script);
      } else {
        const draftSummary = turns.map((t) => `${t.speaker}: ${t.text}`).join('\n');
        const res = await fetch('/api/script-assist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft: draftSummary,
            format: 'dialogue',
            speakers: speakers.map((s) => s.name),
          }),
        });
        const data = (await res.json()) as {
          turns?: Array<{ speaker: string; text: string }>;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || 'Could not format dialogue.');
        if (Array.isArray(data.turns) && data.turns.length > 0) {
          const validNames = new Set(speakers.map((s) => s.name));
          const nextTurns = data.turns.map((t, i) => ({
            id: `turn-${Date.now()}-${i}`,
            speaker: validNames.has(t.speaker)
              ? t.speaker
              : speakers[i % speakers.length].name,
            text: t.text,
          }));
          setTurns(nextTurns);
          setActiveTurnId(nextTurns[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Script assist failed.');
    } finally {
      setIsPolishing(false);
    }
  };

  const buildComposedStyleDirection = () => {
    const modifiers: string[] = [];
    if (pace === 'slow') modifiers.push('measured slow pacing');
    if (pace === 'fast') modifiers.push('brisk, energetic pacing');
    if (emotionLevel === 'subtle') modifiers.push('subtle restrained emotion');
    if (emotionLevel === 'expressive') modifiers.push('rich emotional expression and natural inflection');

    const base = styleDirection.trim();
    if (modifiers.length === 0) return base;
    return base ? `${base}, with ${modifiers.join(' and ')}` : modifiers.join(', ');
  };

  const generateSpeech = async () => {
    setError(null);
    setIsGenerating(true);

    try {
      let response: Response;
      let label: string;
      let preview: string;

      if (studioMode === 'single') {
        if (!scriptText.trim()) {
          throw new Error('Please enter a script to synthesize.');
        }
        const composedStyle = buildComposedStyleDirection();
        response = await fetch('/api/tts/single', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: scriptText,
            voiceName: selectedVoice,
            style: composedStyle,
            mode: expressiveMode,
          }),
        });
        const persona = customPersonas.find((p) => p.id === selectedPersonaId);
        label = persona
          ? `${persona.name} (${selectedVoice}) · ${expressiveMode === 'expressive' ? 'Expressive' : 'Standard'}`
          : `${selectedVoice} · ${expressiveMode === 'expressive' ? 'Expressive' : 'Standard'}`;
        preview = scriptText.slice(0, 90);
      } else if (studioMode === 'shift') {
        const validSegs = shiftSegments.filter((s) => s.text.trim().length > 0);
        if (validSegs.length === 0) {
          throw new Error('Add at least one non-empty line for the voice-shifting speaker.');
        }
        response = await fetch('/api/tts/voice-shift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segments: validSegs.map((s) => ({
              voiceName: s.voiceName,
              style: s.style,
              text: s.text,
            })),
          }),
        });
        label = `Voice-Shifting Speaker · ${validSegs.length} tones`;
        preview = validSegs.map((s) => s.text).join(' ').slice(0, 90);
      } else {
        const validTurns = turns.filter((t) => t.text.trim().length > 0);
        if (validTurns.length === 0) {
          throw new Error('Add at least one non-empty dialogue line.');
        }
        response = await fetch('/api/tts/multispeaker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            speakers: speakers.map((s) => ({
              name: s.name,
              voiceName: s.voiceName,
              style: s.style,
            })),
            turns: validTurns.map((t) => ({ speaker: t.speaker, text: t.text })),
          }),
        });
        label = `${speakers.length} Speakers (${speakers
          .slice(0, 2)
          .map((s) => s.name)
          .join(', ')}${speakers.length > 2 ? '...' : ''})`;
        preview = validTurns.map((t) => `${t.speaker}: ${t.text}`).join(' ').slice(0, 90);
      }

      const data = (await response.json()) as Partial<TtsResponse> & { error?: string };
      if (!response.ok || !data.audioBase64) {
        throw new Error(data.error || 'Speech generation failed.');
      }

      const dataUrl = `data:audio/wav;base64,${data.audioBase64}`;
      const title =
        studioMode === 'single'
          ? `voxcraft-${selectedVoice.toLowerCase()}.wav`
          : studioMode === 'shift'
            ? 'voxcraft-voice-shift.wav'
            : `voxcraft-${speakers.length}speaker-mix.wav`;

      setGeneratedBase64(data.audioBase64);
      setGeneratedAudioUrl(dataUrl);
      setGeneratedTitle(title);

      onSaveHistory({
        title: title.replace('.wav', ''),
        voiceLabel: label,
        scriptPreview: preview,
        audioDataUrl: dataUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate speech.');
    } finally {
      setIsGenerating(false);
    }
  };

  const startSampleRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'm4a';
        setSampleFile(new File([blob], `voice-sample.${ext}`, { type: mimeType }));
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecordingSample(true);
      setSampleRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSampleRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setError('Microphone access was denied or unavailable.');
    }
  };

  const stopSampleRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingSample(false);
  };

  const createPersonaFromSample = async () => {
    if (!sampleFile) {
      setError('Upload or record a voice sample first.');
      return;
    }
    setError(null);
    setIsMatchingPersona(true);
    try {
      const formData = new FormData();
      formData.append('audio', sampleFile);
      formData.append('name', personaName.trim() || 'Custom Voice');

      const res = await fetch('/api/voice-persona-match', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json()) as {
        name?: string;
        baseVoice?: VoiceName;
        styleDirection?: string;
        summary?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Could not analyze voice sample.');

      const created: CustomVoicePersona = {
        id: `persona-${Date.now()}`,
        name: data.name || personaName.trim() || 'Custom Voice',
        baseVoice: data.baseVoice || 'Kore',
        styleDirection: data.styleDirection || 'Warm conversational tone',
        summary: data.summary || 'Matched from reference audio',
        createdAt: Date.now(),
      };

      setCustomPersonas((prev) => [created, ...prev]);
      setSelectedPersonaId(created.id);
      setSelectedVoice(created.baseVoice);
      setStyleDirection(created.styleDirection);
      setExpressiveMode('expressive');
      setSampleFile(null);
      setStudioMode('single');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to match voice persona.');
    } finally {
      setIsMatchingPersona(false);
    }
  };

  const addSpeaker = () => {
    if (speakers.length >= 10) return;
    const template = DEFAULT_SPEAKER_TEMPLATES[speakers.length] || {
      name: `Speaker ${speakers.length + 1}`,
      voiceName: speakers.length % 2 === 0 ? 'Kore' : 'Puck',
      style: 'Natural conversational voice',
    };
    const existingNames = new Set(speakers.map((s) => s.name));
    const uniqueName = existingNames.has(template.name)
      ? `Speaker ${speakers.length + 1}`
      : template.name;

    setSpeakers((prev) => [
      ...prev,
      {
        id: `spk-${Date.now()}-${prev.length}`,
        name: uniqueName,
        voiceName: template.voiceName,
        style: template.style,
      },
    ]);
  };

  const removeSpeaker = (id: string) => {
    if (speakers.length <= 2) return;
    const removed = speakers.find((s) => s.id === id);
    const remaining = speakers.filter((s) => s.id !== id);
    setSpeakers(remaining);
    if (removed) {
      setTurns((prev) =>
        prev.map((t) =>
          t.speaker === removed.name ? { ...t, speaker: remaining[0].name } : t
        )
      );
    }
  };

  const applyCastPreset = (count: 2 | 4 | 10) => {
    const nextSpeakers = DEFAULT_SPEAKER_TEMPLATES.slice(0, count).map((tpl, idx) => ({
      id: `spk-preset-${idx + 1}`,
      ...tpl,
    }));
    setSpeakers(nextSpeakers);

    if (count === 2) {
      setTurns([
        { id: 't-p1', speaker: nextSpeakers[0].name, text: SAMPLE_SCRIPTS.banglaPodcastA },
        { id: 't-p2', speaker: nextSpeakers[1].name, text: SAMPLE_SCRIPTS.banglaPodcastB },
      ]);
    } else if (count === 4) {
      setTurns([
        { id: 't-4-1', speaker: nextSpeakers[0].name, text: 'Welcome everyone to our panel discussion today! <breath>' },
        { id: 't-4-2', speaker: nextSpeakers[1].name, text: 'Glad to be here Maya! Let us talk about voice technology.' },
        { id: 't-4-3', speaker: nextSpeakers[2].name, text: 'From a storytelling perspective, |yeah| tone makes all the difference.' },
        { id: 't-4-4', speaker: nextSpeakers[3].name, text: 'Agreed. Having both male and female voices keeps listeners engaged.' },
      ]);
    } else {
      setTurns(
        nextSpeakers.map((spk, idx) => ({
          id: `t-10-${idx + 1}`,
          speaker: spk.name,
          text:
            idx === 0
              ? 'Hello everyone, I am Maya, opening our ten-speaker showcase.'
              : idx === 1
                ? 'And I am Arif! Notice how each speaker switches voice cleanly.'
                : `Hi, this is ${spk.name} speaking with a distinct ${getVoiceGender(spk.voiceName).toLowerCase()} voice.`,
        }))
      );
    }
    setActiveTurnId('');
  };

  const downloadWav = () => {
    if (!generatedAudioUrl) return;
    const a = document.createElement('a');
    a.href = generatedAudioUrl;
    a.download = generatedTitle;
    a.click();
  };

  const forwardToSrtStudio = async () => {
    if (!generatedAudioUrl) return;
    let blob: Blob;
    if (generatedBase64) {
      const binary = atob(generatedBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: 'audio/wav' });
    } else {
      const res = await fetch(generatedAudioUrl);
      blob = await res.blob();
    }
    const file = new File([blob], generatedTitle, { type: 'audio/wav' });
    onSendAudioToSrt(file);
  };

  const addDialogueTurn = () => {
    const lastSpeaker = turns[turns.length - 1]?.speaker;
    const currentIndex = speakers.findIndex((s) => s.name === lastSpeaker);
    const nextSpeaker = speakers[(currentIndex + 1) % speakers.length]?.name || speakers[0].name;
    const newId = `t-${Date.now()}`;
    setTurns((prev) => [...prev, { id: newId, speaker: nextSpeaker, text: '' }]);
    setActiveTurnId(newId);
  };

  return (
    <div className="space-y-6">
      {/* Studio Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => setStudioMode('single')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              studioMode === 'single'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Single Voice & Design
          </button>
          <button
            type="button"
            onClick={() => setStudioMode('shift')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              studioMode === 'shift'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Voice-Shifting Speaker
          </button>
          <button
            type="button"
            onClick={() => setStudioMode('dialogue')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              studioMode === 'dialogue'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Multi-Speaker (Up to 10)
          </button>
          <button
            type="button"
            onClick={() => setStudioMode('persona')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              studioMode === 'persona'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Clone Style from Audio
          </button>
        </div>

        {studioMode === 'single' && (
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setExpressiveMode('standard')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                expressiveMode === 'standard'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Standard (Fast)
            </button>
            <button
              type="button"
              onClick={() => setExpressiveMode('expressive')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                expressiveMode === 'expressive'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Voice Design (Expressive)
            </button>
          </div>
        )}
      </div>

      {studioMode === 'single' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: Prompt Voice Designer + Voice Selection */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            {/* Prompt-based Voice Design Box */}
            <div className="pb-4 border-b border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Design Voice from Prompt
                </h2>
                <span className="text-xs text-slate-500">Auto-selects Male/Female</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={voiceDesignPrompt}
                  onChange={(e) => setVoiceDesignPrompt(e.target.value)}
                  placeholder="e.g. Deep dramatic male narrator or soft Bangla female host..."
                  className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleDesignVoiceFromPrompt}
                  disabled={isDesigningVoice || !voiceDesignPrompt.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isDesigningVoice ? 'Designing...' : 'Design'}</span>
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  1. Choose Studio Voice
                </h2>
                <button
                  type="button"
                  onClick={() => setStudioMode('persona')}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap shrink-0"
                >
                  + Match Audio Sample
                </button>
              </div>

              {customPersonas.length > 0 && (
                <div className="mt-3 space-y-2 pb-3 border-b border-slate-100">
                  <p className="text-xs font-medium text-slate-500">
                    Designed & Saved Voices
                  </p>
                  {customPersonas.map((persona) => {
                    const active = selectedPersonaId === persona.id;
                    return (
                      <div
                        key={persona.id}
                        className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border transition-colors ${
                          active
                            ? 'border-blue-600 bg-blue-50/50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPersonaId(persona.id);
                            setSelectedVoice(persona.baseVoice);
                            setStyleDirection(persona.styleDirection);
                            setExpressiveMode('expressive');
                          }}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {persona.name}
                            </span>
                            <span className="text-xs text-slate-500 shrink-0">
                              {getVoiceGender(persona.baseVoice)} · {persona.baseVoice}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {persona.summary}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomPersonas((prev) =>
                              prev.filter((p) => p.id !== persona.id)
                            );
                            if (selectedPersonaId === persona.id) {
                              setSelectedPersonaId(null);
                            }
                          }}
                          title="Delete designed voice"
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 space-y-2">
                {STUDIO_VOICES.map((voice) => {
                  const active = selectedPersonaId === null && selectedVoice === voice.id;
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => {
                        setSelectedPersonaId(null);
                        setSelectedVoice(voice.id);
                        setStyleDirection(voice.samplePrompt);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50/50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {voice.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {voice.gender} · {voice.tone}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {voice.bestFor}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label
                  htmlFor="voice-style-input"
                  className="block text-xs font-medium text-slate-600 mb-1.5"
                >
                  Voice Acting Direction (Emotion, Tone, Accent)
                </label>
                <input
                  id="voice-style-input"
                  type="text"
                  value={styleDirection}
                  onChange={(e) => setStyleDirection(e.target.value)}
                  placeholder="e.g. Warm, emotional Bengali storyteller"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {STYLE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setStyleDirection(preset.style)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="block text-xs font-medium text-slate-600 mb-1.5">
                    Speaking Pace
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                    {(['slow', 'natural', 'fast'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPace(p)}
                        className={`py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                          pace === p
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-600 mb-1.5">
                    Emotion Level
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                    {(['subtle', 'balanced', 'expressive'] as const).map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setEmotionLevel(em)}
                        className={`py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                          emotionLevel === em
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {em === 'expressive' ? 'Rich' : em}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Script Editor */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  2. Voiceover Script
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScriptText(SAMPLE_SCRIPTS.bangla);
                      setStyleDirection(
                        'Warm, emotional Bengali storyteller with expressive pauses and natural rhythm'
                      );
                    }}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    Bangla Sample
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptText(SAMPLE_SCRIPTS.english)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    English Sample
                  </button>
                  <button
                    type="button"
                    onClick={handlePolishScript}
                    disabled={isPolishing || !scriptText.trim()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>{isPolishing ? 'Polishing...' : 'Polish Script'}</span>
                  </button>
                </div>
              </div>

              <textarea
                ref={textareaRef}
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                rows={14}
                placeholder="Write or paste your Bangla or English script here..."
                className="w-full p-3.5 text-sm leading-relaxed bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500 mr-1">Insert reaction:</span>
                  {VOCAL_TAGS.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => {
                        if (expressiveMode !== 'expressive') setExpressiveMode('expressive');
                        insertVocalTag(item.tag);
                      }}
                      className="px-2 py-1 text-xs font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                    >
                      {item.tag}
                    </button>
                  ))}
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {scriptText.length} chars
                </span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-500">
                24 kHz WAV · {selectedVoice} ({getVoiceGender(selectedVoice)}) ·{' '}
                {expressiveMode === 'expressive' ? 'Voice Design' : 'Standard'}
              </p>
              <button
                type="button"
                onClick={generateSpeech}
                disabled={isGenerating || !scriptText.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Volume2 className="w-4 h-4" />
                <span>{isGenerating ? 'Synthesizing Voice...' : 'Generate Voice'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {studioMode === 'dialogue' && (
        /* Multi-Speaker Studio (2 up to 10 Speakers, Male & Female Voice Switching) */
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Speakers Cast ({speakers.length}/10)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add up to 10 characters with distinct Male &amp; Female voices and acting styles
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyCastPreset(2)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Female + Male Duo
                </button>
                <button
                  type="button"
                  onClick={() => applyCastPreset(4)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  4-Speaker Panel
                </button>
                <button
                  type="button"
                  onClick={() => applyCastPreset(10)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  10-Speaker Cast
                </button>
                <button
                  type="button"
                  onClick={addSpeaker}
                  disabled={speakers.length >= 10}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Speaker</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {speakers.map((spk, idx) => (
                <div
                  key={spk.id || idx}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono tabular-nums font-medium text-slate-500">
                      Speaker {idx + 1} · {getVoiceGender(spk.voiceName)}
                    </span>
                    {speakers.length > 2 && spk.id && (
                      <button
                        type="button"
                        onClick={() => removeSpeaker(spk.id!)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        title="Remove speaker"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={spk.name}
                      onChange={(e) => {
                        const oldName = spk.name;
                        const nextName = e.target.value;
                        setSpeakers((prev) =>
                          prev.map((item, sIdx) =>
                            sIdx === idx ? { ...item, name: nextName } : item
                          )
                        );
                        setTurns((prev) =>
                          prev.map((t) =>
                            t.speaker === oldName ? { ...t, speaker: nextName } : t
                          )
                        );
                      }}
                      placeholder="Character name"
                      className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={spk.voiceName}
                      onChange={(e) =>
                        setSpeakers((prev) =>
                          prev.map((item, sIdx) =>
                            sIdx === idx
                              ? { ...item, voiceName: e.target.value as VoiceName }
                              : item
                          )
                        )
                      }
                      aria-label={`Speaker ${idx + 1} voice`}
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {STUDIO_VOICES.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.gender})
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    type="text"
                    value={spk.style}
                    onChange={(e) =>
                      setSpeakers((prev) =>
                        prev.map((item, sIdx) =>
                          sIdx === idx ? { ...item, style: e.target.value } : item
                        )
                      )
                    }
                    placeholder="Voice style (e.g. Calm female narrator, Excited male host)"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Multi-Speaker Turns */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Multi-Speaker Script Lines
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Each line switches automatically to the selected Male or Female speaker voice
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const fSpk = speakers.find((s) => getVoiceGender(s.voiceName) === 'Female') || speakers[0];
                    const mSpk = speakers.find((s) => getVoiceGender(s.voiceName) === 'Male') || speakers[1] || speakers[0];
                    const nextTurns = [
                      { id: 'bp1', speaker: fSpk.name, text: SAMPLE_SCRIPTS.banglaPodcastA },
                      { id: 'bp2', speaker: mSpk.name, text: SAMPLE_SCRIPTS.banglaPodcastB },
                    ];
                    setTurns(nextTurns);
                    setActiveTurnId('bp1');
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Bangla Female/Male Sample
                </button>
                <button
                  type="button"
                  onClick={handlePolishScript}
                  disabled={isPolishing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isPolishing ? 'Formatting...' : 'Expand Script'}</span>
                </button>
                <button
                  type="button"
                  onClick={addDialogueTurn}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {turns.map((turn, idx) => (
                <div key={turn.id} className="flex items-start gap-3">
                  <select
                    value={turn.speaker}
                    onChange={(e) =>
                      setTurns((prev) =>
                        prev.map((t) =>
                          t.id === turn.id ? { ...t, speaker: e.target.value } : t
                        )
                      )
                    }
                    aria-label={`Line ${idx + 1} speaker`}
                    className="w-36 px-2.5 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-800 shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {speakers.map((s, sIdx) => (
                      <option key={s.id || sIdx} value={s.name}>
                        {s.name} ({getVoiceGender(s.voiceName)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={turn.text}
                    onFocus={() => setActiveTurnId(turn.id)}
                    onChange={(e) =>
                      setTurns((prev) =>
                        prev.map((t) =>
                          t.id === turn.id ? { ...t, text: e.target.value } : t
                        )
                      )
                    }
                    placeholder="Enter dialogue line..."
                    className={`flex-1 px-3 py-2 text-sm bg-white border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      activeTurnId === turn.id ? 'border-blue-400' : 'border-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setTurns((prev) => prev.filter((t) => t.id !== turn.id))
                    }
                    disabled={turns.length <= 1}
                    className="p-2 text-slate-400 hover:text-red-600 disabled:opacity-30 rounded-lg transition-colors"
                    title="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 mr-1">Insert reaction:</span>
                {VOCAL_TAGS.map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => insertVocalTag(item.tag)}
                    className="px-2 py-1 text-xs font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    {item.tag}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={generateSpeech}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Volume2 className="w-4 h-4" />
                <span>
                  {isGenerating
                    ? `Synthesizing ${speakers.length}-Speaker Mix...`
                    : 'Generate Multi-Speaker Audio'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {studioMode === 'shift' && (
        /* Single Speaker shifting across different vocal tones, characters, & moods */
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                One Speaker · Multi-Voice Shifting
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Let one storyteller switch seamlessly between narrating, whispering, cheerful youth, deep dramatic male, or gentle female tones line by line
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const demo = BANGLA_VOICE_SHIFT_DEMO.map((seg, i) => ({
                    id: `seg-demo-${Date.now()}-${i}`,
                    ...seg,
                  }));
                  setShiftSegments(demo);
                  setActiveSegmentId(demo[0].id);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Bangla Story Demo
              </button>
              <button
                type="button"
                onClick={() => {
                  const preset = VOICE_SHIFT_PRESETS[shiftSegments.length % VOICE_SHIFT_PRESETS.length];
                  const newId = `seg-${Date.now()}`;
                  setShiftSegments((prev) => [
                    ...prev,
                    {
                      id: newId,
                      presetLabel: preset.label,
                      voiceName: preset.voiceName,
                      style: preset.style,
                      text: '',
                    },
                  ]);
                  setActiveSegmentId(newId);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Voice Segment</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {shiftSegments.map((seg, idx) => (
              <div
                key={seg.id}
                className={`p-3.5 rounded-lg border space-y-2.5 transition-colors ${
                  activeSegmentId === seg.id
                    ? 'border-blue-400 bg-blue-50/20'
                    : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      #{idx + 1}
                    </span>
                    <select
                      value={seg.presetLabel}
                      onChange={(e) => {
                        const chosen = VOICE_SHIFT_PRESETS.find((p) => p.label === e.target.value);
                        if (!chosen) return;
                        setShiftSegments((prev) =>
                          prev.map((item) =>
                            item.id === seg.id
                              ? {
                                  ...item,
                                  presetLabel: chosen.label,
                                  voiceName: chosen.voiceName,
                                  style: chosen.style,
                                }
                              : item
                          )
                        );
                      }}
                      aria-label={`Segment ${idx + 1} voice character`}
                      className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {VOICE_SHIFT_PRESETS.map((p) => (
                        <option key={p.label} value={p.label}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={seg.style}
                      onChange={(e) =>
                        setShiftSegments((prev) =>
                          prev.map((item) =>
                            item.id === seg.id ? { ...item, style: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Custom tone/emotion for this line..."
                      className="w-64 sm:w-80 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setShiftSegments((prev) => prev.filter((item) => item.id !== seg.id))
                    }
                    disabled={shiftSegments.length <= 1}
                    className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30 rounded transition-colors"
                    title="Remove segment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <textarea
                  rows={2}
                  value={seg.text}
                  onFocus={() => setActiveSegmentId(seg.id)}
                  onChange={(e) =>
                    setShiftSegments((prev) =>
                      prev.map((item) =>
                        item.id === seg.id ? { ...item, text: e.target.value } : item
                      )
                    )
                  }
                  placeholder="Write Bangla or English line for this voice tone..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 mr-1">Insert reaction:</span>
              {VOCAL_TAGS.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => insertVocalTag(item.tag)}
                  className="px-2 py-1 text-xs font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {item.tag}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={generateSpeech}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Volume2 className="w-4 h-4" />
              <span>
                {isGenerating ? 'Synthesizing Voice Shifts...' : 'Generate Voice-Shifting Audio'}
              </span>
            </button>
          </div>
        </div>
      )}

      {studioMode === 'persona' && (
        /* Reference Voice Persona Matcher */
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Match Voice Style from Reference Audio
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Upload or record a 5–20 second sample of any voice. The studio analyzes its pitch, pace, warmth, and cadence, matches the closest studio voice model, and saves a reusable custom persona.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="persona-name-input"
                  className="block text-xs font-medium text-slate-600 mb-1.5"
                >
                  Persona Name
                </label>
                <input
                  id="persona-name-input"
                  type="text"
                  value={personaName}
                  onChange={(e) => setPersonaName(e.target.value)}
                  placeholder="e.g. Dhaka Tech Host"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <input
                  ref={sampleInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setSampleFile(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => sampleInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Voice Sample</span>
                </button>

                {!isRecordingSample ? (
                  <button
                    type="button"
                    onClick={startSampleRecording}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Record Sample</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopSampleRecording}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span className="font-mono tabular-nums">
                      Stop ({formatDisplayTime(sampleRecordSeconds)})
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Reference Sample</p>
                <p className="text-sm font-medium text-slate-900 mt-1 truncate">
                  {sampleFile ? sampleFile.name : 'No audio sample selected yet'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {sampleFile
                    ? `${(sampleFile.size / 1024).toFixed(1)} KB ready for vocal profile extraction`
                    : 'Clear speech in Bangla or English gives the best vocal match'}
                </p>
              </div>

              <button
                type="button"
                onClick={createPersonaFromSample}
                disabled={isMatchingPersona || !sampleFile}
                className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                <UserCheck className="w-4 h-4" />
                <span>
                  {isMatchingPersona
                    ? 'Analyzing Vocal Style...'
                    : 'Analyze & Save Voice Persona'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isGenerating && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="h-5 w-44 bg-slate-200 rounded animate-pulse" />
          <div className="h-14 w-full bg-slate-100 rounded-lg animate-pulse" />
        </div>
      )}

      {/* Generated Audio Output */}
      {!isGenerating && generatedAudioUrl && (
        <div className="space-y-3">
          <WaveformPlayer
            audioUrl={generatedAudioUrl}
            fileName={generatedTitle}
            onDownload={downloadWav}
            downloadLabel="Download .WAV"
          />

          <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Need synchronized captions for this voiceover? Send it directly to the SRT Subtitle Generator.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={downloadWav}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save WAV</span>
              </button>
              <button
                type="button"
                onClick={forwardToSrtStudio}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Subtitles className="w-3.5 h-3.5" />
                <span>Generate .SRT from this Voice</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

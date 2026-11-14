import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Mic,
  Square,
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
  Scissors,
  Play,
  FileAudio,
  Search,
  AlertCircle,
  Subtitles,
} from 'lucide-react';
import { WaveformPlayer } from './WaveformPlayer';
import type { SrtCue, SrtGenerationResult } from '../types/studio';
import {
  buildPlainTextString,
  buildSrtString,
  buildVttString,
  formatDisplayTime,
  secondsToSrtTimestamp,
  srtTimestampToSeconds,
} from '../utils/srt';

interface SrtStudioProps {
  externalFile?: File | null;
  onExternalFileConsumed?: () => void;
  loadedCues?: SrtCue[] | null;
  loadedTitle?: string | null;
  onClearLoaded?: () => void;
  onSaveHistory: (item: {
    title: string;
    cues: SrtCue[];
    language: string;
  }) => void;
  cues: SrtCue[];
  setCues: React.Dispatch<React.SetStateAction<SrtCue[]>>;
}

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'Bengali', label: 'Bengali (বাংলা)' },
  { value: 'English', label: 'English' },
  { value: 'Hindi', label: 'Hindi (हिन्दी)' },
  { value: 'Arabic', label: 'Arabic' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'French', label: 'French' },
  { value: 'Japanese', label: 'Japanese' },
];

const TRANSLATE_TARGETS = [
  { value: 'none', label: 'Keep original language' },
  { value: 'English', label: 'Translate to English' },
  { value: 'Bengali', label: 'Translate to Bengali (বাংলা)' },
  { value: 'Hindi', label: 'Translate to Hindi' },
];

export const SrtStudio: React.FC<SrtStudioProps> = ({
  externalFile,
  onExternalFileConsumed,
  loadedCues,
  loadedTitle,
  onClearLoaded,
  onSaveHistory,
  cues,
  setCues,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [language, setLanguage] = useState('auto');
  const [translateTo, setTranslateTo] = useState('none');
  const [maxCharsPerLine, setMaxCharsPerLine] = useState(42);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string>('');
  const [projectTitle, setProjectTitle] = useState<string>('Untitled Subtitles');

  // Manage object URL lifecycle
  useEffect(() => {
    if (!audioFile) {
      setAudioUrl('');
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    setProjectTitle(audioFile.name.replace(/\.[^/.]+$/, '') || 'Audio Subtitles');
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [audioFile]);

  // Accept file forwarded from Voice Studio
  useEffect(() => {
    if (externalFile) {
      setAudioFile(externalFile);
      setError(null);
      onExternalFileConsumed?.();
    }
  }, [externalFile, onExternalFileConsumed]);

  // Accept history item loaded from HistoryView
  useEffect(() => {
    if (loadedCues && loadedCues.length > 0) {
      setCues(loadedCues);
      if (loadedTitle) setProjectTitle(loadedTitle);
      setError(null);
      onClearLoaded?.();
    }
  }, [loadedCues, loadedTitle, onClearLoaded, setCues]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const handleSelectFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setError('File exceeds 25 MB limit. Please trim or compress the audio below 25 MB.');
      return;
    }
    setError(null);
    setAudioFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleSelectFile(file);
  };

  const startRecording = async () => {
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
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'm4a';
        const recordedFile = new File(
          [blob],
          `mic-recording-${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.${ext}`,
          { type: mimeType }
        );
        setAudioFile(recordedFile);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setError('Microphone access was denied or unavailable in this browser.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const generateSrt = async () => {
    if (!audioFile) {
      setError('Upload an audio file or record from your microphone first.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('language', language);
      formData.append('translateTo', translateTo);
      formData.append('maxCharsPerLine', String(maxCharsPerLine));

      const response = await fetch('/api/transcribe-srt', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as Partial<SrtGenerationResult> & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to transcribe audio.');
      }

      const nextCues = payload.cues ?? [];
      setCues(nextCues);
      const lang = payload.detectedLanguage || (language === 'auto' ? 'Auto-detected' : language);
      setDetectedLanguage(lang);

      onSaveHistory({
        title: audioFile.name.replace(/\.[^/.]+$/, '') || 'Untitled Subtitles',
        cues: nextCues,
        language: translateTo !== 'none' ? `${lang} → ${translateTo}` : lang,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const activeCueId = useMemo(() => {
    const match = cues.find(
      (c) => currentTime >= c.startSeconds && currentTime <= c.endSeconds
    );
    return match?.id ?? null;
  }, [cues, currentTime]);

  const activeCue = useMemo(
    () => cues.find((c) => c.id === activeCueId) ?? null,
    [cues, activeCueId]
  );

  const filteredCues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cues;
    return cues.filter((c) => c.text.toLowerCase().includes(q));
  }, [cues, searchQuery]);

  const updateCueText = (id: number, text: string) => {
    setCues((prev) => prev.map((c) => (c.id === id ? { ...c, text } : c)));
  };

  const updateCueTiming = (id: number, field: 'startTime' | 'endTime', value: string) => {
    setCues((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const parsed = srtTimestampToSeconds(value);
        if (field === 'startTime') {
          return {
            ...c,
            startTime: value,
            startSeconds: parsed,
          };
        }
        return {
          ...c,
          endTime: value,
          endSeconds: parsed,
        };
      })
    );
  };

  const normalizeCueTiming = (id: number) => {
    setCues((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const start = Math.max(0, srtTimestampToSeconds(c.startTime));
        const end = Math.max(start + 0.2, srtTimestampToSeconds(c.endTime));
        return {
          ...c,
          startSeconds: start,
          endSeconds: end,
          startTime: secondsToSrtTimestamp(start),
          endTime: secondsToSrtTimestamp(end),
        };
      })
    );
  };

  const splitCue = (id: number) => {
    setCues((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const target = prev[idx];
      const midSeconds = Number(((target.startSeconds + target.endSeconds) / 2).toFixed(3));
      const words = target.text.trim().split(/\s+/);
      const half = Math.max(1, Math.ceil(words.length / 2));
      const firstText = words.slice(0, half).join(' ');
      const secondText = words.slice(half).join(' ') || '...';

      const firstCue: SrtCue = {
        ...target,
        endSeconds: midSeconds,
        endTime: secondsToSrtTimestamp(midSeconds),
        text: firstText,
      };
      const secondCue: SrtCue = {
        id: target.id + 1,
        startSeconds: midSeconds,
        endSeconds: Math.max(midSeconds + 0.5, target.endSeconds),
        startTime: secondsToSrtTimestamp(midSeconds),
        endTime: secondsToSrtTimestamp(Math.max(midSeconds + 0.5, target.endSeconds)),
        text: secondText,
      };

      const updated = [...prev.slice(0, idx), firstCue, secondCue, ...prev.slice(idx + 1)];
      return updated.map((c, i) => ({ ...c, id: i + 1 }));
    });
  };

  const deleteCue = (id: number) => {
    setCues((prev) =>
      prev.filter((c) => c.id !== id).map((c, idx) => ({ ...c, id: idx + 1 }))
    );
  };

  const addCue = () => {
    setCues((prev) => {
      const last = prev[prev.length - 1];
      const start = last ? last.endSeconds + 0.1 : 0;
      const end = start + 2.5;
      return [
        ...prev,
        {
          id: prev.length + 1,
          startSeconds: start,
          endSeconds: end,
          startTime: secondsToSrtTimestamp(start),
          endTime: secondsToSrtTimestamp(end),
          text: 'New subtitle line',
        },
      ];
    });
  };

  const triggerDownload = (content: string, ext: 'srt' | 'vtt' | 'txt') => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectTitle}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySrtToClipboard = async () => {
    if (cues.length === 0) return;
    await navigator.clipboard.writeText(buildSrtString(cues));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const totalDurationSeconds = cues.length > 0 ? cues[cues.length - 1].endSeconds : 0;

  return (
    <div className="space-y-6">
      {/* Top Intake & Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Audio Source Panel */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  1. Upload or Record Audio
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  MP3, WAV, M4A, OGG, WebM, or MP4 up to 25 MB
                </p>
              </div>

              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Record Mic</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span className="font-mono tabular-nums">
                    Stop ({formatDisplayTime(recordingSeconds)})
                  </span>
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`border border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/50'
                  : 'border-slate-300 bg-slate-50/70 hover:border-slate-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.ogg,.flac,.aac"
                className="hidden"
                onChange={(e) => handleSelectFile(e.target.files?.[0])}
              />
              {audioFile ? (
                <div className="flex flex-col items-center gap-1.5">
                  <FileAudio className="w-7 h-7 text-blue-600" />
                  <p className="text-sm font-medium text-slate-900 truncate max-w-full">
                    {audioFile.name}
                  </p>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">
                    {(audioFile.size / (1024 * 1024)).toFixed(2)} MB · Click to replace file
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <Upload className="w-7 h-7 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">
                    Drop an audio or video file here, or click to browse
                  </p>
                  <p className="text-xs text-slate-500">
                    Supports Bangla, English, Hindi, and 50+ spoken languages
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Subtitle Configuration Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              2. Subtitle Settings
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
              <div>
                <label
                  htmlFor="srt-source-lang"
                  className="block text-xs font-medium text-slate-600 mb-1.5"
                >
                  Spoken Language
                </label>
                <select
                  id="srt-source-lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="srt-translate-lang"
                  className="block text-xs font-medium text-slate-600 mb-1.5"
                >
                  Output Translation
                </label>
                <select
                  id="srt-translate-lang"
                  value={translateTo}
                  onChange={(e) => setTranslateTo(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TRANSLATE_TARGETS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Line Length
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg">
                  {[
                    { chars: 32, label: 'Compact (32)' },
                    { chars: 42, label: 'Standard (42)' },
                    { chars: 56, label: 'Wide (56)' },
                  ].map((opt) => (
                    <button
                      key={opt.chars}
                      type="button"
                      onClick={() => setMaxCharsPerLine(opt.chars)}
                      className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        maxCharsPerLine === opt.chars
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={generateSrt}
            disabled={isProcessing || !audioFile}
            className="mt-5 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {isProcessing ? 'Transcribing & Syncing Timestamps...' : 'Generate SRT Subtitles'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Waveform & Live Subtitle Monitor */}
      {audioUrl && (
        <div className="space-y-3">
          <WaveformPlayer
            audioUrl={audioUrl}
            fileName={audioFile?.name}
            onTimeUpdate={setCurrentTime}
            seekToSeconds={seekTarget}
          />
          {cues.length > 0 && (
            <div className="bg-slate-900 text-white rounded-xl px-5 py-3.5 text-center min-h-[56px] flex items-center justify-center">
              <p className="text-sm sm:text-base font-medium leading-relaxed">
                {activeCue ? activeCue.text : 'Play audio to preview synced subtitles here'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Loading Skeleton */}
      {isProcessing && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="h-11 w-full bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Interactive SRT Cue Editor */}
      {!isProcessing && cues.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Subtitle Cue Editor
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                {cues.length} cues · {formatDisplayTime(totalDurationSeconds)} total
                {detectedLanguage ? ` · ${detectedLanguage}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter cues..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                />
              </div>

              <button
                type="button"
                onClick={addCue}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Cue</span>
              </button>

              <button
                type="button"
                onClick={copySrtToClipboard}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy SRT'}</span>
              </button>

              <button
                type="button"
                onClick={() => triggerDownload(buildPlainTextString(cues), 'txt')}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                .TXT
              </button>

              <button
                type="button"
                onClick={() => triggerDownload(buildVttString(cues), 'vtt')}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                .VTT
              </button>

              <button
                type="button"
                onClick={() => triggerDownload(buildSrtString(cues), 'srt')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .SRT</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
            {filteredCues.map((cue) => {
              const isActive = cue.id === activeCueId;
              return (
                <div
                  key={cue.id}
                  className={`px-5 py-3 flex flex-col md:flex-row md:items-center gap-3 transition-colors ${
                    isActive ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="w-7 text-xs font-mono tabular-nums text-slate-400 text-right">
                      {cue.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSeekTarget(cue.startSeconds)}
                      title="Play from this cue"
                      className="w-7 h-7 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 flex items-center justify-center transition-colors shrink-0"
                    >
                      <Play className="w-3 h-3 ml-0.5" />
                    </button>
                    <input
                      type="text"
                      value={cue.startTime}
                      onChange={(e) => updateCueTiming(cue.id, 'startTime', e.target.value)}
                      onBlur={() => normalizeCueTiming(cue.id)}
                      aria-label={`Cue ${cue.id} start time`}
                      className="w-28 px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-slate-300 text-xs">→</span>
                    <input
                      type="text"
                      value={cue.endTime}
                      onChange={(e) => updateCueTiming(cue.id, 'endTime', e.target.value)}
                      onBlur={() => normalizeCueTiming(cue.id)}
                      aria-label={`Cue ${cue.id} end time`}
                      className="w-28 px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={cue.text}
                      onChange={(e) => updateCueText(cue.id, e.target.value)}
                      aria-label={`Cue ${cue.id} text`}
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => splitCue(cue.id)}
                      title="Split cue in half"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCue(cue.id)}
                      title="Delete cue"
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isProcessing && cues.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Subtitles className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-900">
            Ready for Audio Transcription
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
            Upload an audio track or record directly from your microphone, then click Generate SRT Subtitles to create editable, synced captions.
          </p>
        </div>
      )}
    </div>
  );
};

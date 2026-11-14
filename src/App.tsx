import { useEffect, useState } from 'react';
import { Subtitles, AudioLines, Clock } from 'lucide-react';
import { SrtStudio } from './components/SrtStudio';
import { VoiceStudio } from './components/VoiceStudio';
import { HistoryView } from './components/HistoryView';
import type { HistoryItem, SrtCue, StudioTab } from './types/studio';
import { buildSrtString } from './utils/srt';

const STORAGE_KEY = 'voxcraft_studio_history_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<StudioTab>('srt');

  // Shared SRT state so user can switch tabs without losing edits
  const [cues, setCues] = useState<SrtCue[]>([]);
  const [forwardedAudioFile, setForwardedAudioFile] = useState<File | null>(null);
  const [loadedSrtCues, setLoadedSrtCues] = useState<SrtCue[] | null>(null);
  const [loadedSrtTitle, setLoadedSrtTitle] = useState<string | null>(null);
  const [loadedVoiceUrl, setLoadedVoiceUrl] = useState<string | null>(null);
  const [loadedVoiceTitle, setLoadedVoiceTitle] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      return JSON.parse(saved) as HistoryItem[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      // Store SRT items fully; omit large audioDataUrl blobs from localStorage if huge
      const serializable = history.slice(0, 15).map((item) => {
        if (item.type === 'voice' && item.audioDataUrl && item.audioDataUrl.length > 400_000) {
          return { ...item, audioDataUrl: undefined };
        }
        return item;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // Ignore storage quota issues gracefully
    }
  }, [history]);

  const handleSaveSrtHistory = (payload: {
    title: string;
    cues: SrtCue[];
    language: string;
  }) => {
    const entry: HistoryItem = {
      id: `srt-${Date.now()}`,
      type: 'srt',
      title: payload.title,
      subtitle: `${payload.cues.length} cues · ${payload.language}`,
      createdAt: Date.now(),
      cues: payload.cues,
      language: payload.language,
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const handleSaveVoiceHistory = (payload: {
    title: string;
    voiceLabel: string;
    scriptPreview: string;
    audioDataUrl: string;
  }) => {
    const entry: HistoryItem = {
      id: `voice-${Date.now()}`,
      type: 'voice',
      title: payload.title,
      subtitle: payload.voiceLabel,
      createdAt: Date.now(),
      voiceLabel: payload.voiceLabel,
      scriptPreview: payload.scriptPreview,
      audioDataUrl: payload.audioDataUrl,
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const handleSendVoiceToSrt = (file: File) => {
    setForwardedAudioFile(file);
    setActiveTab('srt');
  };

  const handleLoadHistoryItem = (item: HistoryItem) => {
    if (item.type === 'srt' && item.cues) {
      setLoadedSrtCues(item.cues);
      setLoadedSrtTitle(item.title);
      setActiveTab('srt');
    } else if (item.type === 'voice' && item.audioDataUrl) {
      setLoadedVoiceUrl(item.audioDataUrl);
      setLoadedVoiceTitle(`${item.title}.wav`);
      setActiveTab('voice');
    }
  };

  const exportCurrentSrt = () => {
    if (cues.length === 0) {
      setActiveTab('voice');
      return;
    }
    const blob = new Blob([buildSrtString(cues)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subtitles.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const navItems: Array<{ id: StudioTab; label: string; icon: typeof Subtitles }> = [
    { id: 'srt', label: 'Audio to SRT', icon: Subtitles },
    { id: 'voice', label: 'Voice Studio', icon: AudioLines },
    { id: 'history', label: 'History', icon: Clock },
  ];

  const pageHeader =
    activeTab === 'srt'
      ? {
          breadcrumb: 'Workspace / Audio to SRT',
          title: 'Audio to SRT Subtitle Generator',
          description:
            'Upload audio or record directly from your mic to generate synced, editable SubRip (.srt) and WebVTT (.vtt) captions.',
        }
      : activeTab === 'voice'
        ? {
            breadcrumb: 'Workspace / Voice Studio',
            title: 'AI Voice & Podcast Studio',
            description:
              'Synthesize expressive single-speaker narration or dual-speaker podcast dialogue with natural pacing and studio WAV export.',
          }
        : {
            breadcrumb: 'Workspace / History',
            title: 'Recent Exports & Sessions',
            description:
              'Reopen subtitle timelines or download recent AI voiceovers generated during your sessions.',
          };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('srt');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          VoxCraft Studio
        </a>

        <nav className="flex items-center gap-6 overflow-x-auto">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          {activeTab === 'srt' && cues.length > 0 ? (
            <button
              type="button"
              onClick={exportCurrentSrt}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Export .SRT
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'voice' ? 'srt' : 'voice')}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {activeTab === 'voice' ? 'Open SRT Studio' : 'Open Voice Studio'}
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto flex flex-col lg:flex-row gap-8 px-4 sm:px-6 py-6">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:flex lg:w-60 shrink-0 flex-col justify-between">
          <div className="space-y-6">
            <div className="space-y-1">
              <p className="px-3 text-xs font-medium text-slate-400 mb-2">
                Production Tools
              </p>
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white text-slate-900 border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 ${
                          active ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      />
                      <span>{item.label}</span>
                    </span>
                    {item.id === 'history' && history.length > 0 && (
                      <span className="text-xs font-mono tabular-nums text-slate-400">
                        {history.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-200 pt-5 px-3 space-y-3">
              <p className="text-xs font-semibold text-slate-700">
                Connected Workflow
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Generate narration or podcast dialogue in Voice Studio, then send the audio straight to Audio to SRT for synchronized captions.
              </p>
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 min-w-0 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <p className="text-xs font-medium text-slate-500">
              {pageHeader.breadcrumb}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1 text-balance">
              {pageHeader.title}
            </h1>
            <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
              {pageHeader.description}
            </p>
          </div>

          {activeTab === 'srt' && (
            <SrtStudio
              externalFile={forwardedAudioFile}
              onExternalFileConsumed={() => setForwardedAudioFile(null)}
              loadedCues={loadedSrtCues}
              loadedTitle={loadedSrtTitle}
              onClearLoaded={() => {
                setLoadedSrtCues(null);
                setLoadedSrtTitle(null);
              }}
              onSaveHistory={handleSaveSrtHistory}
              cues={cues}
              setCues={setCues}
            />
          )}

          {activeTab === 'voice' && (
            <VoiceStudio
              onSendAudioToSrt={handleSendVoiceToSrt}
              onSaveHistory={handleSaveVoiceHistory}
              loadedAudioUrl={loadedVoiceUrl}
              loadedTitle={loadedVoiceTitle}
              onClearLoaded={() => {
                setLoadedVoiceUrl(null);
                setLoadedVoiceTitle(null);
              }}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              items={history}
              onLoadItem={handleLoadHistoryItem}
              onDeleteItem={(id) =>
                setHistory((prev) => prev.filter((item) => item.id !== id))
              }
              onClearAll={() => setHistory([])}
            />
          )}
        </main>
      </div>
    </div>
  );
}

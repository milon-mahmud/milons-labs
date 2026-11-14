import React from 'react';
import { Download, Trash2, ArrowUpRight, Clock } from 'lucide-react';
import type { HistoryItem } from '../types/studio';
import { buildSrtString } from '../utils/srt';

interface HistoryViewProps {
  items: HistoryItem[];
  onLoadItem: (item: HistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  items,
  onLoadItem,
  onDeleteItem,
  onClearAll,
}) => {
  const downloadItem = (item: HistoryItem) => {
    if (item.type === 'srt' && item.cues) {
      const blob = new Blob([buildSrtString(item.cues)], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title}.srt`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (item.type === 'voice' && item.audioDataUrl) {
      const a = document.createElement('a');
      a.href = item.audioDataUrl;
      a.download = `${item.title}.wav`;
      a.click();
    }
  };

  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-900">No Recent Exports Yet</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
          Your generated SRT subtitle tracks and AI voiceover clips will appear here for quick re-download or editing.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Session & Saved History
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            {items.length} items stored locally in your browser
          </p>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Clear History
        </button>
      </div>

      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <div
            key={item.id}
            className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {item.title}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {item.type === 'srt' ? 'SRT Subtitles' : 'AI Voiceover'} · {item.subtitle} ·{' '}
                <span className="font-mono tabular-nums">
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onLoadItem(item)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Open</span>
              </button>
              <button
                type="button"
                onClick={() => downloadItem(item)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{item.type === 'srt' ? '.SRT' : '.WAV'}</span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteItem(item.id)}
                title="Remove from history"
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

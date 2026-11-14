import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, Download } from 'lucide-react';
import { formatDisplayTime } from '../utils/srt';

interface WaveformPlayerProps {
  audioUrl: string;
  fileName?: string;
  onTimeUpdate?: (seconds: number) => void;
  seekToSeconds?: number | null;
  onDownload?: () => void;
  downloadLabel?: string;
}

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  audioUrl,
  fileName,
  onTimeUpdate,
  seekToSeconds,
  onDownload,
  downloadLabel = 'Download Audio',
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [peaks, setPeaks] = useState<number[]>([]);

  // Decode audio buffer to extract real waveform peaks
  useEffect(() => {
    let cancelled = false;
    setIsPlaying(false);
    setCurrentTime(0);

    async function decodePeaks() {
      try {
        const res = await fetch(audioUrl);
        const arrayBuffer = await res.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (cancelled) {
          await ctx.close();
          return;
        }
        setDuration(audioBuffer.duration);

        const channelData = audioBuffer.getChannelData(0);
        const barCount = 96;
        const blockSize = Math.max(1, Math.floor(channelData.length / barCount));
        const extracted: number[] = [];

        for (let i = 0; i < barCount; i++) {
          const start = i * blockSize;
          let max = 0;
          for (let j = 0; j < blockSize && start + j < channelData.length; j++) {
            const val = Math.abs(channelData[start + j]);
            if (val > max) max = val;
          }
          extracted.push(Math.max(0.08, Math.min(1, max)));
        }
        setPeaks(extracted);
        await ctx.close();
      } catch {
        // Fallback deterministic bars if browser cannot decode format
        const fallback = Array.from({ length: 96 }, (_, i) =>
          0.2 + 0.55 * Math.abs(Math.sin(i * 0.35) * Math.cos(i * 0.14))
        );
        if (!cancelled) setPeaks(fallback);
      }
    }

    if (audioUrl) {
      decodePeaks();
    }
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  // Handle external seek requests (e.g. clicking an SRT cue)
  useEffect(() => {
    if (seekToSeconds !== null && seekToSeconds !== undefined && audioRef.current) {
      audioRef.current.currentTime = Math.max(0, seekToSeconds);
      setCurrentTime(seekToSeconds);
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  }, [seekToSeconds]);

  // Draw waveform onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const progress = duration > 0 ? currentTime / duration : 0;
    const totalBars = peaks.length;
    const slotWidth = width / totalBars;
    const barWidth = Math.max(2, slotWidth * 0.62);

    peaks.forEach((peak, idx) => {
      const barRatio = idx / totalBars;
      const barHeight = Math.max(4, peak * (height - 10));
      const x = idx * slotWidth + (slotWidth - barWidth) / 2;
      const y = (height - barHeight) / 2;

      ctx.fillStyle = barRatio <= progress ? '#09090B' : '#E4E4E7';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();
    });
  }, [peaks, currentTime, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = ratio * duration;
    audio.currentTime = target;
    setCurrentTime(target);
    onTimeUpdate?.(target);
  };

  const cycleRate = () => {
    const rates = [1, 1.25, 1.5, 0.75];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4">
      <audio
        ref={audioRef}
        src={audioUrl}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (Number.isFinite(el.duration) && el.duration > 0) {
            setDuration(el.duration);
          }
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrentTime(t);
          onTimeUpdate?.(t);
        }}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            className="w-10 h-10 rounded-full bg-zinc-950 hover:bg-zinc-800 text-white flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-950 truncate">
              {fileName || 'Audio Preview'}
            </p>
            <p className="text-xs font-mono tabular-nums text-zinc-500">
              {formatDisplayTime(currentTime)} / {formatDisplayTime(duration)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={cycleRate}
            className="px-2.5 py-1.5 text-xs font-mono tabular-nums font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            title="Change playback speed"
          >
            {playbackRate}x
          </button>
          <div className="hidden sm:flex items-center gap-1 text-zinc-400 px-1">
            <Volume2 className="w-4 h-4" />
          </div>
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadLabel}</span>
            </button>
          )}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-14 cursor-pointer rounded-lg bg-zinc-50 border border-zinc-100"
        title="Click anywhere on the waveform to seek"
      />
    </div>
  );
};

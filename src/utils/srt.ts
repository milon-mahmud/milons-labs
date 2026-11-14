import type { SrtCue } from '../types/studio.ts';

export function secondsToSrtTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(millis === 1000 ? 999 : millis).padStart(3, '0');
  return `${hh}:${mm}:${ss},${mmm}`;
}

export function srtTimestampToSeconds(timestamp: string): number {
  const cleaned = timestamp.trim().replace('.', ',');
  const match = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.:](\d{1,3})$/);
  if (!match) {
    // Try MM:SS,mmm fallback
    const shortMatch = cleaned.match(/^(\d{1,2}):(\d{2})[,.:](\d{1,3})$/);
    if (!shortMatch) return 0;
    const mins = parseInt(shortMatch[1], 10);
    const secs = parseInt(shortMatch[2], 10);
    const ms = parseInt(shortMatch[3].padEnd(3, '0').slice(0, 3), 10);
    return mins * 60 + secs + ms / 1000;
  }
  const hrs = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const secs = parseInt(match[3], 10);
  const ms = parseInt(match[4].padEnd(3, '0').slice(0, 3), 10);
  return hrs * 3600 + mins * 60 + secs + ms / 1000;
}

export function formatDisplayTime(totalSeconds: number): string {
  const safe = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function buildSrtString(cues: SrtCue[]): string {
  return cues
    .map((cue, index) => {
      const start = secondsToSrtTimestamp(cue.startSeconds);
      const end = secondsToSrtTimestamp(Math.max(cue.startSeconds + 0.1, cue.endSeconds));
      return `${index + 1}\n${start} --> ${end}\n${cue.text.trim()}`;
    })
    .join('\n\n');
}

export function buildVttString(cues: SrtCue[]): string {
  const body = cues
    .map((cue, index) => {
      const start = secondsToSrtTimestamp(cue.startSeconds).replace(',', '.');
      const end = secondsToSrtTimestamp(Math.max(cue.startSeconds + 0.1, cue.endSeconds)).replace(',', '.');
      return `${index + 1}\n${start} --> ${end}\n${cue.text.trim()}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${body}`;
}

export function buildPlainTextString(cues: SrtCue[]): string {
  return cues.map((c) => c.text.trim()).filter(Boolean).join('\n');
}

export function parseSrtText(raw: string): SrtCue[] {
  const normalized = raw
    .replace(/\r\n/g, '\n')
    .replace(/```srt\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const cues: SrtCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    // Locate the line containing -->
    const arrowIndex = lines.findIndex((line) => line.includes('-->'));
    if (arrowIndex === -1) continue;

    const timingLine = lines[arrowIndex];
    const parts = timingLine.split('-->').map((p) => p.trim());
    if (parts.length !== 2) continue;

    const startSeconds = srtTimestampToSeconds(parts[0]);
    const endSeconds = srtTimestampToSeconds(parts[1]);
    if (endSeconds <= startSeconds && endSeconds === 0 && startSeconds === 0) continue;

    const textLines = lines.slice(arrowIndex + 1);
    const text = textLines.join('\n').trim();
    if (!text) continue;

    cues.push({
      id: cues.length + 1,
      startTime: secondsToSrtTimestamp(startSeconds),
      endTime: secondsToSrtTimestamp(Math.max(startSeconds + 0.2, endSeconds)),
      startSeconds,
      endSeconds: Math.max(startSeconds + 0.2, endSeconds),
      text,
    });
  }

  return cues;
}

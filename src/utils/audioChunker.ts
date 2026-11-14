export interface AudioChunk {
  file: File;
  offsetSeconds: number;
  durationSeconds: number;
  index: number;
  total: number;
}

function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Splits long audio files into compact 16 kHz mono WAV chunks (default ~4 min / chunk)
 * so 30+ minute audio files can be transcribed to SRT reliably without hitting
 * payload size limits or single-pass output token truncation.
 */
export async function splitAudioFileIfNeeded(
  file: File,
  chunkDurationSeconds = 240,
  directUploadMaxBytes = 18 * 1024 * 1024,
  directUploadMaxDurationSeconds = 300
): Promise<AudioChunk[]> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtx) {
    return [
      {
        file,
        offsetSeconds: 0,
        durationSeconds: 0,
        index: 0,
        total: 1,
      },
    ];
  }

  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    await ctx.close();
    return [
      {
        file,
        offsetSeconds: 0,
        durationSeconds: 0,
        index: 0,
        total: 1,
      },
    ];
  }

  const totalDuration = decoded.duration;
  if (file.size <= directUploadMaxBytes && totalDuration <= directUploadMaxDurationSeconds) {
    await ctx.close();
    return [
      {
        file,
        offsetSeconds: 0,
        durationSeconds: totalDuration,
        index: 0,
        total: 1,
      },
    ];
  }

  // Downmix & resample to 16 kHz mono for compact, crisp speech recognition (~1.9 MB/min)
  const targetRate = 16000;
  const totalFrames = Math.ceil(totalDuration * targetRate);
  const offline = new OfflineAudioContext(1, totalFrames, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  await ctx.close();

  const channelData = rendered.getChannelData(0);
  const samplesPerChunk = chunkDurationSeconds * targetRate;
  const totalChunks = Math.max(1, Math.ceil(channelData.length / samplesPerChunk));
  const chunks: AudioChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const startSample = i * samplesPerChunk;
    const endSample = Math.min(channelData.length, startSample + samplesPerChunk);
    const slice = channelData.subarray(startSample, endSample);
    const wavBlob = encodeWavFromFloat32(slice, targetRate);
    const chunkFile = new File([wavBlob], `chunk-${i + 1}.wav`, { type: 'audio/wav' });

    chunks.push({
      file: chunkFile,
      offsetSeconds: startSample / targetRate,
      durationSeconds: slice.length / targetRate,
      index: i,
      total: totalChunks,
    });
  }

  return chunks;
}

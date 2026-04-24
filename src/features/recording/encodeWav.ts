// WebM/MP4 等で録音された Blob を、Gemini が認識できる WAV 形式に変換する。
// 16kHz mono 16bit にダウンサンプリングして音声認識に最適なサイズに収める。

const TARGET_SAMPLE_RATE = 16000;

export async function convertToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();

  const AudioCtx: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  // decodeAudioData のために一時的に AudioContext を作成
  const decodeCtx = new AudioCtx();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    decodeCtx.close().catch(() => {});
  }

  const sourceSampleRate = audioBuffer.sampleRate;
  const sourceLength = audioBuffer.length;

  // 全チャネルをモノラル平均化
  const mono = new Float32Array(sourceLength);
  const channelCount = audioBuffer.numberOfChannels;
  for (let ch = 0; ch < channelCount; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < sourceLength; i++) {
      mono[i] += data[i] / channelCount;
    }
  }

  // 16kHz にダウンサンプリング（線形補間）
  const targetLength = Math.round(
    (sourceLength * TARGET_SAMPLE_RATE) / sourceSampleRate,
  );
  const resampled = new Float32Array(targetLength);
  const ratio = sourceLength / targetLength;
  for (let i = 0; i < targetLength; i++) {
    const idx = i * ratio;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, sourceLength - 1);
    const frac = idx - lo;
    resampled[i] = mono[lo] * (1 - frac) + mono[hi] * frac;
  }

  // ピーク正規化: 最大振幅が 0.95 になるようゲインをかける。
  // Gemini が音声を認識しやすくするため、小さい録音を底上げする。
  let peak = 0;
  for (let i = 0; i < resampled.length; i++) {
    const abs = Math.abs(resampled[i]);
    if (abs > peak) peak = abs;
  }
  const TARGET_PEAK = 0.95;
  if (peak > 0 && peak < TARGET_PEAK) {
    const gain = TARGET_PEAK / peak;
    for (let i = 0; i < resampled.length; i++) {
      resampled[i] *= gain;
    }
  }

  return encodeWav(resampled, TARGET_SAMPLE_RATE);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const byteLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + byteLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + byteLength, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, byteLength, true);

  // PCM 16bit samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, s, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

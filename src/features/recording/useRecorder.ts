'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RECORDING_PRESETS, type RecorderState, type RecordingMode } from './types';

type UseRecorderOptions = {
  mode: RecordingMode;
  gain: number;
};

type RecorderApi = {
  state: RecorderState;
  elapsedMs: number;
  level: number;
  error: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob | null>;
  reset: () => void;
};

export function useRecorder({ mode, gain }: UseRecorderOptions): RecorderApi {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);

  // gain 値の変更を録音中の GainNode にリアルタイム反映
  useEffect(() => {
    if (gainRef.current && audioCtxRef.current) {
      // setTargetAtTime でプチノイズを抑えつつスムーズに変化
      gainRef.current.gain.setTargetAtTime(
        gain,
        audioCtxRef.current.currentTime,
        0.01,
      );
    }
  }, [gain]);

  const cleanupStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    sourceRef.current?.disconnect();
    compressorRef.current?.disconnect();
    gainRef.current?.disconnect();
    analyserRef.current?.disconnect();
    destRef.current?.disconnect();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    sourceRef.current = null;
    compressorRef.current = null;
    gainRef.current = null;
    analyserRef.current = null;
    destRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => cleanupStream();
  }, [cleanupStream]);

  const updateLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    // GainNode を通過後の音量を測っているのでゲインの効果がそのまま反映される
    setLevel(Math.min(1, rms * 1.5));
    rafRef.current = requestAnimationFrame(updateLevel);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setState('requesting');
    try {
      const preset = RECORDING_PRESETS[mode];
      // モバイル互換性のため sampleRate/channelCount は指定しない（デバイス任せ）
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: preset.noiseSuppression,
          echoCancellation: preset.echoCancellation,
          autoGainControl: preset.autoGainControl,
        },
      });
      streamRef.current = stream;

      const tracks = stream.getAudioTracks();
      if (tracks.length === 0) {
        throw new Error('マイクの音声トラックが取得できませんでした');
      }

      const AudioCtx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      const dest = ctx.createMediaStreamDestination();

      // パイプライン: source → [compressor?] → gain → [analyser (メーター), dest (録音へ)]
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;

      let preGainNode: AudioNode = src;
      if (preset.compressor) {
        // 音声向けの穏やかなコンプレッション設定（歪みを避けつつ声を均一化）
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, ctx.currentTime);
        compressor.knee.setValueAtTime(10, ctx.currentTime);
        compressor.ratio.setValueAtTime(4, ctx.currentTime);
        compressor.attack.setValueAtTime(0.005, ctx.currentTime);
        compressor.release.setValueAtTime(0.1, ctx.currentTime);
        src.connect(compressor);
        preGainNode = compressor;
        compressorRef.current = compressor;
      }

      preGainNode.connect(gainNode);
      gainNode.connect(analyser);
      gainNode.connect(dest);

      sourceRef.current = src;
      gainRef.current = gainNode;
      analyserRef.current = analyser;
      destRef.current = dest;

      // 録音は dest.stream（GainNode を通した音声）を使う
      const recStream = dest.stream;

      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')
              ? 'audio/mp4;codecs=mp4a.40.2'
              : MediaRecorder.isTypeSupported('audio/mp4')
                ? 'audio/mp4'
                : '';

      const rec = mimeType
        ? new MediaRecorder(recStream, { mimeType, audioBitsPerSecond: 64000 })
        : new MediaRecorder(recStream);

      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = (e) => {
        console.error('[MediaRecorder] error', e);
        setError('録音中にエラーが発生しました');
      };
      recorderRef.current = rec;

      rec.start(1000);
      startedAtRef.current = Date.now();
      pausedElapsedRef.current = 0;
      setElapsedMs(0);

      timerRef.current = window.setInterval(() => {
        if (recorderRef.current?.state === 'recording') {
          setElapsedMs(pausedElapsedRef.current + (Date.now() - startedAtRef.current));
        }
      }, 250);

      updateLevel();
      setState('recording');
    } catch (e) {
      console.error('[useRecorder] start failed', e);
      const msg = e instanceof Error ? e.message : '録音の開始に失敗しました';
      setError(
        msg.includes('Permission') || msg.includes('NotAllowed')
          ? 'マイクの使用が許可されていません。ブラウザの設定で許可してください。'
          : msg,
      );
      setState('error');
      cleanupStream();
    }
    // 初期 gain は start 時点のスナップショットで良い。以降は useEffect で追随。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, updateLevel, cleanupStream]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      pausedElapsedRef.current += Date.now() - startedAtRef.current;
      setState('paused');
    }
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      startedAtRef.current = Date.now();
      setState('recording');
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') {
      return null;
    }
    return new Promise<Blob | null>((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm',
        });
        const finalMs = rec.state === 'paused'
          ? pausedElapsedRef.current
          : pausedElapsedRef.current + (Date.now() - startedAtRef.current);
        setElapsedMs(finalMs);
        cleanupStream();
        setState('stopped');
        resolve(blob);
      };
      rec.stop();
    });
  }, [cleanupStream]);

  const reset = useCallback(() => {
    cleanupStream();
    chunksRef.current = [];
    setElapsedMs(0);
    setLevel(0);
    setError(null);
    setState('idle');
  }, [cleanupStream]);

  return { state, elapsedMs, level, error, start, pause, resume, stop, reset };
}

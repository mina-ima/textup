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
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);
  const gainRef = useRef<number>(gain);

  useEffect(() => {
    gainRef.current = gain;
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
    analyserRef.current?.disconnect();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
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
    // ゲイン設定はアプリ側で擬似的に増幅表示（録音データ自体はブラウザAGC依存）
    setLevel(Math.min(1, rms * 1.5 * gainRef.current));
    rafRef.current = requestAnimationFrame(updateLevel);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setState('requesting');
    try {
      const preset = RECORDING_PRESETS[mode];
      // モバイル互換性のため sampleRate/channelCount は強制しない（デバイス任せ）
      // noiseSuppression/echoCancellation/autoGainControl のみをブラウザに依頼
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: preset.noiseSuppression,
          echoCancellation: preset.echoCancellation,
          autoGainControl: preset.autoGainControl,
        },
      });
      streamRef.current = stream;

      const tracks = stream.getAudioTracks();
      if (tracks.length === 0 || !tracks[0].enabled) {
        throw new Error('マイクの音声トラックが取得できませんでした');
      }

      // Web Audio API は音量メーター監視用にのみ使う（録音パイプラインには挟まない）
      const AudioCtx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      // モバイル Safari/Chrome で suspended の場合があるので resume
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      audioCtxRef.current = ctx;

      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      // destination に接続しない（スピーカーからのハウリングを防ぐ）

      sourceRef.current = src;
      analyserRef.current = analyser;

      // MediaRecorder には元のストリームを直接渡す（最も確実）
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
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 })
        : new MediaRecorder(stream);

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

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
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);

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
    gainRef.current?.disconnect();
    analyserRef.current?.disconnect();
    destRef.current?.disconnect();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  useEffect(() => {
    return () => cleanupStream();
  }, [cleanupStream]);

  // Apply gain live while recording
  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = gain;
    }
  }, [gain]);

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
    setLevel(Math.min(1, rms * 1.5));
    rafRef.current = requestAnimationFrame(updateLevel);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setState('requesting');
    try {
      const preset = RECORDING_PRESETS[mode];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: preset.noiseSuppression,
          echoCancellation: preset.echoCancellation,
          autoGainControl: preset.autoGainControl,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const AudioCtx: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const src = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      const dest = ctx.createMediaStreamDestination();

      src.connect(gainNode);
      gainNode.connect(analyser);
      gainNode.connect(dest);

      sourceRef.current = src;
      gainRef.current = gainNode;
      analyserRef.current = analyser;
      destRef.current = dest;

      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : MediaRecorder.isTypeSupported('audio/mp4')
              ? 'audio/mp4'
              : '';

      const rec = mimeType
        ? new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 64000 })
        : new MediaRecorder(dest.stream);

      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
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
      setError(e instanceof Error ? e.message : '録音の開始に失敗しました');
      setState('error');
      cleanupStream();
    }
  }, [mode, gain, updateLevel, cleanupStream]);

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
        if (rec.state !== 'recording' && rec.state !== 'paused') {
          // already stopped
        }
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

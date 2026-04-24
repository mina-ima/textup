'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, CloudUpload, Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RecordingSettings } from '@/components/recorder/RecordingSettings';
import { RecorderControls } from '@/components/recorder/RecorderControls';
import { AudioLevelMeter } from '@/components/recorder/AudioLevelMeter';
import { useRecorder } from '@/features/recording/useRecorder';
import type { RecordingMode } from '@/features/recording/types';

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadBlob(
  sessionId: string,
  blob: Blob,
  elapsedMs: number,
): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/audio`, {
    method: 'PUT',
    headers: {
      'content-type': blob.type || 'audio/webm',
      'x-duration-ms': String(elapsedMs),
    },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`アップロードに失敗: ${res.status}`);
  }
}

export default function RecordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<RecordingMode>('meeting');
  const [gain, setGain] = useState(2);
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // アップロード失敗時の保持Blob（通信断から復帰後の再試行用）
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingElapsedMs, setPendingElapsedMs] = useState(0);
  const [online, setOnline] = useState(true);

  const recorder = useRecorder({ mode, gain });
  const isRecording = recorder.state === 'recording' || recorder.state === 'paused';

  // オンライン状態追跡
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // ページ離脱時に未アップロードの録音があれば警告
  useEffect(() => {
    if (!pendingBlob && !isRecording) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingBlob, isRecording]);

  // WakeLock でスリープ防止
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    if (isRecording && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((w) => {
        wakeLock = w;
      }).catch(() => {});
    }
    return () => {
      wakeLock?.release().catch(() => {});
    };
  }, [isRecording]);

  const handleStart = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recordingMode: mode,
          gainValue: Math.round(gain),
        }),
      });
      if (!res.ok) {
        throw new Error(`セッション作成に失敗: ${res.status}`);
      }
      const { session } = await res.json();
      setSessionId(session.id);
      await recorder.start();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '録音開始に失敗しました');
    }
  };

  const handleStop = async () => {
    const blob = await recorder.stop();
    if (!blob || !sessionId) {
      toast.error('録音データが取得できませんでした');
      return;
    }
    // 通信断に備えて即座に保持
    setPendingBlob(blob);
    setPendingElapsedMs(recorder.elapsedMs);

    setUploading(true);
    try {
      await uploadBlob(sessionId, blob, recorder.elapsedMs);
      // 成功したので保持Blobをクリアして文字起こしを発火
      setPendingBlob(null);
      fetch(`/api/transcribe/${sessionId}`, { method: 'POST' }).catch(() => {});
      toast.success('アップロード完了。文字起こしを開始します');
      router.push(`/sessions/${sessionId}`);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `${e.message}。下の「再アップロード」から再試行できます`
          : 'アップロードに失敗しました',
      );
      setUploading(false);
    }
  };

  const handleRetryUpload = async () => {
    if (!pendingBlob || !sessionId) return;
    setUploading(true);
    try {
      await uploadBlob(sessionId, pendingBlob, pendingElapsedMs);
      setPendingBlob(null);
      fetch(`/api/transcribe/${sessionId}`, { method: 'POST' }).catch(() => {});
      toast.success('アップロード成功。文字起こしを開始します');
      router.push(`/sessions/${sessionId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '再アップロードに失敗しました');
      setUploading(false);
    }
  };

  const handleDownloadPending = () => {
    if (!pendingBlob) return;
    const url = URL.createObjectURL(pendingBlob);
    const a = document.createElement('a');
    a.href = url;
    const ext = pendingBlob.type.includes('mp4') ? 'mp4' : 'webm';
    a.download = `textup-recording-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-4">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          ダッシュボード
        </Link>
      </div>

      {!online && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="py-3 text-sm">
            <span className="font-medium text-amber-700 dark:text-amber-300">
              オフラインです。
            </span>{' '}
            録音自体は端末内で続行されます。停止後に通信が戻るのを待ってアップロードしてください。
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-10">
          <div className="font-mono text-5xl tabular-nums">
            {formatTime(recorder.elapsedMs)}
          </div>
          <div className="w-full max-w-xs">
            <AudioLevelMeter level={recorder.level} active={isRecording} />
          </div>
          <RecorderControls
            state={recorder.state}
            onStart={handleStart}
            onPause={recorder.pause}
            onResume={recorder.resume}
            onStop={handleStop}
          />
          <p className="min-h-5 text-xs text-muted-foreground">
            {recorder.state === 'requesting' && 'マイクアクセスを要求中...'}
            {recorder.state === 'recording' && '● 録音中'}
            {recorder.state === 'paused' && '一時停止中'}
            {recorder.error && <span className="text-destructive">{recorder.error}</span>}
          </p>
        </CardContent>
      </Card>

      {uploading && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">音声をアップロード中...</span>
          </CardContent>
        </Card>
      )}

      {pendingBlob && !uploading && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="py-4 space-y-3">
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-300">
                アップロード未完了の録音があります
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                長さ: {formatTime(pendingElapsedMs)} / サイズ: {formatSize(pendingBlob.size)}
                <br />
                通信が復帰してから「再アップロード」を押してください。
                <br />
                端末にファイルを保存しておくこともできます。
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleRetryUpload}
                disabled={!online}
                className="flex-1"
              >
                <CloudUpload className="mr-2 h-4 w-4" />
                再アップロード
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadPending}
              >
                <Download className="mr-2 h-4 w-4" />
                保存
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <RecordingSettings
        mode={mode}
        gain={gain}
        disabled={isRecording || recorder.state === 'requesting' || uploading}
        onModeChange={setMode}
        onGainChange={setGain}
      />

      {recorder.state === 'error' && (
        <Button variant="outline" className="w-full" onClick={recorder.reset}>
          やり直す
        </Button>
      )}
    </div>
  );
}

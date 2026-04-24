'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  sessionId: string;
  label?: string;
  variant?: 'default' | 'outline';
};

export function RetryTranscribeButton({
  sessionId,
  label = '文字起こしを再実行',
  variant = 'outline',
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/transcribe/${sessionId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `失敗: ${res.status}`);
      }
      toast.success('文字起こしが完了しました');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '文字起こしに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={busy} variant={variant} size="sm">
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}

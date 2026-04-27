'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  sessionId: string;
  label?: string;
};

export function GenerateSummaryButton({ sessionId, label = '要約を生成' }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/summarize/${sessionId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          body?.summary ?? body?.detail ?? `失敗しました（HTTP ${res.status}）`;
        if (body?.detail) console.error('[summarize] detail:', body.detail);
        throw new Error(message);
      }
      toast.success('要約を生成しました');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '要約の生成に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={busy}>
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}

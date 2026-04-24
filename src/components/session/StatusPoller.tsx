'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  status: string;
  intervalMs?: number;
};

export function StatusPoller({ status, intervalMs = 5000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (status !== 'uploading' && status !== 'processing') return;
    const t = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [status, intervalMs, router]);

  return null;
}

'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.error('[sw] register failed', err));
  }, []);

  return null;
}

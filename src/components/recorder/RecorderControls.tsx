'use client';

import { Mic, Pause, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RecorderState } from '@/features/recording/types';

type Props = {
  state: RecorderState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function RecorderControls({
  state,
  onStart,
  onPause,
  onResume,
  onStop,
}: Props) {
  if (state === 'recording' || state === 'paused') {
    return (
      <div className="flex items-center justify-center gap-3">
        {state === 'recording' ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onPause}
            className="h-16 w-16 rounded-full"
            aria-label="一時停止"
          >
            <Pause className="h-6 w-6" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onResume}
            className="h-16 w-16 rounded-full"
            aria-label="再開"
          >
            <Play className="h-6 w-6" />
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={onStop}
          className="h-20 w-20 rounded-full bg-red-500 text-white hover:bg-red-600"
          aria-label="録音停止"
        >
          <Square className="h-7 w-7 fill-current" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <Button
        type="button"
        size="lg"
        onClick={onStart}
        disabled={state === 'requesting'}
        className="h-20 w-20 rounded-full bg-indigo-500 text-white hover:bg-indigo-600"
        aria-label="録音開始"
      >
        <Mic className="h-7 w-7" />
      </Button>
    </div>
  );
}

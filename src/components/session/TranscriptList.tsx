'use client';

import { useState } from 'react';
import { SpeakerEditDialog, type SpeakerOption } from './SpeakerEditDialog';

type Segment = {
  id: string;
  speakerLabel: number;
  startMs: number;
  endMs: number;
  text: string;
};

type Props = {
  sessionId: string;
  segments: Segment[];
  speakers: SpeakerOption[];
};

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function TranscriptList({ sessionId, segments, speakers }: Props) {
  const [editTarget, setEditTarget] = useState<Segment | null>(null);

  const map = new Map<number, SpeakerOption>();
  for (const s of speakers) map.set(s.speakerLabel, s);

  return (
    <>
      <div className="space-y-3">
        {segments.map((seg) => {
          const speaker = map.get(seg.speakerLabel);
          const name = speaker?.displayName ?? `話者${String.fromCharCode(65 + seg.speakerLabel)}`;
          const color = speaker?.color ?? '#6366f1';
          return (
            <div key={seg.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(seg)}
                  className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium text-white transition hover:opacity-80"
                  style={{ backgroundColor: color }}
                  aria-label={`${name} を変更`}
                >
                  {name}
                </button>
                <span className="text-xs text-muted-foreground">
                  {formatTime(seg.startMs)}
                </span>
              </div>
              <p className="leading-relaxed">{seg.text}</p>
            </div>
          );
        })}
      </div>

      {editTarget && (
        <SpeakerEditDialog
          open={editTarget !== null}
          onOpenChange={(o) => !o && setEditTarget(null)}
          sessionId={sessionId}
          transcriptId={editTarget.id}
          currentSpeakerLabel={editTarget.speakerLabel}
          speakers={speakers}
        />
      )}
    </>
  );
}

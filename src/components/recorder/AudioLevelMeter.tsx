'use client';

type Props = {
  level: number;
  active: boolean;
};

export function AudioLevelMeter({ level, active }: Props) {
  const bars = 20;
  const activeBars = Math.round(level * bars);

  return (
    <div className="flex h-8 items-end gap-0.5" aria-label="音量レベル">
      {Array.from({ length: bars }).map((_, i) => {
        const isOn = active && i < activeBars;
        const height = 20 + (i / bars) * 80;
        const color =
          i < bars * 0.6
            ? 'bg-emerald-500'
            : i < bars * 0.85
              ? 'bg-amber-500'
              : 'bg-red-500';
        return (
          <div
            key={i}
            className={`w-1.5 rounded-sm transition-opacity ${isOn ? `${color} opacity-100` : 'bg-zinc-300 opacity-30 dark:bg-zinc-700'}`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

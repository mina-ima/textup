'use client';

import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RECORDING_PRESETS, type RecordingMode } from '@/features/recording/types';
import { Mic, Users, Presentation, Monitor } from 'lucide-react';

const MODE_ICONS: Record<RecordingMode, typeof Mic> = {
  close: Mic,
  meeting: Users,
  lecture: Presentation,
  web: Monitor,
};

type Props = {
  mode: RecordingMode;
  gain: number;
  /** モード変更ボタン（録音中はマイクの再取得が必要なため無効） */
  modeDisabled?: boolean;
  /** ゲインスライダー（録音中もリアルタイム変更可能） */
  gainDisabled?: boolean;
  onModeChange: (mode: RecordingMode) => void;
  onGainChange: (gain: number) => void;
};

export function RecordingSettings({
  mode,
  gain,
  modeDisabled,
  gainDisabled,
  onModeChange,
  onGainChange,
}: Props) {
  const preset = RECORDING_PRESETS[mode];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">録音設定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium">録音モード</label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(RECORDING_PRESETS) as RecordingMode[]).map((m) => {
              const p = RECORDING_PRESETS[m];
              const Icon = MODE_ICONS[m];
              const selected = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={modeDisabled}
                  onClick={() => onModeChange(m)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100'
                      : 'border-border bg-background hover:bg-muted'
                  } disabled:opacity-50`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{p.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {preset.description}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">マイク入力ゲイン</label>
            <span className="text-sm font-mono text-muted-foreground">
              {gain.toFixed(1)}×
            </span>
          </div>
          <Slider
            className="mt-3"
            value={[gain]}
            onValueChange={(v) => onGainChange(Array.isArray(v) ? v[0] : v)}
            min={0.5}
            max={20}
            step={0.5}
            disabled={gainDisabled}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            近距離は 1〜2、中距離の会議は 3〜5、遠距離の講義は 5〜15 を目安に。録音中もリアルタイムに調整できます。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

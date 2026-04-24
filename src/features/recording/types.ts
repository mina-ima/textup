export type RecordingMode = 'close' | 'meeting' | 'lecture' | 'web';

export type RecordingModePreset = {
  id: RecordingMode;
  label: string;
  description: string;
  /** 初期ゲイン倍率（アプリ側で GainNode に適用） */
  gain: number;
  /** ブラウザのノイズ抑制（true にすると遠い小声が削られる傾向） */
  noiseSuppression: boolean;
  /** ブラウザのエコー除去 */
  echoCancellation: boolean;
  /** ブラウザの自動ゲイン制御 */
  autoGainControl: boolean;
  /** 小さい音を持ち上げるコンプレッサー */
  compressor: boolean;
};

export const RECORDING_PRESETS: Record<RecordingMode, RecordingModePreset> = {
  close: {
    id: 'close',
    label: '対面',
    description: '近距離の会話向け。ゲインは控えめ',
    gain: 1.5,
    noiseSuppression: false,
    echoCancellation: false,
    autoGainControl: true,
    compressor: false,
  },
  meeting: {
    id: 'meeting',
    label: '会議室',
    description: '中距離の会議向け。コンプレッサーで声を均一化',
    gain: 3,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    compressor: true,
  },
  lecture: {
    id: 'lecture',
    label: '講義',
    description: '遠距離の講義向け。ゲイン最大、ノイズ抑制は OFF',
    gain: 8,
    noiseSuppression: false,
    echoCancellation: false,
    autoGainControl: true,
    compressor: true,
  },
  web: {
    id: 'web',
    label: 'WEB会議',
    description: 'PCスピーカー経由。エコー除去を重視',
    gain: 2,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
    compressor: true,
  },
};

export type RecorderState = 'idle' | 'requesting' | 'ready' | 'recording' | 'paused' | 'stopped' | 'error';

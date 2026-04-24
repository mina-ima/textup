export type RecordingMode = 'close' | 'meeting' | 'lecture' | 'web';

export type RecordingModePreset = {
  id: RecordingMode;
  label: string;
  description: string;
  gain: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
};

export const RECORDING_PRESETS: Record<RecordingMode, RecordingModePreset> = {
  close: {
    id: 'close',
    label: '対面',
    description: '近距離の会話向け。ノイズ抑制は控えめ',
    gain: 1,
    noiseSuppression: false,
    echoCancellation: false,
    autoGainControl: true,
  },
  meeting: {
    id: 'meeting',
    label: '会議室',
    description: '中距離の会議向け。標準的な設定',
    gain: 2,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
  },
  lecture: {
    id: 'lecture',
    label: '講義',
    description: '遠距離の講義向け。ゲイン高め',
    gain: 3,
    noiseSuppression: true,
    echoCancellation: false,
    autoGainControl: true,
  },
  web: {
    id: 'web',
    label: 'WEB会議',
    description: 'PCスピーカー経由。エコー抑制重視',
    gain: 1,
    noiseSuppression: true,
    echoCancellation: true,
    autoGainControl: true,
  },
};

export type RecorderState = 'idle' | 'requesting' | 'ready' | 'recording' | 'paused' | 'stopped' | 'error';

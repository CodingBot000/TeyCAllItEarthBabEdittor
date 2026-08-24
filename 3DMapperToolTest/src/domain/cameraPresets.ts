export const CAMERA_PRESETS = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

export const CAMERA_PRESET_LABELS: Record<CameraPreset, string> = {
  front: 'FRONT',
  back: 'BACK',
  left: 'LEFT',
  right: 'RIGHT',
  top: 'TOP',
  bottom: 'BOTTOM',
};

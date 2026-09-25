/** 10-band graphic equalizer: octave bands from 31 Hz to 16 kHz, ±12 dB each. */

export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_MAX_DB = 12;
/** Q for octave-wide peaking bands. */
export const EQ_Q = 1.41;

export type EqPresetId =
  | 'flat'
  | 'bass'
  | 'treble'
  | 'vocal'
  | 'rock'
  | 'pop'
  | 'jazz'
  | 'classical'
  | 'electronic'
  | 'small-speakers';

export const EQ_PRESETS: { id: EqPresetId; label: string; gains: number[] }[] = [
  { id: 'flat', label: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', label: 'Bass boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'treble', label: 'Treble boost', gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { id: 'vocal', label: 'Vocal', gains: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  { id: 'rock', label: 'Rock', gains: [4, 3, 2, 0, -1, -1, 1, 3, 4, 4] },
  { id: 'pop', label: 'Pop', gains: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2] },
  { id: 'jazz', label: 'Jazz', gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { id: 'classical', label: 'Classical', gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  { id: 'electronic', label: 'Electronic', gains: [5, 4, 1, 0, -2, 1, 0, 1, 4, 5] },
  { id: 'small-speakers', label: 'Small speakers', gains: [-6, -4, 2, 4, 3, 1, 1, 2, 2, 1] },
];

export interface EqSettings {
  enabled: boolean;
  /** A preset id, or 'custom' once any band is changed by hand. */
  preset: EqPresetId | 'custom';
  /** dB per band, same order as EQ_BANDS. */
  gains: number[];
}

export const DEFAULT_EQ: EqSettings = {
  enabled: false,
  preset: 'flat',
  gains: EQ_BANDS.map(() => 0),
};

/** Headroom so boosted bands don't clip: lower the input by the largest boost. */
export function eqPreampDb(gains: readonly number[]): number {
  return -Math.max(0, ...gains);
}

export function formatBand(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}

/* --------------------------- playback speed --------------------------- */

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;

/** Next or previous step in SPEEDS from any rate. */
export function stepSpeed(rate: number, dir: 1 | -1): number {
  if (dir > 0) return SPEEDS.find((s) => s > rate + 0.001) ?? MAX_SPEED;
  return [...SPEEDS].reverse().find((s) => s < rate - 0.001) ?? MIN_SPEED;
}

export function formatSpeed(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

/**
 * Settings for the desktop pet appearance and behavior.
 */
export interface PetSettings {
  enabled: boolean;
  speed: number;
  size: number;
  invert: boolean;
  hueRotate: number;
  saturate: number;
  tintColor: string;
  tintStrength: number;
}

/**
 * Global cursor position returned from the Rust backend.
 */
export interface CursorPosition {
  x: number;
  y: number;
}

/**
 * Default pet settings — matches the Rust `PetSettings::default()`.
 */
export const DEFAULT_SETTINGS: PetSettings = {
  enabled: true,
  speed: 10,
  size: 64,
  invert: false,
  hueRotate: 0,
  saturate: 100,
  tintColor: "#ff8a3d",
  tintStrength: 0,
};

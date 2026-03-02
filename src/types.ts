export interface PetSettings {
  speed: number;
  size: number;
  enabled: boolean;
  invert: boolean;
  hueRotate: number;
  saturate: number;
  tintColor: string;
  tintStrength: number;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export const defaultSettings: PetSettings = {
  speed: 10,
  size: 64,
  enabled: true,
  invert: false,
  hueRotate: 0,
  saturate: 100,
  tintColor: "#ff8a3d",
  tintStrength: 0,
};

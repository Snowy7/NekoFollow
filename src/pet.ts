import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import onekoSprite from "./assets/oneko.gif";
import { defaultSettings, type CursorPosition, type PetSettings } from "./types";
import "./pet.css";

const SPRITE_SIZE = 32;
const FRAME_INTERVAL_MS = 100;

const spriteSets = {
  idle: [[-3, -3]],
  alert: [[-7, -3]],
  scratchSelf: [
    [-5, 0],
    [-6, 0],
    [-7, 0],
  ],
  scratchWallN: [
    [0, 0],
    [0, -1],
  ],
  scratchWallS: [
    [-7, -1],
    [-6, -2],
  ],
  scratchWallE: [
    [-2, -2],
    [-2, -3],
  ],
  scratchWallW: [
    [-4, 0],
    [-4, -1],
  ],
  tired: [[-3, -2]],
  sleeping: [
    [-2, 0],
    [-2, -1],
  ],
  N: [
    [-1, -2],
    [-1, -3],
  ],
  NE: [
    [0, -2],
    [0, -3],
  ],
  E: [
    [-3, 0],
    [-3, -1],
  ],
  SE: [
    [-5, -1],
    [-5, -2],
  ],
  S: [
    [-6, -3],
    [-7, -2],
  ],
  SW: [
    [-5, -3],
    [-6, -1],
  ],
  W: [
    [-4, -2],
    [-4, -3],
  ],
  NW: [
    [-1, 0],
    [-1, -1],
  ],
} as const;

type SpriteName = keyof typeof spriteSets;
type IdleAnimationName =
  | "sleeping"
  | "scratchSelf"
  | "scratchWallN"
  | "scratchWallS"
  | "scratchWallE"
  | "scratchWallW";

const catEl = getCatElement();
const catBaseEl = getCatBaseElement();
const catTintEl = getCatTintElement();

catBaseEl.style.backgroundImage = `url("${onekoSprite}")`;
catTintEl.style.backgroundColor = defaultSettings.tintColor;
catTintEl.style.webkitMaskImage = `url("${onekoSprite}")`;
catTintEl.style.maskImage = `url("${onekoSprite}")`;
catTintEl.style.webkitMaskRepeat = "no-repeat";
catTintEl.style.maskRepeat = "no-repeat";

const state = {
  settings: defaultSettings,
  frameCount: 0,
  idleTime: 0,
  idleAnimation: null as IdleAnimationName | null,
  idleAnimationFrame: 0,
  lastSpriteKey: "",
  cursor: { x: 0, y: 0 },
  pos: { x: 64, y: 64 },
  busy: false,
};

void bootstrap();

async function bootstrap(): Promise<void> {
  const persisted = readPersistedSettings();
  const fromBackend = await invoke<PetSettings>("get_settings");
  state.settings = sanitizeSettings(persisted ?? fromBackend);
  applyFilter();
  await setSprite("idle", 0);

  await listen<PetSettings>("pet-settings-updated", (event) => {
    state.settings = sanitizeSettings(event.payload);
    applyFilter();
  });

  window.setInterval(() => {
    void tick();
  }, FRAME_INTERVAL_MS);
}

async function tick(): Promise<void> {
  if (state.busy || !state.settings.enabled) return;
  state.busy = true;
  try {
    state.cursor = await invoke<CursorPosition>("get_cursor_position");
    frame();
  } finally {
    state.busy = false;
  }
}

function frame(): void {
  state.frameCount += 1;

  const diffX = state.pos.x - state.cursor.x;
  const diffY = state.pos.y - state.cursor.y;
  const distance = Math.hypot(diffX, diffY);

  if (distance < state.settings.speed || distance < 48) {
    idle();
    return;
  }

  state.idleAnimation = null;
  state.idleAnimationFrame = 0;

  if (state.idleTime > 1) {
    void setSprite("alert", 0);
    state.idleTime = Math.min(state.idleTime, 7) - 1;
    return;
  }

  let direction = "";
  direction += diffY / distance > 0.5 ? "N" : "";
  direction += diffY / distance < -0.5 ? "S" : "";
  direction += diffX / distance > 0.5 ? "W" : "";
  direction += diffX / distance < -0.5 ? "E" : "";
  void setSprite(direction as SpriteName, state.frameCount);

  state.pos.x -= (diffX / distance) * state.settings.speed;
  state.pos.y -= (diffY / distance) * state.settings.speed;

  void invoke("move_pet_window", {
    x: Math.round(state.pos.x - state.settings.size / 2),
    y: Math.round(state.pos.y - state.settings.size / 2),
  });
}

function idle(): void {
  state.idleTime += 1;

  if (
    state.idleTime > 10 &&
    Math.floor(Math.random() * 200) === 0 &&
    state.idleAnimation === null
  ) {
    const available: IdleAnimationName[] = ["sleeping", "scratchSelf"];
    state.idleAnimation =
      available[Math.floor(Math.random() * available.length)];
  }

  switch (state.idleAnimation) {
    case "sleeping":
      if (state.idleAnimationFrame < 8) {
        void setSprite("tired", 0);
      } else {
        void setSprite("sleeping", Math.floor(state.idleAnimationFrame / 4));
        if (state.idleAnimationFrame > 192) resetIdleAnimation();
      }
      break;
    case "scratchSelf":
    case "scratchWallN":
    case "scratchWallS":
    case "scratchWallE":
    case "scratchWallW":
      void setSprite(state.idleAnimation, state.idleAnimationFrame);
      if (state.idleAnimationFrame > 9) resetIdleAnimation();
      break;
    default:
      void setSprite("idle", 0);
      return;
  }

  state.idleAnimationFrame += 1;
}

function resetIdleAnimation(): void {
  state.idleAnimation = null;
  state.idleAnimationFrame = 0;
}

async function setSprite(name: SpriteName, frame: number): Promise<void> {
  const frames = spriteSets[name];
  const frameIndex = frame % frames.length;
  const key = `${name}:${frameIndex}`;
  if (state.lastSpriteKey === key) return;
  state.lastSpriteKey = key;

  const sprite = frames[frameIndex];
  const position = `${sprite[0] * SPRITE_SIZE}px ${sprite[1] * SPRITE_SIZE}px`;
  catBaseEl.style.backgroundPosition = position;
  catTintEl.style.webkitMaskPosition = position;
  catTintEl.style.maskPosition = position;
}

function applyFilter(): void {
  const scale = state.settings.size / SPRITE_SIZE;
  const invert = state.settings.invert ? 1 : 0;
  catEl.style.transform = `scale(${scale})`;
  catBaseEl.style.filter = `invert(${invert}) hue-rotate(${state.settings.hueRotate}deg) saturate(${state.settings.saturate}%)`;
  catTintEl.style.backgroundColor = state.settings.tintColor;
  catTintEl.style.opacity = `${state.settings.tintStrength / 100}`;
}

function readPersistedSettings(): PetSettings | null {
  try {
    const raw = localStorage.getItem("neko-runner-settings");
    if (!raw) return null;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function sanitizeSettings(input: Partial<PetSettings>): PetSettings {
  return {
    enabled: Boolean(input.enabled ?? defaultSettings.enabled),
    invert: Boolean(input.invert ?? defaultSettings.invert),
    speed: clampNumber(input.speed, 2, 20, defaultSettings.speed),
    size: clampNumber(input.size, 24, 192, defaultSettings.size),
    hueRotate: clampNumber(input.hueRotate, 0, 360, defaultSettings.hueRotate),
    saturate: clampNumber(input.saturate, 0, 300, defaultSettings.saturate),
    tintColor: sanitizeHexColor(input.tintColor, defaultSettings.tintColor),
    tintStrength: clampNumber(
      input.tintStrength,
      0,
      100,
      defaultSettings.tintStrength,
    ),
  };
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function getCatElement(): HTMLDivElement {
  const element = document.querySelector<HTMLDivElement>("#cat");
  if (!element) throw new Error("Missing #cat element");
  return element;
}

function getCatBaseElement(): HTMLDivElement {
  const element = document.querySelector<HTMLDivElement>("#cat-base");
  if (!element) throw new Error("Missing #cat-base element");
  return element;
}

function getCatTintElement(): HTMLDivElement {
  const element = document.querySelector<HTMLDivElement>("#cat-tint");
  if (!element) throw new Error("Missing #cat-tint element");
  return element;
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  return fallback;
}

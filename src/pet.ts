import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import onekoSprite from "./assets/oneko.gif";
import "./pet.css";
import { DEFAULT_SETTINGS, type CursorPosition, type PetSettings } from "./types";

/* ── Constants ── */

const SPRITE_SIZE = 32;
const FRAME_INTERVAL = 100; // ms
const STORAGE_KEY = "neko-runner-settings";

/* ── Sprite Map ── */

const SPRITES = {
  idle:         [[-3, -3]],
  alert:        [[-7, -3]],
  scratchSelf:  [[-5, 0], [-6, 0], [-7, 0]],
  scratchWallN: [[0, 0], [0, -1]],
  scratchWallS: [[-7, -1], [-6, -2]],
  scratchWallE: [[-2, -2], [-2, -3]],
  scratchWallW: [[-4, 0], [-4, -1]],
  tired:        [[-3, -2]],
  sleeping:     [[-2, 0], [-2, -1]],
  N:            [[-1, -2], [-1, -3]],
  NE:           [[0, -2], [0, -3]],
  E:            [[-3, 0], [-3, -1]],
  SE:           [[-5, -1], [-5, -2]],
  S:            [[-6, -3], [-7, -2]],
  SW:           [[-5, -3], [-6, -1]],
  W:            [[-4, -2], [-4, -3]],
  NW:           [[-1, 0], [-1, -1]],
} as const;

type SpriteName = keyof typeof SPRITES;

type IdleAnimation =
  | "sleeping"
  | "scratchSelf"
  | "scratchWallN"
  | "scratchWallS"
  | "scratchWallE"
  | "scratchWallW";

/* ── DOM Elements ── */

const catEl = requireElement<HTMLDivElement>("#cat");
const baseEl = requireElement<HTMLDivElement>("#cat-base");
const tintEl = requireElement<HTMLDivElement>("#cat-tint");

// Configure sprite background
baseEl.style.backgroundImage = `url("${onekoSprite}")`;
tintEl.style.backgroundColor = DEFAULT_SETTINGS.tintColor;
tintEl.style.webkitMaskImage = `url("${onekoSprite}")`;
tintEl.style.maskImage = `url("${onekoSprite}")`;
tintEl.style.webkitMaskRepeat = "no-repeat";
tintEl.style.maskRepeat = "no-repeat";

/* ── State ── */

const state = {
  settings: { ...DEFAULT_SETTINGS },
  frameCount: 0,
  idleTime: 0,
  idleAnimation: null as IdleAnimation | null,
  idleAnimationFrame: 0,
  lastSpriteKey: "",
  cursor: { x: 0, y: 0 },
  pos: { x: 64, y: 64 },
  busy: false,
};

/* ── Bootstrap ── */

void bootstrap();

async function bootstrap(): Promise<void> {
  const persisted = loadSettings();
  const backend = await invoke<PetSettings>("get_settings");
  state.settings = sanitize(persisted ?? backend);
  applyFilters();
  setSprite("idle", 0);

  await listen<PetSettings>("pet-settings-updated", (event) => {
    state.settings = sanitize(event.payload);
    applyFilters();
  });

  window.setInterval(() => void tick(), FRAME_INTERVAL);
}

/* ── Game Loop ── */

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

  const dx = state.pos.x - state.cursor.x;
  const dy = state.pos.y - state.cursor.y;
  const dist = Math.hypot(dx, dy);

  // Close enough — idle
  if (dist < state.settings.speed || dist < 48) {
    idle();
    return;
  }

  // Reset idle state
  state.idleAnimation = null;
  state.idleAnimationFrame = 0;

  // Alert transition when coming out of long idle
  if (state.idleTime > 1) {
    setSprite("alert", 0);
    state.idleTime = Math.min(state.idleTime, 7) - 1;
    return;
  }

  // Determine direction
  let dir = "";
  dir += dy / dist > 0.5 ? "N" : "";
  dir += dy / dist < -0.5 ? "S" : "";
  dir += dx / dist > 0.5 ? "W" : "";
  dir += dx / dist < -0.5 ? "E" : "";
  setSprite(dir as SpriteName, state.frameCount);

  // Move towards cursor
  state.pos.x -= (dx / dist) * state.settings.speed;
  state.pos.y -= (dy / dist) * state.settings.speed;

  void invoke("move_pet_window", {
    x: Math.round(state.pos.x - state.settings.size / 2),
    y: Math.round(state.pos.y - state.settings.size / 2),
  });
}

function idle(): void {
  state.idleTime += 1;

  // Randomly start an idle animation
  if (
    state.idleTime > 10 &&
    Math.floor(Math.random() * 200) === 0 &&
    state.idleAnimation === null
  ) {
    const pool: IdleAnimation[] = ["sleeping", "scratchSelf"];
    state.idleAnimation = pool[Math.floor(Math.random() * pool.length)];
  }

  switch (state.idleAnimation) {
    case "sleeping":
      if (state.idleAnimationFrame < 8) {
        setSprite("tired", 0);
      } else {
        setSprite("sleeping", Math.floor(state.idleAnimationFrame / 4));
        if (state.idleAnimationFrame > 192) resetIdle();
      }
      break;

    case "scratchSelf":
    case "scratchWallN":
    case "scratchWallS":
    case "scratchWallE":
    case "scratchWallW":
      setSprite(state.idleAnimation, state.idleAnimationFrame);
      if (state.idleAnimationFrame > 9) resetIdle();
      break;

    default:
      setSprite("idle", 0);
      return;
  }

  state.idleAnimationFrame += 1;
}

function resetIdle(): void {
  state.idleAnimation = null;
  state.idleAnimationFrame = 0;
}

/* ── Rendering ── */

function setSprite(name: SpriteName, frame: number): void {
  const frames = SPRITES[name];
  const idx = frame % frames.length;
  const key = `${name}:${idx}`;
  if (state.lastSpriteKey === key) return;
  state.lastSpriteKey = key;

  const [sx, sy] = frames[idx];
  const pos = `${sx * SPRITE_SIZE}px ${sy * SPRITE_SIZE}px`;
  baseEl.style.backgroundPosition = pos;
  tintEl.style.webkitMaskPosition = pos;
  tintEl.style.maskPosition = pos;
}

function applyFilters(): void {
  const { size, invert, hueRotate, saturate, tintColor, tintStrength } = state.settings;
  const scale = size / SPRITE_SIZE;

  catEl.style.transform = `scale(${scale})`;
  baseEl.style.filter = `invert(${invert ? 1 : 0}) hue-rotate(${hueRotate}deg) saturate(${saturate}%)`;
  tintEl.style.backgroundColor = tintColor;
  tintEl.style.opacity = `${tintStrength / 100}`;
}

/* ── Persistence ── */

function loadSettings(): PetSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/* ── Validation ── */

function sanitize(input: Partial<PetSettings>): PetSettings {
  return {
    enabled: Boolean(input.enabled ?? DEFAULT_SETTINGS.enabled),
    speed: clamp(input.speed, 2, 20, DEFAULT_SETTINGS.speed),
    size: clamp(input.size, 24, 192, DEFAULT_SETTINGS.size),
    invert: Boolean(input.invert ?? DEFAULT_SETTINGS.invert),
    hueRotate: clamp(input.hueRotate, 0, 360, DEFAULT_SETTINGS.hueRotate),
    saturate: clamp(input.saturate, 0, 300, DEFAULT_SETTINGS.saturate),
    tintColor: hexColor(input.tintColor, DEFAULT_SETTINGS.tintColor),
    tintStrength: clamp(input.tintStrength, 0, 100, DEFAULT_SETTINGS.tintStrength),
  };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : Math.min(Math.max(n, min), max);
}

function hexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : fallback;
}

/* ── DOM Helpers ── */

function requireElement<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

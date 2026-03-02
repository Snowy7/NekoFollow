import { invoke } from "@tauri-apps/api/core";
import catIcon from "./assets/cat-idle.png";
import "./styles.css";
import { DEFAULT_SETTINGS, type PetSettings } from "./types";

/* ── Constants ── */

const STORAGE_KEY = "neko-runner-settings";

/* ── SVG Icons ── */

const SUN_ICON = `<svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-3a1 1 0 0 0 1-1V1a1 1 0 0 0-2 0v2a1 1 0 0 0 1 1zm0 18a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1zm9-9h-2a1 1 0 0 0 0 2h2a1 1 0 0 0 0-2zM4 12a1 1 0 0 0-1-1H1a1 1 0 0 0 0 2h2a1 1 0 0 0 1-1zm15.07-6.07a1 1 0 0 0 0-1.41l-1.42-1.42a1 1 0 1 0-1.41 1.42l1.41 1.41a1 1 0 0 0 1.42 0zM6.34 18.66a1 1 0 0 0-1.41 0l-1.42 1.42a1 1 0 0 0 1.42 1.41l1.41-1.41a1 1 0 0 0 0-1.42zm12.73 0a1 1 0 0 0-1.42 1.42l1.42 1.41a1 1 0 0 0 1.41-1.41l-1.41-1.42zM4.93 5.93a1 1 0 0 0 1.42-1.42L4.93 3.1a1 1 0 0 0-1.42 1.41l1.42 1.42z"/></svg>`;

const MOON_ICON = `<svg viewBox="0 0 24 24"><path d="M12.3 4.9a7.5 7.5 0 0 0 6.8 11.6A9 9 0 1 1 12.3 4.9z"/></svg>`;

/* ── DOM Setup ── */

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

app.innerHTML = /* html */ `
  <header class="header">
    <img class="header-icon" src="${catIcon}" alt="" />
    <div>
      <h1>Neko Runner</h1>
      <p>Close this window — the cat stays!</p>
    </div>
    <div class="header-actions">
      <button class="theme-btn" id="theme-toggle" type="button" title="Toggle theme">
        ${SUN_ICON}
      </button>
    </div>
  </header>

  <section class="section">
    <div class="section-title">General</div>

    <div class="toggle-field">
      <span class="toggle-label">Enable Cat</span>
      <label class="switch">
        <input id="enabled" type="checkbox" />
        <span class="switch-track"></span>
      </label>
    </div>

    <div class="field">
      <label class="field-label" for="speed">Follow Speed</label>
      <input id="speed" type="range" min="2" max="20" step="1" />
      <span class="field-value" id="speed-val"></span>
    </div>

    <div class="field">
      <label class="field-label" for="size">Cat Size</label>
      <input id="size" type="range" min="24" max="192" step="1" />
      <span class="field-value" id="size-val"></span>
    </div>
  </section>

  <section class="section">
    <div class="section-title">Appearance</div>

    <div class="toggle-field">
      <span class="toggle-label">Invert Colors</span>
      <label class="switch">
        <input id="invert" type="checkbox" />
        <span class="switch-track"></span>
      </label>
    </div>

    <div class="field">
      <label class="field-label" for="hue">Hue Rotate</label>
      <input id="hue" type="range" min="0" max="360" step="1" />
      <span class="field-value" id="hue-val"></span>
    </div>

    <div class="field">
      <label class="field-label" for="saturate">Saturation</label>
      <input id="saturate" type="range" min="0" max="300" step="1" />
      <span class="field-value" id="saturate-val"></span>
    </div>

    <div class="field">
      <label class="field-label" for="tint-color">Tint Color</label>
      <input id="tint-color" type="color" />
      <span class="field-value" id="tint-color-val"></span>
    </div>

    <div class="field">
      <label class="field-label" for="tint-strength">Tint Strength</label>
      <input id="tint-strength" type="range" min="0" max="100" step="1" />
      <span class="field-value" id="tint-strength-val"></span>
    </div>
  </section>

  <div class="status-bar">
    <span class="status-dot" id="status-dot"></span>
    <span id="status-text">Initializing…</span>
  </div>
`;

/* ── Element References ── */

const el = {
  enabled: getInput("enabled"),
  speed: getInput("speed"),
  size: getInput("size"),
  invert: getInput("invert"),
  hue: getInput("hue"),
  saturate: getInput("saturate"),
  tintColor: getInput("tint-color"),
  tintStrength: getInput("tint-strength"),
  speedVal: getSpan("speed-val"),
  sizeVal: getSpan("size-val"),
  hueVal: getSpan("hue-val"),
  saturateVal: getSpan("saturate-val"),
  tintColorVal: getSpan("tint-color-val"),
  tintStrengthVal: getSpan("tint-strength-val"),
  statusDot: getSpan("status-dot"),
  statusText: getSpan("status-text"),
  themeToggle: document.getElementById("theme-toggle") as HTMLButtonElement,
};

/* ── State ── */

let settings: PetSettings = { ...DEFAULT_SETTINGS };

/* ── Bootstrap ── */

void bootstrap();

async function bootstrap(): Promise<void> {
  const persisted = loadSettings();
  const backend = await invoke<PetSettings>("get_settings");
  settings = sanitize(persisted ?? backend);

  applyTheme(settings.darkMode);
  render();
  await push();

  for (const input of [
    el.enabled, el.speed, el.size, el.invert,
    el.hue, el.saturate, el.tintColor, el.tintStrength,
  ]) {
    input.addEventListener("input", handleInput);
    input.addEventListener("change", handleInput);
  }

  el.themeToggle.addEventListener("click", toggleTheme);
}

/* ── Theme ── */

function applyTheme(dark: boolean): void {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  el.themeToggle.innerHTML = dark ? SUN_ICON : MOON_ICON;
  el.themeToggle.title = dark ? "Switch to light mode" : "Switch to dark mode";
}

function toggleTheme(): void {
  settings.darkMode = !settings.darkMode;
  applyTheme(settings.darkMode);
  saveSettings(settings);
}

/* ── Event Handler ── */

async function handleInput(): Promise<void> {
  settings = sanitize({
    enabled: el.enabled.checked,
    speed: Number(el.speed.value),
    size: Number(el.size.value),
    invert: el.invert.checked,
    hueRotate: Number(el.hue.value),
    saturate: Number(el.saturate.value),
    tintColor: el.tintColor.value,
    tintStrength: Number(el.tintStrength.value),
    darkMode: settings.darkMode,
  });
  render();
  await push();
}

/* ── Push to Backend ── */

async function push(): Promise<void> {
  try {
    const backendSettings = await invoke<PetSettings>("update_settings", { settings });
    // Backend may not know about darkMode, so preserve it
    settings = { ...sanitize(backendSettings), darkMode: settings.darkMode };
    saveSettings(settings);
    setStatus(settings.enabled);
  } catch (err) {
    el.statusDot.className = "status-dot inactive";
    el.statusText.textContent = `Error: ${String(err)}`;
  }
}

/* ── Render UI ── */

function render(): void {
  el.enabled.checked = settings.enabled;
  el.speed.value = String(settings.speed);
  el.size.value = String(settings.size);
  el.invert.checked = settings.invert;
  el.hue.value = String(settings.hueRotate);
  el.saturate.value = String(settings.saturate);
  el.tintColor.value = settings.tintColor;
  el.tintStrength.value = String(settings.tintStrength);

  el.speedVal.textContent = `${settings.speed}`;
  el.sizeVal.textContent = `${settings.size}px`;
  el.hueVal.textContent = `${settings.hueRotate}°`;
  el.saturateVal.textContent = `${settings.saturate}%`;
  el.tintColorVal.textContent = settings.tintColor.toUpperCase();
  el.tintStrengthVal.textContent = `${settings.tintStrength}%`;
}

function setStatus(enabled: boolean): void {
  el.statusDot.className = `status-dot ${enabled ? "active" : "inactive"}`;
  el.statusText.textContent = enabled
    ? "Cat is active — close this window to keep it running in the background."
    : "Cat is paused.";
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

function saveSettings(s: PetSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
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
    darkMode: Boolean(input.darkMode ?? DEFAULT_SETTINGS.darkMode),
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

function getInput(id: string): HTMLInputElement {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) throw new Error(`Missing input #${id}`);
  return el;
}

function getSpan(id: string): HTMLSpanElement {
  const el = document.getElementById(id) as HTMLSpanElement | null;
  if (!el) throw new Error(`Missing span #${id}`);
  return el;
}

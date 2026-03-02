import { invoke } from "@tauri-apps/api/core";
import "./styles.css";
import { defaultSettings, type PetSettings } from "./types";

const STORAGE_KEY = "neko-runner-settings";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root element");

app.innerHTML = `
  <main class="panel" role="main">
    <header class="top">
      <h1>Neko Runner</h1>
      <p>Desktop cat settings. Close this window and reopen from tray.</p>
    </header>

    <label class="field checkbox" for="enabled">
      <input id="enabled" type="checkbox" />
      <span>Cat enabled</span>
    </label>

    <label class="field" for="speed">
      <span>Follow speed</span>
      <input id="speed" type="range" min="2" max="20" step="1" />
      <output id="speed-value"></output>
    </label>

    <label class="field" for="size">
      <span>Cat size</span>
      <input id="size" type="range" min="24" max="192" step="1" />
      <output id="size-value"></output>
    </label>

    <label class="field checkbox" for="invert">
      <input id="invert" type="checkbox" />
      <span>Invert colors</span>
    </label>

    <label class="field" for="hue">
      <span>Hue rotate</span>
      <input id="hue" type="range" min="0" max="360" step="1" />
      <output id="hue-value"></output>
    </label>

    <label class="field" for="saturate">
      <span>Saturation</span>
      <input id="saturate" type="range" min="0" max="300" step="1" />
      <output id="saturate-value"></output>
    </label>

    <label class="field" for="tint-color">
      <span>Multiply color</span>
      <input id="tint-color" type="color" />
      <output id="tint-color-value"></output>
    </label>

    <label class="field" for="tint-strength">
      <span>Multiply strength</span>
      <input id="tint-strength" type="range" min="0" max="100" step="1" />
      <output id="tint-strength-value"></output>
    </label>

    <p id="status" aria-live="polite"></p>
  </main>
`;

const enabledInput = getInput("enabled");
const speedInput = getInput("speed");
const sizeInput = getInput("size");
const invertInput = getInput("invert");
const hueInput = getInput("hue");
const saturateInput = getInput("saturate");
const tintColorInput = getInput("tint-color");
const tintStrengthInput = getInput("tint-strength");

const speedValue = getOutput("speed-value");
const sizeValue = getOutput("size-value");
const hueValue = getOutput("hue-value");
const saturateValue = getOutput("saturate-value");
const tintColorValue = getOutput("tint-color-value");
const tintStrengthValue = getOutput("tint-strength-value");
const statusEl = getParagraph("status");

let settings: PetSettings = defaultSettings;

void bootstrap();

async function bootstrap(): Promise<void> {
  const persisted = readPersistedSettings();
  settings = sanitizeSettings(persisted ?? (await invoke<PetSettings>("get_settings")));
  render(settings);
  await pushSettings();

  for (const input of [
    enabledInput,
    speedInput,
    sizeInput,
    invertInput,
    hueInput,
    saturateInput,
    tintColorInput,
    tintStrengthInput,
  ]) {
    input.addEventListener("input", onInput);
    input.addEventListener("change", onInput);
  }
}

async function onInput(): Promise<void> {
  settings = sanitizeSettings({
    enabled: enabledInput.checked,
    speed: Number(speedInput.value),
    size: Number(sizeInput.value),
    invert: invertInput.checked,
    hueRotate: Number(hueInput.value),
    saturate: Number(saturateInput.value),
    tintColor: tintColorInput.value,
    tintStrength: Number(tintStrengthInput.value),
  });
  render(settings);
  await pushSettings();
}

async function pushSettings(): Promise<void> {
  try {
    settings = await invoke<PetSettings>("update_settings", { settings });
    writePersistedSettings(settings);
    statusEl.textContent = settings.enabled
      ? "Running in background. Use tray icon to reopen controls."
      : "Cat is disabled.";
  } catch (error) {
    statusEl.textContent = `Failed to apply settings: ${String(error)}`;
  }
}

function render(next: PetSettings): void {
  enabledInput.checked = next.enabled;
  speedInput.value = String(next.speed);
  sizeInput.value = String(next.size);
  invertInput.checked = next.invert;
  hueInput.value = String(next.hueRotate);
  saturateInput.value = String(next.saturate);
  tintColorInput.value = next.tintColor;
  tintStrengthInput.value = String(next.tintStrength);

  speedValue.textContent = `${next.speed}`;
  sizeValue.textContent = `${next.size}px`;
  hueValue.textContent = `${next.hueRotate}deg`;
  saturateValue.textContent = `${next.saturate}%`;
  tintColorValue.textContent = next.tintColor.toUpperCase();
  tintStrengthValue.textContent = `${next.tintStrength}%`;
}

function readPersistedSettings(): PetSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writePersistedSettings(next: PetSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

function getInput(id: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Missing input: ${id}`);
  return input;
}

function getOutput(id: string): HTMLOutputElement {
  const output = document.querySelector<HTMLOutputElement>(`#${id}`);
  if (!output) throw new Error(`Missing output: ${id}`);
  return output;
}

function getParagraph(id: string): HTMLParagraphElement {
  const paragraph = document.querySelector<HTMLParagraphElement>(`#${id}`);
  if (!paragraph) throw new Error(`Missing paragraph: ${id}`);
  return paragraph;
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  return fallback;
}

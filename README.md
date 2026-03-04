# 🐱 Neko Runner

A desktop cat companion built with [Tauri](https://tauri.app/). A pixel-art cat follows your cursor around the screen in a transparent, always-on-top overlay window.

![Tauri](https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Desktop pet** — a pixel cat chases your cursor across the screen
- **Transparent overlay** — the cat window is frameless, always-on-top, and click-through
- **System tray** — minimize to tray; right-click for quick controls
- **Customization** — adjust speed, size, hue, saturation, tint color, and invert
- **Persistent settings** — your preferences are saved across sessions
- **Lightweight** — native Rust backend, no Electron overhead

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

## Getting Started

```bash
# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

## Build Installers (Windows)

Use the dedicated scripts:

```bash
# NSIS installer (.exe) - recommended for most users
npm run installer

# MSI installer (.msi)
npm run installer:msi

# Build both installers
npm run installer:all
```

Installer output files are generated under:

```text
src-tauri/target/release/bundle/nsis/
src-tauri/target/release/bundle/msi/
```

## Project Structure

```
├── index.html             # Controls window entry point
├── pet.html               # Pet overlay window entry point
├── src/
│   ├── main.ts            # Controls panel logic
│   ├── pet.ts             # Pet animation & cursor tracking
│   ├── types.ts           # Shared TypeScript types
│   ├── styles.css         # Controls panel styles
│   ├── pet.css            # Pet overlay styles
│   └── assets/
│       ├── icon.svg       # App icon source
│       └── oneko.gif      # Cat sprite sheet
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs         # Tauri commands & app setup
│   │   └── main.rs        # Entry point
│   ├── icons/             # Generated app icons
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── vite.config.ts         # Vite bundler config
└── tsconfig.json          # TypeScript config
```

## How It Works

1. **Rust backend** uses `device_query` to read the global cursor position
2. **Pet window** (`pet.html`) is a transparent, always-on-top, click-through overlay
3. The cat sprite animates toward the cursor using directional sprite frames from `oneko.gif`
4. **Controls window** (`index.html`) lets you tweak appearance settings in real-time
5. Settings sync between windows via Tauri events and persist in `localStorage`

## Generating Icons

To regenerate app icons from the SVG source:

```bash
npx tauri icon src/assets/icon.svg
```

## License

MIT

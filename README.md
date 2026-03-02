# Neko Runner (Tauri)

A local-first Tauri desktop pet:
- transparent always-on-top cat window in the background
- tray icon to reopen controls
- live controls for speed, size, enable/disable, invert, hue, and saturation

## Scripts

- `npm install`
- `npm run tauri dev`
- `npm run build`
- `npx tauri build --no-bundle --debug`

## Notes

- The cat behavior is based on `oneko.js`, adapted to track global cursor position through Rust commands.
- The sprite sheet is stored locally at `src/assets/oneko.gif` (no runtime `fetch`/`eval`).

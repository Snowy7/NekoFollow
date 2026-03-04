use device_query::{DeviceQuery, DeviceState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::Color,
    Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};
#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::RECT,
    Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
    UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect, IsIconic, IsWindowVisible},
};

// ── Menu item IDs ──

const SHOW_CONTROLS: &str = "show_controls";
const TOGGLE_PET: &str = "toggle_pet";
const QUIT: &str = "quit";

// ── Types ──

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetSettings {
    enabled: bool,
    speed: f64,
    size: u32,
    invert: bool,
    hue_rotate: f64,
    saturate: f64,
    tint_color: String,
    tint_strength: f64,
    /// Frontend-only setting; ignored by backend logic.
    #[serde(default)]
    dark_mode: bool,
}

impl Default for PetSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            speed: 10.0,
            size: 64,
            invert: false,
            hue_rotate: 0.0,
            saturate: 100.0,
            tint_color: "#ff8a3d".to_string(),
            tint_strength: 0.0,
            dark_mode: false,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorPosition {
    x: i32,
    y: i32,
}

struct AppState {
    settings: Mutex<PetSettings>,
}

// ── Tauri Commands ──

#[tauri::command]
fn get_cursor_position(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> CursorPosition {
    let settings = state
        .settings
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default();
    let _ = sync_pet_visibility(&app, &settings);

    let device = DeviceState::new();
    let mouse = device.get_mouse();
    CursorPosition {
        x: mouse.coords.0,
        y: mouse.coords.1,
    }
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> Result<PetSettings, String> {
    state
        .settings
        .lock()
        .map(|s| s.clone())
        .map_err(|_| "settings lock poisoned".into())
}

#[tauri::command]
fn update_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    settings: PetSettings,
) -> Result<PetSettings, String> {
    let normalized = normalize(settings);

    {
        let mut guard = state.settings.lock().map_err(|_| "lock poisoned")?;
        *guard = normalized.clone();
    }

    apply_to_pet_window(&app, &normalized)?;
    let _ = app.emit_to("pet", "pet-settings-updated", &normalized);
    Ok(normalized)
}

#[tauri::command]
fn move_pet_window(app: tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("pet") {
        win.set_position(Position::Logical(LogicalPosition::new(x as f64, y as f64)))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Settings Helpers ──

fn normalize(input: PetSettings) -> PetSettings {
    PetSettings {
        enabled: input.enabled,
        speed: input.speed.clamp(2.0, 20.0),
        size: input.size.clamp(24, 192),
        invert: input.invert,
        hue_rotate: input.hue_rotate.clamp(0.0, 360.0),
        saturate: input.saturate.clamp(0.0, 300.0),
        tint_color: normalize_hex(&input.tint_color),
        tint_strength: input.tint_strength.clamp(0.0, 100.0),
        dark_mode: input.dark_mode,
    }
}

fn normalize_hex(input: &str) -> String {
    let v = input.trim().to_lowercase();
    let valid = v.starts_with('#')
        && v.len() == 7
        && v.chars().skip(1).all(|c| c.is_ascii_hexdigit());
    if valid { v } else { "#ff8a3d".into() }
}

// ── Window Management ──

fn apply_to_pet_window(app: &tauri::AppHandle, settings: &PetSettings) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("pet") {
        let size = settings.size as f64;
        win.set_size(Size::Logical(LogicalSize::new(size, size)))
            .map_err(|e| e.to_string())?;
        win.set_always_on_top(true)
            .map_err(|e| e.to_string())?;
        let should_show = settings.enabled && !is_foreground_fullscreen();
        set_pet_visibility(&win, should_show)?;
    }
    Ok(())
}

fn sync_pet_visibility(app: &tauri::AppHandle, settings: &PetSettings) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("pet") {
        let should_show = settings.enabled && !is_foreground_fullscreen();
        set_pet_visibility(&win, should_show)?;
    }
    Ok(())
}

fn set_pet_visibility(win: &tauri::WebviewWindow, should_show: bool) -> Result<(), String> {
    let is_visible = win.is_visible().unwrap_or(false);
    if should_show && !is_visible {
        win.show().map_err(|e| e.to_string())?;
    } else if !should_show && is_visible {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn is_foreground_fullscreen() -> bool {
    const TOLERANCE_PX: i32 = 2;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return false;
        }
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return false;
        }

        let mut window_rect = RECT::default();
        if GetWindowRect(hwnd, &mut window_rect).is_err() {
            return false;
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if monitor.0.is_null() {
            return false;
        }

        let mut monitor_info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut monitor_info as *mut MONITORINFO as *mut _).as_bool() {
            return false;
        }

        let mw = monitor_info.rcMonitor.right - monitor_info.rcMonitor.left;
        let mh = monitor_info.rcMonitor.bottom - monitor_info.rcMonitor.top;
        let ww = window_rect.right - window_rect.left;
        let wh = window_rect.bottom - window_rect.top;

        ww >= mw - TOLERANCE_PX
            && wh >= mh - TOLERANCE_PX
            && window_rect.left <= monitor_info.rcMonitor.left + TOLERANCE_PX
            && window_rect.top <= monitor_info.rcMonitor.top + TOLERANCE_PX
    }
}

#[cfg(not(target_os = "windows"))]
fn is_foreground_fullscreen() -> bool {
    false
}

fn show_controls(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn create_pet_window(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    if app.get_webview_window("pet").is_some() {
        return Ok(());
    }

    let settings = app
        .state::<AppState>()
        .settings
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default();

    let size = settings.size as f64;

    let win = WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("pet.html".into()))
        .title("Neko Pet")
        .visible(settings.enabled)
        .focused(false)
        .decorations(false)
        .transparent(true)
        .background_color(Color(0, 0, 0, 0))
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .inner_size(size, size)
        .build()?;

    let _ = win.set_ignore_cursor_events(true);
    let _ = win.set_always_on_top(true);
    let _ = win.set_shadow(false);
    let _ = win.set_background_color(Some(Color(0, 0, 0, 0)));

    Ok(())
}

fn create_tray(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    let menu = MenuBuilder::new(app)
        .text(SHOW_CONTROLS, "Open Controls")
        .text(TOGGLE_PET, "Toggle Cat")
        .separator()
        .text(QUIT, "Quit")
        .build()?;

    let mut builder = TrayIconBuilder::with_id("neko-runner-tray")
        .menu(&menu)
        .tooltip("Neko Runner")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            SHOW_CONTROLS => show_controls(app),
            TOGGLE_PET => {
                let updated = {
                    let state = app.state::<AppState>();
                    state.settings.lock().ok().map(|mut guard| {
                        guard.enabled = !guard.enabled;
                        guard.clone()
                    })
                };
                if let Some(s) = updated {
                    let _ = apply_to_pet_window(app, &s);
                    let _ = app.emit_to("pet", "pet-settings-updated", &s);
                }
            }
            QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_controls(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

// ── Entry Point ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            settings: Mutex::new(PetSettings::default()),
        })
        .setup(|app| {
            create_pet_window(app.handle())?;
            create_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide controls window on close instead of quitting
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_cursor_position,
            get_settings,
            update_settings,
            move_pet_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Neko Runner");
}

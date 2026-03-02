use device_query::{DeviceQuery, DeviceState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::Color,
    Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};

const SHOW_CONTROLS_ID: &str = "show_controls";
const TOGGLE_PET_ID: &str = "toggle_pet";
const QUIT_ID: &str = "quit";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetSettings {
    speed: f64,
    size: u32,
    enabled: bool,
    invert: bool,
    hue_rotate: f64,
    saturate: f64,
    tint_color: String,
    tint_strength: f64,
}

impl Default for PetSettings {
    fn default() -> Self {
        Self {
            speed: 10.0,
            size: 64,
            enabled: true,
            invert: false,
            hue_rotate: 0.0,
            saturate: 100.0,
            tint_color: "#ff8a3d".to_string(),
            tint_strength: 0.0,
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

#[tauri::command]
fn get_cursor_position() -> CursorPosition {
    let device_state = DeviceState::new();
    let mouse_state = device_state.get_mouse();
    CursorPosition {
        x: mouse_state.coords.0,
        y: mouse_state.coords.1,
    }
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppState>) -> Result<PetSettings, String> {
    state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())
}

#[tauri::command]
fn update_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    settings: PetSettings,
) -> Result<PetSettings, String> {
    let normalized = normalize_settings(settings);
    {
        let mut guard = state
            .settings
            .lock()
            .map_err(|_| "settings lock poisoned".to_string())?;
        *guard = normalized.clone();
    }

    apply_settings_to_pet(&app, &normalized)?;
    let _ = app.emit_to("pet", "pet-settings-updated", &normalized);
    Ok(normalized)
}

#[tauri::command]
fn move_pet_window(app: tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pet") {
        window
            .set_position(Position::Logical(LogicalPosition::new(x as f64, y as f64)))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn normalize_settings(input: PetSettings) -> PetSettings {
    PetSettings {
        speed: input.speed.clamp(2.0, 20.0),
        size: input.size.clamp(24, 192),
        enabled: input.enabled,
        invert: input.invert,
        hue_rotate: input.hue_rotate.clamp(0.0, 360.0),
        saturate: input.saturate.clamp(0.0, 300.0),
        tint_color: normalize_hex_color(&input.tint_color),
        tint_strength: input.tint_strength.clamp(0.0, 100.0),
    }
}

fn normalize_hex_color(input: &str) -> String {
    let value = input.trim().to_lowercase();
    let is_hex = value.starts_with('#')
        && value.len() == 7
        && value.chars().skip(1).all(|ch| ch.is_ascii_hexdigit());
    if is_hex {
        value
    } else {
        "#ff8a3d".to_string()
    }
}

fn apply_settings_to_pet(app: &tauri::AppHandle, settings: &PetSettings) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pet") {
        window
            .set_size(Size::Logical(LogicalSize::new(
                settings.size as f64,
                settings.size as f64,
            )))
            .map_err(|e| e.to_string())?;
        window
            .set_always_on_top(true)
            .map_err(|e| e.to_string())?;

        if settings.enabled {
            window.show().map_err(|e| e.to_string())?;
        } else {
            window.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn show_controls_window(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
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
        .map(|value| value.clone())
        .unwrap_or_default();

    let window = WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("pet.html".into()))
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
        .inner_size(settings.size as f64, settings.size as f64)
        .build()?;

    let _ = window.set_ignore_cursor_events(true);
    let _ = window.set_always_on_top(true);
    let _ = window.set_shadow(false);
    let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));

    Ok(())
}

fn create_tray(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    let tray_menu = MenuBuilder::new(app)
        .text(SHOW_CONTROLS_ID, "Open Controls")
        .text(TOGGLE_PET_ID, "Toggle Cat")
        .separator()
        .text(QUIT_ID, "Quit")
        .build()?;

    let mut tray_builder = TrayIconBuilder::with_id("neko-runner-tray")
        .menu(&tray_menu)
        .tooltip("Neko Runner")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            SHOW_CONTROLS_ID => show_controls_window(app),
            TOGGLE_PET_ID => {
                let updated = {
                    let state = app.state::<AppState>();
                    let maybe_updated = if let Ok(mut guard) = state.settings.lock() {
                        guard.enabled = !guard.enabled;
                        Some(guard.clone())
                    } else {
                        None
                    };
                    maybe_updated
                };
                if let Some(normalized) = updated {
                    let _ = apply_settings_to_pet(app, &normalized);
                    let _ = app.emit_to("pet", "pet-settings-updated", &normalized);
                }
            }
            QUIT_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_controls_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;
    Ok(())
}

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
            move_pet_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

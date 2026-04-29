use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod executor;
mod native_environment;

#[tauri::command]
fn set_pinned(app: tauri::AppHandle, pinned: bool) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window.set_always_on_top(pinned).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_pinned,
            native_environment::get_native_environment_snapshot,
            executor::executor_open_path,
            executor::executor_open_url
        ])
        .setup(|app| {
            let focus_shortcut =
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, shortcut, event| {
                        if shortcut == &focus_shortcut && event.state() == ShortcutState::Pressed {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("focus-input", ());
                            }
                        }
                    })
                    .build(),
            )?;

            app.global_shortcut().register(focus_shortcut)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

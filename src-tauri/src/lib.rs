mod commands;
mod ea_client;
mod models;
mod storage;

use commands::*;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to resolve app data dir");
            let storage = storage::StorageManager::new(app_data_dir.clone());
            let settings = storage.load_settings();
            app.manage(ea_client::EaClient::new(app.handle().clone(), settings.proxy_url));
            app.manage(storage::StorageManager::new(app_data_dir));

            // Enable autostart with Windows
            use tauri_plugin_autostart::ManagerExt;
            let _ = app.autolaunch().enable();

            // Prevent window close (hide instead)
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let _ = window_clone.hide();
                        api.prevent_close();
                    }
                });
            }

            // Setup Tray icon safely
            let setup_tray = |app: &tauri::App| -> tauri::Result<()> {
                let show_i = MenuItem::with_id(app, "show", "Afficher l'application", true, None::<&str>)?;
                let toggle_i = MenuItem::with_id(app, "toggle_session", "Lancer / Stopper la session", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &toggle_i, &quit_i])?;

                let tray_builder = TrayIconBuilder::new()
                    .menu(&menu)
                    .show_menu_on_left_click(false);

                let tray_builder = if let Some(icon) = app.default_window_icon() {
                    tray_builder.icon(icon.clone())
                } else {
                    tray_builder
                };

                let _ = tray_builder
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => { app.exit(0); }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "toggle_session" => {
                            let _ = app.emit("tray-toggle-session", ());
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .build(app)?;
                Ok(())
            };

            // On lance le tray mais on ignore s'il échoue (pour ne pas bloquer l'app)
            let _ = setup_tray(app);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_club,
            load_club,
            get_matches,
            get_members,
            get_logo,
            save_settings,
            load_settings,
            poll_session,
            detect_platform,
            get_club_info,
            check_proxy,
            set_proxy,
            get_season_history,
            get_leaderboard,
            check_for_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

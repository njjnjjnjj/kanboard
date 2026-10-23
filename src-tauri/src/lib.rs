mod mcp;
mod storage;
pub mod windows_notify;

pub struct PendingTaskState(pub std::sync::Mutex<Option<String>>);

#[tauri::command]
fn get_pending_open_task(state: tauri::State<'_, PendingTaskState>) -> Option<String> {
    state.0.lock().ok()?.take()
}

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

#[cfg(desktop)]
pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        #[cfg(windows)]
        {
            let _ = window.set_always_on_top(true);
            let _ = window.set_always_on_top(false);
            let _ = window.set_focus();
        }
    }
}

#[cfg(desktop)]
fn show_quick_capture(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("quick-capture") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(
        app,
        "quick-capture",
        WebviewUrl::App("index.html".into()),
    )
    .title("快速记录")
    .inner_size(500.0, 220.0)
    .min_inner_size(420.0, 190.0)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .build();
}

#[cfg(not(desktop))]
pub(crate) fn show_main_window(_app: &tauri::AppHandle) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_task = std::env::args()
        .find_map(|arg| windows_notify::parse_open_task_uri(&arg));

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        let quick_shortcut = Shortcut::new(
            Some(Modifiers::CONTROL | Modifiers::SHIFT),
            Code::KeyK,
        );
        let handler_shortcut = quick_shortcut.clone();

        builder = builder
            .plugin(tauri_plugin_autostart::Builder::new().build())
            .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                show_main_window(app);
                for arg in &args {
                    if let Some(task_id) = windows_notify::parse_open_task_uri(arg) {
                        let _ = app.emit("open-task", task_id);
                        break;
                    }
                }
            }))
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, shortcut, event| {
                        if shortcut == &handler_shortcut
                            && event.state() == ShortcutState::Pressed
                        {
                            show_quick_capture(app);
                        }
                    })
                    .build(),
            )
            .setup(move |app| {
                let storage = storage::initialize(app.handle()).map_err(std::io::Error::other)?;
                let database_path = storage::current_path_handle(&storage);
                app.manage(storage);
                let mcp = tauri::async_runtime::block_on(mcp::initialize(app.handle(), database_path))
                    .map_err(std::io::Error::other)?;
                app.manage(mcp);
                let open_handle = app.handle().clone();
                app.listen("open-main-window", move |_| show_main_window(&open_handle));

                #[cfg(windows)]
                if let Err(error) = windows_notify::register_windows_integration() {
                    eprintln!("failed to register windows integration: {error}");
                }

                if let Err(error) = app.global_shortcut().register(quick_shortcut) {
                    eprintln!("failed to register Ctrl+Shift+K: {error}");
                }

                let open_item = MenuItem::with_id(app, "open", "打开看板", true, None::<&str>)?;
                let capture_item = MenuItem::with_id(
                    app,
                    "quick-capture",
                    "快速记录",
                    true,
                    Some("Ctrl+Shift+K"),
                )?;
                let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_item, &capture_item, &quit_item])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().expect("missing application icon").clone())
                    .tooltip("看板")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open" => show_main_window(app),
                        "quick-capture" => show_quick_capture(app),
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        } = event
                        {
                            show_main_window(tray.app_handle());
                        }
                    })
                    .build(app)?;

                show_main_window(app.handle());

                Ok(())
            })
            .on_window_event(|window, event| {
                if window.label() == "main" {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            });
    }

    builder
        .manage(PendingTaskState(std::sync::Mutex::new(initial_task)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            storage::get_storage_info,
            storage::get_database_url,
            storage::export_data,
            storage::import_data,
            storage::move_storage,
            storage::save_image_attachment,
            storage::resolve_attachment_path,
            mcp::get_mcp_status,
            mcp::set_mcp_enabled,
            mcp::connect_codex,
            mcp::connect_antigravity,
            get_pending_open_task,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run kanboard application");
}

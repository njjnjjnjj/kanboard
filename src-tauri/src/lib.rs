use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Listener, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

#[cfg(desktop)]
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_personal_task_wall",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_projects_and_tags",
            sql: include_str!("../migrations/0002_projects_and_tags.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_flow_workflow",
            sql: include_str!("../migrations/0003_flow_workflow.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_v2_productivity",
            sql: include_str!("../migrations/0004_v2_productivity.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_task_trash",
            sql: include_str!("../migrations/0005_task_trash.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        let quick_shortcut = Shortcut::new(
            Some(Modifiers::CONTROL | Modifiers::SHIFT),
            Code::KeyK,
        );
        let handler_shortcut = quick_shortcut.clone();

        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                show_main_window(app);
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
                let open_handle = app.handle().clone();
                app.listen("open-main-window", move |_| show_main_window(&open_handle));

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
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:kanboard.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("failed to run kanboard application");
}

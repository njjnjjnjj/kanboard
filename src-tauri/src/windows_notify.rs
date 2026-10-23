use url::Url;

/// Parses a task ID from a `kanboard://` protocol URI or CLI argument.
///
/// Supported formats:
/// - `kanboard://open-task/{task_id}`
/// - `kanboard://open-task/{task_id}/`
/// - `kanboard://task/{task_id}`
/// - `kanboard://open/{task_id}`
/// - `kanboard://open-task?id={task_id}`
/// - `kanboard://open-task?taskId={task_id}`
/// - `kanboard://open-task?task_id={task_id}`
pub fn parse_open_task_uri(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches('"').trim_matches('\'');
    if !trimmed.starts_with("kanboard://") {
        return None;
    }

    if let Ok(parsed) = Url::parse(trimmed) {
        for (key, val) in parsed.query_pairs() {
            if (key == "id" || key == "taskId" || key == "task_id") && !val.trim().is_empty() {
                return Some(val.trim().to_string());
            }
        }

        let host = parsed.host_str().unwrap_or_default();
        let path = parsed.path().trim_matches('/');

        if (host == "open-task" || host == "task" || host == "open") && !path.is_empty() {
            let id = path.split('/').next().unwrap_or_default().trim();
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }
    }

    let without_scheme = trimmed.strip_prefix("kanboard://")?;
    for prefix in &["open-task/", "open-task?id=", "task/", "open/"] {
        if let Some(rest) = without_scheme.strip_prefix(prefix) {
            let id = rest.split(['/', '?', '&']).next().unwrap_or_default().trim();
            if !id.is_empty() {
                return Some(id.to_string());
            }
        }
    }

    None
}

#[cfg(windows)]
pub fn register_windows_integration() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let current_exe = std::env::current_exe()?;
    let exe_path = current_exe.to_string_lossy().to_string();

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // 1. Register kanboard:// protocol
    let (proto_key, _) = hkcu.create_subkey(r"Software\Classes\kanboard")?;
    proto_key.set_value("", &"URL:Kanboard Protocol")?;
    proto_key.set_value("URL Protocol", &"")?;

    let (icon_key, _) = hkcu.create_subkey(r"Software\Classes\kanboard\DefaultIcon")?;
    icon_key.set_value("", &format!("\"{}\",0", exe_path))?;

    let (cmd_key, _) = hkcu.create_subkey(r"Software\Classes\kanboard\shell\open\command")?;
    cmd_key.set_value("", &format!("\"{}\" \"%1\"", exe_path))?;

    // 2. Register AppUserModelId for native toast notifications
    let (aumid_key, _) = hkcu.create_subkey(r"Software\Classes\AppUserModelId\com.local.kanban")?;
    aumid_key.set_value("DisplayName", &"看板")?;
    aumid_key.set_value("IconUri", &exe_path)?;
    aumid_key.set_value("IconBackgroundColor", &"0")?;

    Ok(())
}

#[cfg(windows)]
pub fn send_windows_toast(
    task_id: &str,
    summary: &str,
    body: &str,
    app_handle: Option<tauri::AppHandle>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use windows::{
        core::HSTRING,
        Data::Xml::Dom::XmlDocument,
        Foundation::TypedEventHandler,
        UI::Notifications::{ToastNotification, ToastNotificationManager},
    };

    let escape_xml = |s: &str| -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    };

    let safe_summary = escape_xml(summary);
    let safe_body = escape_xml(body);
    let launch_uri = format!("kanboard://open-task/{}", task_id);

    let xml = format!(
        r#"<toast activationType="protocol" launch="{launch_uri}">
    <visual>
        <binding template="ToastGeneric">
            <text>{safe_summary}</text>
            <text>{safe_body}</text>
        </binding>
    </visual>
    <actions>
        <action content="打开任务" activationType="protocol" arguments="{launch_uri}"/>
    </actions>
</toast>"#
    );

    let xml_doc = XmlDocument::new()?;
    xml_doc.LoadXml(&HSTRING::from(xml))?;
    let toast = ToastNotification::CreateToastNotification(&xml_doc)?;

    // Hook in-process Activated event as an additional immediate safety net
    if let Some(app) = app_handle {
        use tauri::Emitter;
        let task_id_owned = task_id.to_string();
        let app_clone = app.clone();
        let handler = TypedEventHandler::new(move |_, _| {
            crate::show_main_window(&app_clone);
            let _ = app_clone.emit("open-task", &task_id_owned);
            Ok(())
        });
        let _ = toast.Activated(&handler);
    }

    let app_id = HSTRING::from("com.local.kanban");
    let show_result = ToastNotificationManager::CreateToastNotifierWithId(&app_id)
        .and_then(|notifier| notifier.Show(&toast));

    if show_result.is_err() {
        let powershell_id = HSTRING::from(
            "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe",
        );
        if let Ok(fallback_notifier) =
            ToastNotificationManager::CreateToastNotifierWithId(&powershell_id)
        {
            let _ = fallback_notifier.Show(&toast);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_open_task_uri() {
        assert_eq!(
            parse_open_task_uri("kanboard://open-task/task-123"),
            Some("task-123".to_string())
        );
        assert_eq!(
            parse_open_task_uri("kanboard://open-task/task-123/"),
            Some("task-123".to_string())
        );
        assert_eq!(
            parse_open_task_uri("kanboard://task/task-456"),
            Some("task-456".to_string())
        );
        assert_eq!(
            parse_open_task_uri("kanboard://open-task?id=task-789"),
            Some("task-789".to_string())
        );
        assert_eq!(
            parse_open_task_uri("kanboard://open-task?taskId=task-abc"),
            Some("task-abc".to_string())
        );
        assert_eq!(
            parse_open_task_uri("\"kanboard://open-task/task-quoted\""),
            Some("task-quoted".to_string())
        );
        assert_eq!(parse_open_task_uri("https://example.com"), None);
        assert_eq!(parse_open_task_uri("kanboard://unknown"), None);
    }
}

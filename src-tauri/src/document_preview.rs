use std::{collections::HashMap, fs, path::{Path, PathBuf}, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Default)]
pub struct DocumentPreviews(pub Mutex<HashMap<String, PathBuf>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDocument {
    title: String,
    path: String,
    content: String,
}

fn document_path(href: &str, base: Option<&Path>) -> Result<PathBuf, String> {
    let decoded = percent_encoding::percent_decode_str(href).decode_utf8()
        .map_err(|err| err.to_string())?;
    let value = decoded.trim();
    let path = if value.to_ascii_lowercase().starts_with("file:") {
        url::Url::parse(href).map_err(|err| err.to_string())?
            .to_file_path().map_err(|_| "文件链接格式无效")?
    } else {
        // 兼容 Markdown 中常见的 /D:/项目/说明.md。
        let value = if value.as_bytes().get(0) == Some(&b'/')
            && value.as_bytes().get(2) == Some(&b':') { &value[1..] } else { value };
        PathBuf::from(value)
    };
    let path = if path.is_absolute() {
        path
    } else if let Some(base) = base {
        base.join(path)
    } else {
        return Err("请使用文档的绝对路径".into());
    };
    let path = fs::canonicalize(path).map_err(|err| format!("无法读取文档：{err}"))?;
    let extension = path.extension().and_then(|ext| ext.to_str()).unwrap_or("").to_ascii_lowercase();
    if !matches!(extension.as_str(), "md" | "markdown" | "txt") {
        return Err("暂仅支持 Markdown 和 TXT 文档预览".into());
    }
    if !path.is_file() { return Err("链接目标不是文档文件".into()); }
    Ok(path)
}

fn read_document(path: &Path) -> Result<PreviewDocument, String> {
    if fs::metadata(path).map_err(|err| err.to_string())?.len() > 5 * 1024 * 1024 {
        return Err("预览文档不能超过 5 MB".into());
    }
    let content = fs::read_to_string(path).map_err(|err| format!("无法读取 UTF-8 文档：{err}"))?;
    Ok(PreviewDocument {
        title: path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        path: path.to_string_lossy().into_owned(),
        content: content.trim_start_matches('\u{feff}').to_owned(),
    })
}

#[tauri::command]
pub async fn open_document_preview(app: AppHandle, window: WebviewWindow, href: String) -> Result<(), String> {
    let previews = app.state::<DocumentPreviews>();
    let base = previews.0.lock().map_err(|err| err.to_string())?
        .get(window.label()).and_then(|path| path.parent()).map(Path::to_path_buf);
    let path = document_path(&href, base.as_deref())?;
    let document = read_document(&path)?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let label = format!("document-preview-{stamp}");
    previews.0.lock().map_err(|err| err.to_string())?.insert(label.clone(), path);
    let result = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(format!("{} · 文档预览", document.title))
        .inner_size(1100.0, 780.0).min_inner_size(760.0, 500.0)
        .disable_drag_drop_handler().center().build();
    if let Err(err) = result {
        previews.0.lock().map_err(|err| err.to_string())?.remove(&label);
        return Err(format!("无法打开文档预览：{err}"));
    }
    Ok(())
}

#[tauri::command]
pub fn get_preview_document(app: AppHandle, window: WebviewWindow) -> Result<PreviewDocument, String> {
    let previews = app.state::<DocumentPreviews>();
    let path = previews.0.lock().map_err(|err| err.to_string())?
        .get(window.label()).cloned().ok_or("文档预览已失效")?;
    read_document(&path)
}

pub fn image_response(app: &AppHandle, label: &str, request_path: &str) -> tauri::http::Response<Vec<u8>> {
    let result = (|| {
        let previews = app.state::<DocumentPreviews>();
        let path = previews.0.lock().map_err(|err| err.to_string())?
            .get(label).cloned().ok_or("文档预览已失效")?;
        let directory = path.parent().ok_or("文档目录无效")?;
        let relative = percent_encoding::percent_decode_str(request_path.trim_start_matches('/'))
            .decode_utf8().map_err(|err| err.to_string())?;
        crate::storage::read_image_in_directory(directory, &relative)
    })();
    match result {
        Ok((data, mime)) => tauri::http::Response::builder()
            .header("Content-Type", mime).header("X-Content-Type-Options", "nosniff")
            .body(data).unwrap(),
        Err(_) => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_and_reads_local_markdown_without_modifying_it() {
        let directory = std::env::temp_dir().join(format!("kanboard-document-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("验证 说明.md");
        let content = "# 验证说明\n\n![截图](images/test.png)";
        fs::write(&path, content).unwrap();
        let expected = fs::canonicalize(&path).unwrap();
        assert_eq!(document_path(path.to_str().unwrap(), None).unwrap(), expected);
        assert_eq!(document_path("验证%20说明.md", Some(&directory)).unwrap(), expected);
        assert_eq!(document_path(url::Url::from_file_path(&path).unwrap().as_str(), None).unwrap(), expected);
        #[cfg(windows)]
        assert_eq!(document_path(&format!("/{}", path.to_string_lossy().replace('\\', "/")), None).unwrap(), expected);
        assert_eq!(read_document(&expected).unwrap().content, content);
        assert_eq!(fs::read_to_string(&path).unwrap(), content);
        fs::create_dir(directory.join("images")).unwrap();
        let image = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        fs::write(directory.join("images/screenshot.png"), image).unwrap();
        assert_eq!(crate::storage::read_image_in_directory(&directory, "images/screenshot.png").unwrap().0, image);
        assert!(crate::storage::read_image_in_directory(&directory.join("images"), "../验证 说明.md").is_err());
        assert!(document_path("missing.md", Some(&directory)).is_err());
        fs::write(directory.join("program.exe"), "text").unwrap();
        assert!(document_path("program.exe", Some(&directory)).is_err());
        fs::remove_file(path).unwrap();
        fs::remove_file(directory.join("program.exe")).unwrap();
        fs::remove_file(directory.join("images/screenshot.png")).unwrap();
        fs::remove_dir(directory.join("images")).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}

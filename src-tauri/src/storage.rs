use std::{
    borrow::Cow,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::prelude::*;
use serde::{Deserialize, Serialize};
use sqlx::{
    migrate::{Migration, MigrationType, Migrator},
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{DbInstances, DbPool};

const DATABASE_NAME: &str = "kanboard.db";
const LOCATION_FILE: &str = "storage-location.json";
const IMPORT_MARKER: &str = "import-pending.json";

pub struct StorageState {
    config_dir: PathBuf,
    current: Arc<Mutex<PathBuf>>,
}

#[derive(Deserialize, Serialize)]
struct Location {
    directory: PathBuf,
}

#[derive(Deserialize, Serialize)]
struct ImportPending {
    active: PathBuf,
    previous: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    path: String,
    directory: String,
    version: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentResult {
    pub relative_path: String,
    pub absolute_path: String,
    pub file_name: String,
    pub file_size: usize,
}

fn error(value: impl std::fmt::Display) -> String {
    value.to_string()
}

fn run_async<F: std::future::Future>(future: F) -> F::Output {
    if tokio::runtime::Handle::try_current().is_ok() {
        tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(future))
    } else {
        tauri::async_runtime::block_on(future)
    }
}

pub(crate) fn migrations() -> Migrator {
    let entries = [
        (
            1,
            "create_personal_task_wall",
            include_str!("../migrations/0001_initial.sql"),
        ),
        (
            2,
            "add_projects_and_tags",
            include_str!("../migrations/0002_projects_and_tags.sql"),
        ),
        (
            3,
            "add_flow_workflow",
            include_str!("../migrations/0003_flow_workflow.sql"),
        ),
        (
            4,
            "add_v2_productivity",
            include_str!("../migrations/0004_v2_productivity.sql"),
        ),
        (
            5,
            "add_task_trash",
            include_str!("../migrations/0005_task_trash.sql"),
        ),
        (
            6,
            "add_project_path",
            include_str!("../migrations/0006_project_path.sql"),
        ),
        (
            7,
            "add_task_review_notes",
            include_str!("../migrations/0007_task_review.sql"),
        ),
    ];
    Migrator {
        migrations: Cow::Owned(
            entries
                .into_iter()
                .map(|(version, description, sql)| {
                    Migration::new(
                        version,
                        description.into(),
                        MigrationType::ReversibleUp,
                        sql.into(),
                        false,
                    )
                })
                .collect(),
        ),
        ..Migrator::DEFAULT
    }
}

async fn connect(path: &Path, create: bool) -> Result<SqlitePool, String> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(create);
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(error)
}

async fn migrate(path: &Path) -> Result<(), String> {
    let pool = connect(path, true).await?;
    let result = migrations().run(&pool).await.map_err(error);
    pool.close().await;
    result
}

async fn validate(path: &Path) -> Result<(), String> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(error)?;
    let result = async {
        let check: String = sqlx::query_scalar("PRAGMA integrity_check").fetch_one(&pool).await.map_err(error)?;
        if check != "ok" { return Err(format!("数据库完整性检查失败：{check}")); }
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('task_columns', 'tasks', 'projects')",
        ).fetch_one(&pool).await.map_err(error)?;
        if count != 3 { return Err("所选文件不是看板数据库".into()); }
        Ok(())
    }.await;
    pool.close().await;
    result
}

fn unique_path(directory: &Path, prefix: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    directory.join(format!("{prefix}-{stamp}-{}.db", std::process::id()))
}

fn recover_pending_import(config_dir: &Path) -> Result<(), String> {
    let marker = config_dir.join(IMPORT_MARKER);
    if !marker.exists() {
        return Ok(());
    }
    let pending: ImportPending =
        serde_json::from_slice(&fs::read(&marker).map_err(error)?).map_err(error)?;
    if !pending.active.exists() {
        fs::rename(&pending.previous, &pending.active).map_err(error)?;
    }
    fs::remove_file(marker).map_err(error)
}

fn current_path(state: &StorageState) -> PathBuf {
    state
        .current
        .lock()
        .expect("storage state lock poisoned")
        .clone()
}

fn info(app: &AppHandle, state: &StorageState) -> StorageInfo {
    let path = current_path(state);
    StorageInfo {
        directory: path
            .parent()
            .unwrap_or(&state.config_dir)
            .to_string_lossy()
            .into_owned(),
        path: path.to_string_lossy().into_owned(),
        version: app.package_info().version.to_string(),
    }
}

fn database_url(path: &Path) -> String {
    format!("sqlite:{}", path.to_string_lossy())
}

async fn snapshot(pool: &SqlitePool, target: &Path) -> Result<(), String> {
    sqlx::query("VACUUM INTO ?")
        .bind(target.to_string_lossy().into_owned())
        .execute(pool)
        .await
        .map_err(error)?;
    validate(target).await
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

pub fn initialize(app: &AppHandle) -> Result<StorageState, String> {
    let config_dir = app.path().app_config_dir().map_err(error)?;
    fs::create_dir_all(&config_dir).map_err(error)?;
    recover_pending_import(&config_dir)?;
    let location_file = config_dir.join(LOCATION_FILE);
    let path = if location_file.exists() {
        let location: Location =
            serde_json::from_slice(&fs::read(&location_file).map_err(error)?).map_err(error)?;
        if !location.directory.is_absolute() || !location.directory.is_dir() {
            return Err(format!("存储目录不可用：{}", location.directory.display()));
        }
        let path = location.directory.join(DATABASE_NAME);
        if !path.is_file() {
            return Err(format!("存储目录中找不到数据库：{}", path.display()));
        }
        path
    } else {
        config_dir.join(DATABASE_NAME)
    };
    run_async(migrate(&path))?;
    Ok(StorageState {
        config_dir,
        current: Arc::new(Mutex::new(path)),
    })
}

pub(crate) fn current_path_handle(state: &StorageState) -> Arc<Mutex<PathBuf>> {
    state.current.clone()
}

#[tauri::command]
pub fn get_storage_info(app: AppHandle, state: tauri::State<'_, StorageState>) -> StorageInfo {
    info(&app, &state)
}

#[tauri::command]
pub fn get_database_url(state: tauri::State<'_, StorageState>) -> String {
    database_url(&current_path(&state))
}

#[tauri::command]
pub async fn export_data(
    app: AppHandle,
    state: tauri::State<'_, StorageState>,
    path: String,
) -> Result<(), String> {
    let target = PathBuf::from(path);
    if !target.is_absolute() {
        return Err("请选择有效的备份路径".into());
    }
    let db_path = current_path(&state);
    if target.exists()
        && fs::canonicalize(&target).map_err(error)? == fs::canonicalize(&db_path).map_err(error)?
    {
        return Err("不能将备份覆盖到当前数据库".into());
    }
    let directory = target.parent().ok_or("备份路径无效")?;
    let temporary = unique_path(directory, "kanboard-export");
    let instances = app.state::<DbInstances>();
    let guard = instances.0.write().await;
    let Some(DbPool::Sqlite(pool)) = guard.get(&database_url(&db_path)) else {
        return Err("数据库尚未加载".into());
    };
    if let Err(err) = snapshot(pool, &temporary).await {
        let _ = fs::remove_file(&temporary);
        return Err(err);
    }
    if target.exists() {
        let previous = unique_path(directory, "kanboard-previous-export");
        fs::rename(&target, &previous).map_err(error)?;
        if let Err(err) = fs::rename(&temporary, &target) {
            fs::rename(&previous, &target).map_err(error)?;
            return Err(error(err));
        }
        let _ = fs::remove_file(previous);
    } else {
        fs::rename(&temporary, &target).map_err(error)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn move_storage(
    app: AppHandle,
    state: tauri::State<'_, StorageState>,
    directory: String,
) -> Result<StorageInfo, String> {
    if app.get_webview_window("quick-capture").is_some() {
        return Err("请先关闭快速记录窗口，再更改存储目录".into());
    }
    let target_dir = PathBuf::from(directory);
    if !target_dir.is_absolute() || !target_dir.is_dir() {
        return Err("请选择文件夹".into());
    }
    let old_path = current_path(&state);
    if old_path.parent() == Some(target_dir.as_path()) {
        return Ok(info(&app, &state));
    }
    let target = target_dir.join(DATABASE_NAME);
    if target.exists() {
        return Err(format!("目标目录已有 {DATABASE_NAME}，请先选择其他目录"));
    }

    let instances = app.state::<DbInstances>();
    let mut guard = instances.0.write().await;
    let Some(DbPool::Sqlite(pool)) = guard.get(&database_url(&old_path)) else {
        return Err("数据库尚未加载".into());
    };
    if let Err(err) = snapshot(pool, &target).await {
        let _ = fs::remove_file(&target);
        return Err(err);
    }
    let location = serde_json::to_vec(&Location {
        directory: target_dir.clone(),
    })
    .map_err(error)?;
    if let Err(err) = fs::write(state.config_dir.join(LOCATION_FILE), location) {
        let _ = fs::remove_file(&target);
        return Err(error(err));
    }

    // 随同将 attachments 附件目录迁移至新目录
    if let Some(old_parent) = old_path.parent() {
        let old_attachments = old_parent.join("attachments");
        if old_attachments.is_dir() {
            let target_attachments = target_dir.join("attachments");
            let _ = copy_dir_all(&old_attachments, &target_attachments);
        }
    }

    for DbPool::Sqlite(pool) in guard.values() {
        pool.close().await;
    }
    guard.clear();
    *state.current.lock().expect("storage state lock poisoned") = target;
    drop(guard);
    Ok(info(&app, &state))
}

#[tauri::command]
pub async fn import_data(
    app: AppHandle,
    state: tauri::State<'_, StorageState>,
    path: String,
) -> Result<String, String> {
    if app.get_webview_window("quick-capture").is_some() {
        return Err("请先关闭快速记录窗口，再导入数据".into());
    }
    let source = PathBuf::from(path);
    let active = current_path(&state);
    if !source.is_file()
        || fs::canonicalize(&source).map_err(error)? == fs::canonicalize(&active).map_err(error)?
    {
        return Err("请选择其他看板备份文件".into());
    }
    validate(&source).await?;
    let directory = active.parent().ok_or("当前数据库路径无效")?;
    let incoming = unique_path(directory, "kanboard-import");
    let source_pool = connect(&source, false).await?;
    let result = snapshot(&source_pool, &incoming).await;
    source_pool.close().await;
    if let Err(err) = result {
        let _ = fs::remove_file(&incoming);
        return Err(err);
    }
    if let Err(err) = migrate(&incoming).await {
        let _ = fs::remove_file(&incoming);
        return Err(err);
    }

    let instances = app.state::<DbInstances>();
    let mut guard = instances.0.write().await;
    let previous = unique_path(directory, "kanboard-before-import");
    let marker = state.config_dir.join(IMPORT_MARKER);
    fs::write(
        &marker,
        serde_json::to_vec(&ImportPending {
            active: active.clone(),
            previous: previous.clone(),
        })
        .map_err(error)?,
    )
    .map_err(error)?;
    for DbPool::Sqlite(pool) in guard.values() {
        pool.close().await;
    }
    guard.clear();
    if let Err(err) = fs::rename(&active, &previous) {
        let _ = fs::remove_file(&marker);
        guard.insert(
            database_url(&active),
            DbPool::Sqlite(connect(&active, false).await?),
        );
        return Err(error(err));
    }
    if let Err(err) = fs::rename(&incoming, &active) {
        fs::rename(&previous, &active).map_err(error)?;
        let _ = fs::remove_file(&marker);
        guard.insert(
            database_url(&active),
            DbPool::Sqlite(connect(&active, false).await?),
        );
        return Err(error(err));
    }
    let _ = fs::remove_file(marker);
    drop(guard);
    Ok(previous.to_string_lossy().into_owned())
}

fn detect_image_format(data: &[u8], hint_ext: Option<&str>) -> Result<&'static str, String> {
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        Ok("png")
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Ok("jpg")
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        Ok("gif")
    } else if data.len() > 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        Ok("webp")
    } else if data.starts_with(b"BM") {
        Ok("bmp")
    } else if let Ok(s) = std::str::from_utf8(data) {
        let trimmed = s.trim_start();
        if trimmed.starts_with("<svg") || (trimmed.starts_with("<?xml") && trimmed.contains("<svg")) {
            Ok("svg")
        } else {
            Err("不支持的图片格式：非合法矢量或位图".into())
        }
    } else if let Some(ext) = hint_ext {
        match ext.to_lowercase().as_str() {
            "png" => Ok("png"),
            "jpg" | "jpeg" => Ok("jpg"),
            "gif" => Ok("gif"),
            "webp" => Ok("webp"),
            "bmp" => Ok("bmp"),
            "svg" => Ok("svg"),
            _ => Err("不支持的图片扩展名".into()),
        }
    } else {
        Err("不支持的图片格式".into())
    }
}

fn sanitize_stem(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(30)
        .collect()
}

pub fn save_image_attachment_impl(
    storage_dir: &Path,
    file_name: &str,
    data_base64: &str,
) -> Result<AttachmentResult, String> {
    let raw_b64 = if let Some(pos) = data_base64.find("base64,") {
        &data_base64[pos + 7..]
    } else {
        data_base64
    };

    let data = BASE64_STANDARD.decode(raw_b64.trim()).map_err(error)?;
    if data.is_empty() {
        return Err("图片数据不能为空".into());
    }
    if data.len() > 20 * 1024 * 1024 {
        return Err("图片大小不能超过 20MB".into());
    }

    let hint_ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str());
    let ext = detect_image_format(&data, hint_ext)?;

    let now = chrono::Local::now();
    let year = now.format("%Y").to_string();
    let month = now.format("%m").to_string();
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(sanitize_stem)
        .unwrap_or_default();

    let final_name = if stem.is_empty() || stem == "image" || stem == "blob" {
        format!("img_{timestamp}_{stamp:06x}.{ext}")
    } else {
        format!("{stem}_{timestamp}_{stamp:06x}.{ext}")
    };

    let attachments_dir = storage_dir.join("attachments");
    let sub_dir = attachments_dir.join(&year).join(&month);
    fs::create_dir_all(&sub_dir).map_err(error)?;

    let canonical_storage = fs::canonicalize(storage_dir).map_err(error)?;
    let canonical_sub_dir = fs::canonicalize(&sub_dir).map_err(error)?;
    if !canonical_sub_dir.starts_with(&canonical_storage) {
        return Err("非法存储路径：超出允许目录范围".into());
    }

    let target_file = sub_dir.join(&final_name);
    fs::write(&target_file, &data).map_err(error)?;

    let relative_path = format!("attachments/{year}/{month}/{final_name}");
    let absolute_path = target_file.to_string_lossy().replace('\\', "/");

    Ok(AttachmentResult {
        relative_path,
        absolute_path,
        file_name: final_name,
        file_size: data.len(),
    })
}

#[tauri::command]
pub fn save_image_attachment(
    state: tauri::State<'_, StorageState>,
    file_name: String,
    data_base64: String,
) -> Result<AttachmentResult, String> {
    let db_path = current_path(&state);
    let storage_dir = db_path.parent().ok_or("数据库路径无效")?;
    save_image_attachment_impl(storage_dir, &file_name, &data_base64)
}

#[tauri::command]
pub fn resolve_attachment_path(
    state: tauri::State<'_, StorageState>,
    relative_path: String,
) -> Result<String, String> {
    if relative_path.contains("..")
        || relative_path.starts_with('/')
        || relative_path.starts_with('\\')
        || relative_path.contains(':')
    {
        return Err("非法路径参数".into());
    }
    let db_path = current_path(&state);
    let storage_dir = db_path.parent().ok_or("数据库路径无效")?;
    let target = storage_dir.join(&relative_path);
    if !target.exists() {
        return Err("附件不存在".into());
    }
    let canonical_storage = fs::canonicalize(storage_dir).map_err(error)?;
    let canonical_target = fs::canonicalize(&target).map_err(error)?;
    if !canonical_target.starts_with(&canonical_storage) {
        return Err("非法路径参数：超出允许目录范围".into());
    }
    Ok(canonical_target.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrated_database_can_be_exported_and_reopened() {
        tauri::async_runtime::block_on(async {
            let directory = std::env::temp_dir().join(format!(
                "kanboard-storage-test-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
            ));
            fs::create_dir(&directory).unwrap();
            let database = directory.join(DATABASE_NAME);
            let backup = directory.join("backup.db");

            migrate(&database).await.unwrap();
            let mut plugin_path = directory.join("app-config");
            plugin_path.push(database.as_os_str());
            assert_eq!(plugin_path, database);
            let url_pool = SqlitePool::connect(&database_url(&database)).await.unwrap();
            url_pool.close().await;
            let pool = connect(&database, false).await.unwrap();
            snapshot(&pool, &backup).await.unwrap();
            pool.close().await;
            validate(&backup).await.unwrap();
            migrate(&backup).await.unwrap();

            let previous = directory.join("before-import.db");
            fs::rename(&database, &previous).unwrap();
            fs::write(
                directory.join(IMPORT_MARKER),
                serde_json::to_vec(&ImportPending {
                    active: database.clone(),
                    previous,
                })
                .unwrap(),
            )
            .unwrap();
            recover_pending_import(&directory).unwrap();
            validate(&database).await.unwrap();

            fs::remove_file(database).unwrap();
            fs::remove_file(backup).unwrap();
            fs::remove_dir(directory).unwrap();
        });
    }

    #[test]
    fn save_image_attachment_and_validation() {
        let temp_dir = std::env::temp_dir().join(format!(
            "kanboard-att-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        // 1. Valid 1x1 PNG data
        let valid_png_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        let res = save_image_attachment_impl(&temp_dir, "test.png", valid_png_base64).unwrap();
        assert!(res.relative_path.starts_with("attachments/"));
        assert!(res.relative_path.ends_with(".png"));
        assert!(Path::new(&res.absolute_path).is_file());
        assert_eq!(res.file_size, 70);

        // 2. Reject empty data
        assert!(save_image_attachment_impl(&temp_dir, "test.png", "").is_err());

        // 3. Reject corrupted non-image data
        let invalid_base64 = BASE64_STANDARD.encode(b"not an image text");
        assert!(save_image_attachment_impl(&temp_dir, "test.png", &invalid_base64).is_err());

        let _ = fs::remove_dir_all(temp_dir);
    }
}

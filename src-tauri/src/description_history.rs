use chrono::Utc;
use serde::Serialize;
use sqlx::{Row, SqlitePool};
use tauri::Emitter;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DescriptionVersion {
    pub version: i64,
    pub description: String,
    pub previous_description: String,
    pub summary: String,
    pub source: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityNote {
    pub kind: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DescriptionHistory {
    pub versions: Vec<DescriptionVersion>,
    pub notes: Vec<ActivityNote>,
}

pub async fn load(pool: &SqlitePool, task_id: &str) -> Result<DescriptionHistory, sqlx::Error> {
    let versions = sqlx::query("SELECT version, description, previous_description, summary, source, created_at FROM task_description_versions WHERE task_id = ? AND source = 'agent' ORDER BY version DESC")
        .bind(task_id).fetch_all(pool).await?.into_iter().map(|row| DescriptionVersion {
            version: row.get("version"), description: row.get("description"), previous_description: row.get("previous_description"),
            summary: row.get("summary"), source: row.get("source"), created_at: row.get("created_at"),
        }).collect();
    let notes = sqlx::query("SELECT kind, content, created_at FROM task_activity_notes WHERE task_id = ? ORDER BY id DESC")
        .bind(task_id).fetch_all(pool).await?.into_iter().map(|row| ActivityNote {
            kind: row.get("kind"), content: row.get("content"), created_at: row.get("created_at"),
        }).collect();
    Ok(DescriptionHistory { versions, notes })
}

pub async fn record_note(pool: &SqlitePool, task_id: &str, kind: &str, content: &str, now: &str) -> Result<(), sqlx::Error> {
    if !content.trim().is_empty() {
        sqlx::query("INSERT INTO task_activity_notes (task_id, kind, content, created_at) VALUES (?, ?, ?, ?)")
            .bind(task_id).bind(kind).bind(content.trim()).bind(now).execute(pool).await?;
    }
    Ok(())
}

// The conditional write and history trigger run in the same SQLite statement.
pub async fn update(pool: &SqlitePool, task_id: &str, description: &str, summary: &str, expected_description: &str, source: &str) -> Result<(), String> {
    if summary.trim().is_empty() { return Err("请填写本次任务说明的修改摘要".into()); }
    let result = sqlx::query("UPDATE tasks SET description = ?, description_summary = ?, description_source = ?, updated_at = ?, in_agent_sop = CASE WHEN ? = 'agent' AND column_id NOT IN ('verify', 'done') THEN 1 ELSE in_agent_sop END WHERE id = ? AND deleted_at IS NULL AND (description = ? OR description = ?)")
        .bind(description).bind(summary.trim()).bind(source).bind(Utc::now().to_rfc3339())
        .bind(source).bind(task_id).bind(expected_description).bind(description)
        .execute(pool).await.map_err(|err| err.to_string())?;
    if result.rows_affected() == 0 {
        return Err("任务说明已被其他操作修改或任务已删除，请刷新后对比最新版本再保存".into());
    }
    Ok(())
}

async fn pool(state: &crate::storage::StorageState) -> Result<SqlitePool, String> {
    let path = crate::storage::current_path_handle(state).lock().map_err(|err| err.to_string())?.clone();
    crate::storage::connect(&path, false).await
}

#[tauri::command]
pub async fn list_task_description_versions(state: tauri::State<'_, crate::storage::StorageState>, task_id: String) -> Result<DescriptionHistory, String> {
    let pool = pool(&state).await?;
    let result = load(&pool, &task_id).await.map_err(|err| err.to_string());
    pool.close().await;
    result
}

#[tauri::command]
pub async fn update_task_description(app: tauri::AppHandle, state: tauri::State<'_, crate::storage::StorageState>, task_id: String, description: String, expected_description: String) -> Result<(), String> {
    let pool = pool(&state).await?;
    let result = update(&pool, &task_id, &description, "手动编辑", &expected_description, "user").await;
    pool.close().await;
    if result.is_ok() { let _ = app.emit("mcp:task-updated", serde_json::json!({ "taskId": task_id })); }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn database() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        crate::storage::migrations().run(&pool).await.unwrap();
        sqlx::query("INSERT INTO tasks (id, column_id, title, description, position, created_at, updated_at) VALUES ('task', 'todo', '任务', '原始说明', 1000, '2026-10-27T00:00:00Z', '2026-10-27T00:00:00Z')")
            .execute(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn records_versions_atomically_and_rejects_stale_writes() {
        let pool = database().await;
        update(&pool, "task", "# 新需求\n\n[方案](/D:/项目/方案.md)", "补充方案链接", "原始说明", "agent").await.unwrap();
        let history = load(&pool, "task").await.unwrap();
        assert_eq!(history.versions.len(), 1);
        assert_eq!(history.versions[0].summary, "补充方案链接");
        assert_eq!(history.versions[0].source, "agent");
        assert_eq!(history.versions[0].previous_description, "原始说明");
        assert!(update(&pool, "task", "过期覆盖", "变更", "原始说明", "user").await.is_err());
        assert!(update(&pool, "task", "无摘要", " ", "原始说明", "agent").await.is_err());
        assert_eq!(load(&pool, "task").await.unwrap().versions.len(), 1);
        // Retrying the same body does not create a duplicate revision.
        update(&pool, "task", &history.versions[0].description, "重试", "原始说明", "agent").await.unwrap();
        assert_eq!(load(&pool, "task").await.unwrap().versions.len(), 1);
        record_note(&pool, "task", "blocked", "等待环境", "2026-10-27T00:00:00Z").await.unwrap();
        assert_eq!(load(&pool, "task").await.unwrap().notes.len(), 1);
        assert_eq!(load(&pool, "task").await.unwrap().versions.len(), 1);
        // Clearing is an intentional new version; empty content is preserved.
        update(&pool, "task", "", "清空说明", &history.versions[0].description, "agent").await.unwrap();
        let history = load(&pool, "task").await.unwrap();
        assert_eq!(history.versions[0].description, "");
        assert_eq!(history.versions[0].version, 2);
        sqlx::query("DELETE FROM tasks WHERE id = 'task'").execute(&pool).await.unwrap();
        assert!(load(&pool, "task").await.unwrap().versions.is_empty());
        assert!(load(&pool, "task").await.unwrap().notes.is_empty());
    }

    #[tokio::test]
    async fn manual_edits_are_not_revisions_and_agent_diff_uses_the_real_previous_body() {
        let pool = database().await;
        assert!(load(&pool, "task").await.unwrap().versions.is_empty());
        update(&pool, "task", "人工整理", "手动编辑", "原始说明", "user").await.unwrap();
        assert!(load(&pool, "task").await.unwrap().versions.is_empty());
        update(&pool, "task", "Agent 修订", "补充验收", "人工整理", "agent").await.unwrap();
        update(&pool, "task", "再次人工整理", "手动编辑", "Agent 修订", "user").await.unwrap();
        let history = load(&pool, "task").await.unwrap();
        assert_eq!(history.versions.len(), 1);
        assert_eq!(history.versions[0].previous_description, "人工整理");
        assert_eq!(history.versions[0].description, "Agent 修订");
        update(&pool, "task", "第二次 Agent 修订", "调整验收", "再次人工整理", "agent").await.unwrap();
        let history = load(&pool, "task").await.unwrap();
        assert_eq!(history.versions.len(), 2);
        assert_eq!(history.versions[0].previous_description, "再次人工整理");
    }

    #[tokio::test]
    async fn upgrade_keeps_agent_changes_with_their_preceding_manual_body() {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        let mut prior = crate::storage::migrations();
        prior.migrations = std::borrow::Cow::Owned(prior.migrations.iter().filter(|item| item.version <= 10).cloned().collect());
        prior.run(&pool).await.unwrap();
        sqlx::query("INSERT INTO tasks (id, column_id, title, description, position, created_at, updated_at) VALUES ('old', 'todo', '旧任务', '原始说明', 1000, 'now', 'now')")
            .execute(&pool).await.unwrap();
        update(&pool, "old", "人工调整", "手动编辑", "原始说明", "user").await.unwrap();
        update(&pool, "old", "Agent 修改", "明确验收", "人工调整", "agent").await.unwrap();
        crate::storage::migrations().run(&pool).await.unwrap();
        let history = load(&pool, "old").await.unwrap();
        assert_eq!(history.versions.len(), 1);
        assert_eq!(history.versions[0].previous_description, "人工调整");
        assert_eq!(history.versions[0].description, "Agent 修改");
        let current: String = sqlx::query_scalar("SELECT description FROM tasks WHERE id = 'old'").fetch_one(&pool).await.unwrap();
        assert_eq!(current, "Agent 修改");
        update(&pool, "old", "人工再改", "手动编辑", "Agent 修改", "user").await.unwrap();
        assert_eq!(load(&pool, "old").await.unwrap().versions.len(), 1);
    }
}

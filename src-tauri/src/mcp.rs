use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use axum::Router;
use chrono::{DateTime, Duration, Local, Utc};
use rmcp::{
    handler::server::wrapper::Parameters,
    model::CallToolResult,
    schemars, tool, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig,
        StreamableHttpService,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqlitePool};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{net::TcpListener, sync::Mutex as AsyncMutex, task::JoinHandle};
use tokio_util::sync::CancellationToken;

const MCP_PORT: u16 = 47_831;
const MCP_SETTINGS_FILE: &str = "mcp-settings.json";
const MCP_URL: &str = "http://127.0.0.1:47831/mcp";
const PLUGIN_NAME: &str = "kanboard-agent";
const MARKETPLACE_NAME: &str = "kanboard-local";

const PLUGIN_MANIFEST: &str = include_str!("../../plugins/kanboard-agent/.codex-plugin/plugin.json");
const PLUGIN_MCP: &str = include_str!("../../plugins/kanboard-agent/.mcp.json");
const PLUGIN_SKILL: &str = include_str!("../../plugins/kanboard-agent/skills/kanboard-assistant/SKILL.md");

#[derive(Debug, Default, Deserialize, Serialize)]
struct McpSettings {
    enabled: bool,
}

struct ServerProcess {
    cancellation: CancellationToken,
    task: JoinHandle<()>,
}

struct McpController {
    enabled: bool,
    process: Option<ServerProcess>,
    last_error: Option<String>,
}

pub struct McpState {
    app: Option<AppHandle>,
    settings_path: PathBuf,
    database_path: Arc<Mutex<PathBuf>>,
    controller: AsyncMutex<McpController>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    enabled: bool,
    running: bool,
    url: &'static str,
    last_error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexConnection {
    marketplace_path: String,
    deep_link: String,
    opened: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AntigravityConnection {
    pub config_path: String,
    pub configured: bool,
}

pub const DEFAULT_SOP_SUMMARY: &str = "请按 Kanboard SOP 执行该任务：前往本地项目路径开发，完成后流转至「待验证」并提交验证方案（可读性优先：必要时使用表格、清单与代码块分项排版，避免单行堆砌，严格遵守中文文案排版指北，严禁使用 emoji）。";

pub const DEFAULT_SOP_CONTENT: &str = r#"### 任务接单与自主执行 SOP（标准作业流程）

当用户在对话中给出【看板任务】、拖入任务或指定任务 ID（如 UUID）要求处理/执行时，必须严格按照如下流程自主推进：

1. **查阅任务详情与上下文**：
   - 调用 `get_task(task_id)` 查询任务需求描述、检查清单（Checklist）及所属项目的本地工作区绝对路径（`task.project.path`）。
2. **移入进行中**：
   - 调用 `update_task_status(task_id, status="doing")` 将任务标记为进行中（系统将自动记录开始时间）。
3. **定位本地仓库开发**：
   - 切换或聚焦至项目本地路径（`project.path`）进行代码编写、修改与本地调试。若未配置路径，可主动询问用户或调用 `set_project_path`。
4. **实时追踪检查清单**：
   - 逐步完成任务子项时，调用 `update_checklist_item(task_id, item_id, completed=true)` 实时打钩，保持看板状态与实际研发进度同步。
5. **异常与阻塞上报（不可抗力或疑问）**：
   - 若遇到单测未过、环境缺失、第三方依赖受阻、物料短缺或需要人工决策的卡点，**严禁自行猜测或强行推进**。
   - 必须调用 `set_task_blocked(task_id, reason="...", detail="...")`，详细阐明卡点背景，桌面端将立即收到通知并弹窗告警，等待用户协助。
6. **提测流转（重要：禁止直接标为 `done`）**：
   - **Agent 严禁自行将任务变更为 `done`**，最终完成状态必须由人类用户验收确认。
   - 当所有工作完成并通过本地测试后，**调用专用提测工具**：
     `submit_task_verification(task_id, implementation="...", summary="...", test_guide="...")`
     该工具将自动将任务移至「**待验证**（`verify`）」列，并将结构化交付文档记录于独立的「**验证方案**」选项卡中供人工审核。
   - **实际截图附件**：自行校验中已有的相关截图，应先调用 `import_image_attachment(file_path="本机截图绝对路径")` 导入。工具将图片复制到当前 SQLite 数据库同级的 `attachments` 目录，保留原件。将返回的 `markdown` 写入验证方案，并标明页面状态或验证点；引用格式为 `![验证点](attachments/年/月/文件名.png)`。不得把项目绝对路径、`file://` 或临时显示协议地址写入方案。导入失败时如实报告原因，不得宣称已附图。没有截图时如实说明实际验证方式，无须额外生成截图。
   - **排版与格式规范要求（可读性优先，严格遵守）**：
     - **严禁单行推到底**：严禁将核心改动、交付成果或测试步骤写成无分段、无排版的单行长文本！必须结构化分项呈现，可读性放在第一位。
     - **必要时必须使用 Markdown 表格（Table）**：
       - 涉及多个模块、文件或逻辑改动时，**必须优先使用表格**清晰对比展现（例如 `| 模块 / 文件 | 改动类型 | 核心逻辑说明 |`）；
       - 涉及多项测试命令或验收条件时，**必须优先使用表格**结构化罗列（例如 `| 验证项 | 测试命令 / 操作路径 | 预期效果 |`）。
     - **善用 Markdown 代码块与复选清单**：
       - 执行命令必须放入带有语言标签的代码块（如 ```bash ... ```）；
       - 交付项与 Checklist 达成情况必须使用复选清单 `- [x]` 分项列出。
     - **遵循《中文文案排版指北》规范**：严格遵循 mzlogin/chinese-copywriting-guidelines：
       - 中文与英文之间必须增加空格（例如 `使用 MCP 服务` 而非 `使用MCP服务`）；
       - 中文与数字之间必须增加空格（例如 `新增 3 个测试用例` 而非 `新增3个测试用例`）；
       - 数字与单位之间增加空格（例如 `耗时 120 ms`，度数与百分比除外如 `100%`）；
       - 中文语句使用全角标点符号（，。！？：；“”‘’《》（）），代码、英文短语及文件路径使用半角；
       - 英文专有名词保持标准大小写（例如 `Markdown`、`Git`、`MCP`、`API`、`UI`）。
     - **严禁包含任何 emoji**：不得包含任何 emoji 表情符号或装饰图标，保持中性纯文本专业质感。

#### 验证方案标准参考模版

调用 `submit_task_verification` 时各入参推荐格式如下：

- **`implementation` 示例**：
  ```markdown
  | 模块 / 文件 | 改动类型 | 核心逻辑说明 |
  | :--- | :--- | :--- |
  | `src/components/TaskInspector.vue` | UI 重构 | 增加 Markdown 渲染视图，支持预览与源码编辑模式无缝切换 |
  | `src-tauri/src/mcp.rs` | 接口规范 | 更新提测工具入参描述，强化表格化多维交付与排版指北约束 |
  | `src/styles.css` | 样式优化 | 为表格、代码块及列表增加中性质感边框与适宜行高 |
  ```

- **`summary` 示例**：
  ```markdown
  - [x] **Markdown 表格与视图渲染**：完成前端界面支持，提升复杂文档可读性。
  - [x] **中文文案排版指北**：严格检查并规范中英文与数字间空格，彻底杜绝单行推底。
  - [x] **测试覆盖**：新增 2 项验证测试，覆盖表格与渲染切换，全量测试 100% 通过。
  ```

- **`test_guide` 示例**：
  ```markdown
  | 验证项 | 测试命令 / 操作路径 | 预期结果 |
  | :--- | :--- | :--- |
  | 前端单元测试 | `npm test` | 全部单测通过 |
  | 后端单元测试 | `cargo test --manifest-path src-tauri/Cargo.toml` | 全部单测通过 |
  | 界面交互验收 | 在看板中打开待验证任务检查器，查看「验证方案」Tab | Markdown 表格与内容优雅排版，可正常切换编辑与预览 |
  ```"#;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SopConfig {
    pub id: String,
    pub summary: String,
    pub content: String,
    pub is_custom: bool,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SetCustomSopInput {
    /// SOP 概述内容（用于任务下发时注入 Prompt 引导 Agent）
    summary: String,
    /// 完整 SOP Markdown 规范文档内容
    content: String,
}

impl McpState {
    async fn pool(&self) -> Result<SqlitePool, String> {
        let path = self
            .database_path
            .lock()
            .map_err(error)?
            .clone();
        let options = SqliteConnectOptions::new()
            .filename(path)
            .busy_timeout(std::time::Duration::from_secs(5));
        SqlitePool::connect_with(options).await.map_err(error)
    }

    async fn status(&self) -> McpStatus {
        let controller = self.controller.lock().await;
        McpStatus {
            enabled: controller.enabled,
            running: controller
                .process
                .as_ref()
                .is_some_and(|process| !process.task.is_finished()),
            url: MCP_URL,
            last_error: controller.last_error.clone(),
        }
    }

    async fn set_enabled(&self, enabled: bool) -> Result<McpStatus, String> {
        if enabled {
            self.start().await?;
            self.save_settings(true)?;
            let mut controller = self.controller.lock().await;
            controller.enabled = true;
        } else {
            self.save_settings(false)?;
            self.stop().await;
            let mut controller = self.controller.lock().await;
            controller.enabled = false;
            controller.last_error = None;
        }
        Ok(self.status().await)
    }

    async fn start(&self) -> Result<(), String> {
        let mut controller = self.controller.lock().await;
        if controller
            .process
            .as_ref()
            .is_some_and(|process| !process.task.is_finished())
        {
            controller.last_error = None;
            return Ok(());
        }

        controller.process = None;
        let listener = TcpListener::bind(("127.0.0.1", MCP_PORT))
            .await
            .map_err(|error| format!("无法启动 MCP 服务：{error}"))?;
        let cancellation = CancellationToken::new();
        let database_path = self.database_path.clone();
        let app = self.app.clone();
        let service_cancellation = cancellation.child_token();
        let shutdown = cancellation.clone();
        let service = StreamableHttpService::new(
            move || Ok(KanboardMcp::new(database_path.clone(), app.clone())),
            LocalSessionManager::default().into(),
            StreamableHttpServerConfig::default()
                .with_json_response(true)
                .with_cancellation_token(service_cancellation),
        );
        let router = Router::new().nest_service("/mcp", service);
        let task = tokio::spawn(async move {
            if let Err(error) = axum::serve(listener, router)
                .with_graceful_shutdown(shutdown.cancelled_owned())
                .await
            {
                eprintln!("MCP server stopped unexpectedly: {error}");
            }
        });
        controller.process = Some(ServerProcess { cancellation, task });
        controller.last_error = None;
        Ok(())
    }

    async fn stop(&self) {
        let process = self.controller.lock().await.process.take();
        if let Some(process) = process {
            process.cancellation.cancel();
            let _ = process.task.await;
        }
    }

    fn save_settings(&self, enabled: bool) -> Result<(), String> {
        fs::write(
            &self.settings_path,
            serde_json::to_vec_pretty(&McpSettings { enabled }).map_err(error)?,
        )
        .map_err(error)
    }
}

pub async fn initialize(
    app: &AppHandle,
    database_path: Arc<Mutex<PathBuf>>,
) -> Result<McpState, String> {
    let config_dir = app.path().app_config_dir().map_err(error)?;
    fs::create_dir_all(&config_dir).map_err(error)?;
    let settings_path = config_dir.join(MCP_SETTINGS_FILE);
    let settings = if settings_path.is_file() {
        serde_json::from_slice::<McpSettings>(&fs::read(&settings_path).map_err(error)?)
            .map_err(error)?
    } else {
        McpSettings::default()
    };
    let state = McpState {
        app: Some(app.clone()),
        settings_path,
        database_path,
        controller: AsyncMutex::new(McpController {
            enabled: settings.enabled,
            process: None,
            last_error: None,
        }),
    };
    if settings.enabled {
        if let Err(start_error) = state.start().await {
            state.controller.lock().await.last_error = Some(start_error);
        }
    }
    Ok(state)
}

#[tauri::command]
pub async fn get_mcp_status(state: tauri::State<'_, McpState>) -> Result<McpStatus, String> {
    Ok(state.status().await)
}

#[tauri::command]
pub async fn set_mcp_enabled(
    enabled: bool,
    state: tauri::State<'_, McpState>,
) -> Result<McpStatus, String> {
    state.set_enabled(enabled).await
}

#[tauri::command]
pub async fn connect_codex(
    app: AppHandle,
    state: tauri::State<'_, McpState>,
) -> Result<CodexConnection, String> {
    state.set_enabled(true).await?;
    let root = app
        .path()
        .app_config_dir()
        .map_err(error)?
        .join("codex-integration");
    let plugin = root.join("plugins").join(PLUGIN_NAME);
    fs::create_dir_all(plugin.join(".codex-plugin")).map_err(error)?;
    fs::create_dir_all(plugin.join("skills").join("kanboard-assistant")).map_err(error)?;
    fs::write(plugin.join(".codex-plugin").join("plugin.json"), PLUGIN_MANIFEST)
        .map_err(error)?;
    fs::write(plugin.join(".mcp.json"), PLUGIN_MCP).map_err(error)?;
    fs::write(
        plugin
            .join("skills")
            .join("kanboard-assistant")
            .join("SKILL.md"),
        PLUGIN_SKILL,
    )
    .map_err(error)?;

    let marketplace_dir = root.join(".agents").join("plugins");
    fs::create_dir_all(&marketplace_dir).map_err(error)?;
    let marketplace_path = marketplace_dir.join("marketplace.json");
    let marketplace = json!({
        "name": MARKETPLACE_NAME,
        "interface": { "displayName": "Kanboard" },
        "plugins": [{
            "name": PLUGIN_NAME,
            "source": { "source": "local", "path": "./plugins/kanboard-agent" },
            "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
            "category": "Productivity"
        }]
    });
    fs::write(
        &marketplace_path,
        serde_json::to_vec_pretty(&marketplace).map_err(error)?,
    )
    .map_err(error)?;

    let legacy_marketplace_path = root.join("marketplace.json");
    if legacy_marketplace_path.exists() {
        let _ = fs::remove_file(legacy_marketplace_path);
    }

    let mut deep_link = url::Url::parse("codex://plugins/kanboard-agent").map_err(error)?;
    deep_link
        .query_pairs_mut()
        .append_pair("marketplacePath", &marketplace_path.to_string_lossy());
    let deep_link = deep_link.to_string();
    let opened = open::that(&deep_link).is_ok();
    Ok(CodexConnection {
        marketplace_path: marketplace_path.to_string_lossy().into_owned(),
        deep_link,
        opened,
    })
}

#[tauri::command]
pub async fn connect_antigravity(
    app: AppHandle,
    state: tauri::State<'_, McpState>,
) -> Result<AntigravityConnection, String> {
    state.set_enabled(true).await?;
    let home = app.path().home_dir().map_err(error)?;
    let gemini_config_dir = home.join(".gemini").join("config");
    fs::create_dir_all(&gemini_config_dir).map_err(error)?;
    let mcp_config_path = gemini_config_dir.join("mcp_config.json");

    let mut config: Value = if mcp_config_path.exists() {
        let content = fs::read_to_string(&mcp_config_path).unwrap_or_default();
        if content.trim().is_empty() {
            json!({})
        } else {
            serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
        }
    } else {
        json!({})
    };

    if !config.is_object() {
        config = json!({});
    }

    let servers = config
        .as_object_mut()
        .unwrap()
        .entry("mcpServers")
        .or_insert_with(|| json!({}));

    if !servers.is_object() {
        *servers = json!({});
    }

    servers.as_object_mut().unwrap().insert(
        "kanboard".to_string(),
        json!({
            "serverUrl": MCP_URL
        }),
    );

    let formatted = serde_json::to_string_pretty(&config).map_err(error)?;
    fs::write(&mcp_config_path, formatted).map_err(error)?;

    Ok(AntigravityConnection {
        config_path: mcp_config_path.to_string_lossy().into_owned(),
        configured: true,
    })
}

#[tauri::command]
pub async fn get_custom_sop(state: tauri::State<'_, McpState>) -> Result<SopConfig, String> {
    let pool = state.pool().await?;
    let sop = load_current_sop(&pool).await.map_err(error)?;
    pool.close().await;
    Ok(sop)
}

#[tauri::command]
pub async fn set_custom_sop(
    summary: String,
    content: String,
    state: tauri::State<'_, McpState>,
) -> Result<SopConfig, String> {
    if summary.trim().is_empty() || content.trim().is_empty() {
        return Err("SOP 概述和完整文档均不能为空".into());
    }
    let pool = state.pool().await?;
    let sop = save_sop(&pool, summary.trim(), content.trim(), true)
        .await
        .map_err(error)?;
    pool.close().await;
    if let Some(app) = &state.app {
        let _ = app.emit("sop-updated", ());
    }
    Ok(sop)
}

#[tauri::command]
pub async fn reset_custom_sop(state: tauri::State<'_, McpState>) -> Result<SopConfig, String> {
    let pool = state.pool().await?;
    let sop = save_sop(&pool, DEFAULT_SOP_SUMMARY, DEFAULT_SOP_CONTENT, false)
        .await
        .map_err(error)?;
    pool.close().await;
    if let Some(app) = &state.app {
        let _ = app.emit("sop-updated", ());
    }
    Ok(sop)
}

fn error(value: impl std::fmt::Display) -> String {
    value.to_string()
}

fn mcp_error(value: impl std::fmt::Display) -> rmcp::ErrorData {
    rmcp::ErrorData::internal_error(value.to_string(), None)
}

#[derive(Clone)]
struct KanboardMcp {
    database_path: Arc<Mutex<PathBuf>>,
    app: Option<AppHandle>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListTasksInput {
    /// Filter by column/status id, for example ready, doing, blocked, verify, or done.
    status: Option<String>,
    /// Filter by project id.
    project_id: Option<String>,
    /// Filter by tag name, case-insensitive.
    tag: Option<String>,
    /// Filter by priority: high or none.
    priority: Option<String>,
    /// Include tasks due on or before this YYYY-MM-DD date.
    due_before: Option<String>,
    /// Include soft-deleted tasks instead of active tasks.
    #[serde(default)]
    include_deleted: bool,
    /// Maximum number of tasks to return, from 1 to 200. Defaults to 50.
    limit: Option<usize>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct TaskIdInput {
    /// Stable task id.
    task_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SearchTasksInput {
    /// Text to search in task titles and descriptions.
    query: String,
    /// Include soft-deleted tasks.
    #[serde(default)]
    include_deleted: bool,
    /// Maximum number of matches, from 1 to 100. Defaults to 20.
    limit: Option<usize>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct EventsInput {
    /// Optional stable task id. Omit to return recent events across active tasks.
    task_id: Option<String>,
    /// Maximum number of events, from 1 to 500. Defaults to 100.
    limit: Option<usize>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateTaskStatusInput {
    /// Stable task id.
    task_id: String,
    /// Target column/status id, for example ready, doing, blocked, verify, or done.
    status: String,
    /// Reason category when moving to blocked: people, hardware, environment, feedback, technical, dependency, other.
    reason: Option<String>,
    /// Optional comment explaining the transition.
    comment: Option<String>,
    /// Optional structured review/verification notes (typically when moving to verify).
    review_notes: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SubmitTaskVerificationInput {
    /// 任务唯一 ID。
    task_id: String,
    /// 核心实现方案。严禁单行推到底！可读性优先：多模块/文件改动时必须优先使用 Markdown 表格 `| 模块/文件 | 改动类型 | 核心逻辑说明 |` 或多层级列表清晰分步呈现，中英文及数字间加空格，严禁包含 emoji。
    implementation: String,
    /// 交付情况与达成成果。严禁单行长句！必须使用 Markdown 复选清单 `- [x]` 或表格分项逐条罗列功能点、关键产物及 Checklist 完成情况，中英文及数字间加空格，严禁包含 emoji。
    summary: String,
    /// 验证与测试方式。严禁无分段堆叠！必须优先使用表格 `| 验证项 | 测试命令 / 操作路径 | 预期效果 |` 或带语言标签的代码块清晰列出验收方式，中英文及数字间加空格，严禁包含 emoji。
    test_guide: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ImportImageAttachmentInput {
    /// 本机已有截图的绝对路径；仅用于导入，不写入验证方案。支持 PNG、JPEG、GIF、WebP、BMP、SVG，最大 20 MB。
    file_path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SetTaskBlockedInput {
    /// Stable task id.
    task_id: String,
    /// Reason category for the block: technical, dependency, environment, feedback, people, hardware, other.
    reason: String,
    /// Detailed description of the error, failure, missing dependency, or required human action.
    detail: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct UpdateChecklistItemInput {
    /// Stable task id.
    task_id: String,
    /// Stable checklist item id.
    item_id: String,
    /// Completion state.
    completed: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct AppendTaskNotesInput {
    /// Stable task id.
    task_id: String,
    /// Progress notes, execution results, or error details to append to the task description.
    notes: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SetProjectPathInput {
    /// Stable project id.
    project_id: String,
    /// Absolute local filesystem directory path of the project/repository.
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TagData {
    id: String,
    name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChecklistData {
    id: String,
    text: String,
    completed: bool,
    position: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRef {
    id: String,
    name: String,
    color: String,
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskData {
    id: String,
    column_id: String,
    project_id: Option<String>,
    project: Option<ProjectRef>,
    tags: Vec<TagData>,
    title: String,
    description: String,
    due_date: Option<String>,
    priority: String,
    position: i64,
    completed_at: Option<String>,
    started_at: Option<String>,
    blocked_reason: Option<String>,
    blocked_since: Option<String>,
    checklist: Vec<ChecklistData>,
    recurrence_rule: String,
    review_notes: String,
    in_agent_sop: bool,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EventData {
    task_id: String,
    from_status: Option<String>,
    to_status: String,
    created_at: String,
}

pub(crate) fn status_display_name(status: &str) -> &'static str {
    match status {
        "todo" => "收集箱",
        "backlog" => "待办池",
        "ready" => "就绪",
        "doing" => "进行中",
        "verify" => "待验证",
        "blocked" => "阻塞",
        "done" => "已完成",
        _ => "未知状态",
    }
}

pub(crate) fn format_transition_notification(
    title: &str,
    from_status: Option<&str>,
    to_status: &str,
    detail: Option<&str>,
) -> (String, String) {
    let summary = "任务状态流转通知".to_string();
    let to_name = status_display_name(to_status);

    let body = match to_status {
        "verify" => format!(
            "任务「{title}」已进入「待验证」状态，验证方案已就绪。点击展开任务详情并验收。"
        ),
        "blocked" => {
            if let Some(detail_text) = detail.map(str::trim).filter(|d| !d.is_empty()) {
                format!(
                    "任务「{title}」已进入「阻塞」状态。卡点：{detail_text}。点击展开任务详情。"
                )
            } else {
                format!("任务「{title}」已进入「阻塞」状态。点击展开任务详情处理卡点。")
            }
        }
        "doing" => {
            format!("任务「{title}」已进入「进行中」状态，Agent 正在处理。点击展开任务详情。")
        }
        _ => {
            if let Some(from) = from_status {
                let from_name = status_display_name(from);
                format!("任务「{title}」已从「{from_name}」流转至「{to_name}」。点击展开任务详情。")
            } else {
                format!("任务「{title}」已流转至「{to_name}」。点击展开任务详情。")
            }
        }
    };

    (summary, body)
}

impl KanboardMcp {
    fn new(database_path: Arc<Mutex<PathBuf>>, app: Option<AppHandle>) -> Self {
        Self { database_path, app }
    }

    fn emit_task_updated(&self, task_id: Option<&str>) {
        if let Some(app) = &self.app {
            let _ = app.emit("mcp:task-updated", json!({ "taskId": task_id }));
        }
    }

    fn emit_task_blocked(&self, task_id: &str, title: &str, reason: &str, detail: &str) {
        if let Some(app) = &self.app {
            let _ = app.emit(
                "mcp:task-blocked",
                json!({
                    "taskId": task_id,
                    "title": title,
                    "reason": reason,
                    "detail": detail
                }),
            );
        }
    }

    fn notify_status_transition(
        &self,
        task_id: &str,
        title: &str,
        from_status: Option<&str>,
        to_status: &str,
        detail: Option<&str>,
    ) {
        if let Some(app) = &self.app {
            let (summary, body) = format_transition_notification(title, from_status, to_status, detail);

            let _ = app.emit(
                "mcp:status-transition",
                json!({
                    "taskId": task_id,
                    "title": title,
                    "fromStatus": from_status,
                    "toStatus": to_status,
                    "detail": detail,
                    "summary": summary,
                    "body": body,
                }),
            );

            #[cfg(desktop)]
            {
                let app_handle = app.clone();
                let task_id_owned = task_id.to_string();
                let summary_owned = summary;
                let body_owned = body;

                std::thread::spawn(move || {
                    #[cfg(windows)]
                    {
                        if let Err(error) = crate::windows_notify::send_windows_toast(
                            &task_id_owned,
                            &summary_owned,
                            &body_owned,
                            Some(app_handle),
                        ) {
                            eprintln!("failed to send windows toast: {error}");
                        }
                    }

                    #[cfg(not(windows))]
                    {
                        let mut notification = notify_rust::Notification::new();
                        notification.summary(&summary_owned).body(&body_owned);

                        if let Ok(handle) = notification.show() {
                            let _ = handle.wait_for_response(move |response: &notify_rust::NotificationResponse| match response {
                                notify_rust::NotificationResponse::Default
                                | notify_rust::NotificationResponse::Action(_) => {
                                    crate::show_main_window(&app_handle);
                                    let _ = app_handle.emit("open-task", &task_id_owned);
                                }
                                _ => {}
                            });
                        }
                    }
                });
            }
        }
    }
}

#[tool_router(server_handler)]
impl KanboardMcp {
    async fn pool(&self) -> Result<SqlitePool, rmcp::ErrorData> {
        let path = self
            .database_path
            .lock()
            .map_err(mcp_error)?
            .clone();
        let options = SqliteConnectOptions::new()
            .filename(path)
            .busy_timeout(std::time::Duration::from_secs(5));
        SqlitePool::connect_with(options).await.map_err(mcp_error)
    }

    #[tool(description = "Read the current high-signal Kanboard overview: counts by status, overdue and due-soon work, high-priority and blocked tasks, WIP limit violations, and active project counts.")]
    async fn get_dashboard_summary(&self) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let tasks = load_tasks(&pool, false).await.map_err(mcp_error)?;
        let columns = load_columns(&pool).await.map_err(mcp_error)?;
        let projects = load_projects(&pool).await.map_err(mcp_error)?;
        pool.close().await;
        let today = Local::now().date_naive().format("%Y-%m-%d").to_string();
        let soon = (Local::now().date_naive() + Duration::days(7))
            .format("%Y-%m-%d")
            .to_string();
        let active: Vec<_> = tasks.iter().filter(|task| task.column_id != "done").collect();
        let counts_by_status = tasks.iter().fold(BTreeMap::new(), |mut counts, task| {
            *counts.entry(task.column_id.clone()).or_insert(0usize) += 1;
            counts
        });
        let overdue: Vec<_> = active
            .iter()
            .filter(|task| task.due_date.as_deref().is_some_and(|date| date < today.as_str()))
            .cloned()
            .collect();
        let due_soon: Vec<_> = active
            .iter()
            .filter(|task| {
                task.due_date
                    .as_deref()
                    .is_some_and(|date| date >= today.as_str() && date <= soon.as_str())
            })
            .cloned()
            .collect();
        let high_priority: Vec<_> = active
            .iter()
            .filter(|task| task.priority == "high")
            .cloned()
            .collect();
        let blocked: Vec<_> = active
            .iter()
            .filter(|task| task.column_id == "blocked")
            .cloned()
            .collect();
        let wip_violations: Vec<Value> = columns
            .iter()
            .filter_map(|column| {
                let count = counts_by_status.get(&column.id).copied().unwrap_or_default();
                column.wip_limit.filter(|limit| count as i64 > *limit).map(|limit| {
                    json!({ "columnId": column.id, "title": column.title, "count": count, "limit": limit })
                })
            })
            .collect();
        structured(json!({
            "generatedAt": Utc::now().to_rfc3339(),
            "totalActive": active.len(),
            "countsByStatus": counts_by_status,
            "overdue": overdue,
            "dueWithin7Days": due_soon,
            "highPriority": high_priority,
            "blocked": blocked,
            "wipViolations": wip_violations,
            "projects": projects,
        }))
    }

    #[tool(description = "List current Kanboard tasks with optional status, project, tag, priority, due-date, and deleted-task filters. Results are ordered by board position and capped.")]
    async fn list_tasks(
        &self,
        Parameters(input): Parameters<ListTasksInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let mut tasks = load_tasks(&pool, input.include_deleted).await.map_err(mcp_error)?;
        pool.close().await;
        tasks.retain(|task| {
            input.status.as_ref().is_none_or(|value| &task.column_id == value)
                && input.project_id.as_ref().is_none_or(|value| task.project_id.as_ref() == Some(value))
                && input.priority.as_ref().is_none_or(|value| &task.priority == value)
                && input.due_before.as_ref().is_none_or(|value| task.due_date.as_ref().is_some_and(|date| date <= value))
                && input.tag.as_ref().is_none_or(|value| task.tags.iter().any(|tag| tag.name.eq_ignore_ascii_case(value)))
        });
        if input.status.as_deref() == Some("done") {
            tasks.sort_by(|a, b| {
                b.completed_at
                    .as_deref()
                    .unwrap_or(b.updated_at.as_str())
                    .cmp(a.completed_at.as_deref().unwrap_or(a.updated_at.as_str()))
            });
        }
        let total = tasks.len();
        tasks.truncate(input.limit.unwrap_or(50).clamp(1, 200));
        structured(json!({ "total": total, "tasks": tasks }))
    }

    #[tool(description = "Get one Kanboard task by stable id, including project (with local path), tags, checklist, deletion state, and complete status-event history.")]
    async fn get_task(
        &self,
        Parameters(input): Parameters<TaskIdInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let mut tasks = load_all_tasks(&pool).await.map_err(mcp_error)?;
        let task = tasks
            .drain(..)
            .find(|task| task.id == input.task_id)
            .ok_or_else(|| rmcp::ErrorData::invalid_params("找不到任务", None))?;
        let events = load_events(&pool, Some(&input.task_id), 500)
            .await
            .map_err(mcp_error)?;
        pool.close().await;
        structured(json!({ "task": task, "events": events }))
    }

    #[tool(description = "Search task titles and descriptions using case-insensitive text matching. Can include the recycle bin.")]
    async fn search_tasks(
        &self,
        Parameters(input): Parameters<SearchTasksInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let query = input.query.trim().to_lowercase();
        if query.is_empty() {
            return Err(rmcp::ErrorData::invalid_params("搜索内容不能为空", None));
        }
        let pool = self.pool().await?;
        let mut tasks = load_tasks(&pool, input.include_deleted).await.map_err(mcp_error)?;
        pool.close().await;
        tasks.retain(|task| {
            task.title.to_lowercase().contains(&query)
                || task.description.to_lowercase().contains(&query)
        });
        let total = tasks.len();
        tasks.truncate(input.limit.unwrap_or(20).clamp(1, 100));
        structured(json!({ "query": input.query, "total": total, "tasks": tasks }))
    }

    #[tool(description = "List Kanboard projects with descriptions, local repository path, target dates, lifecycle state, and active task counts by status.")]
    async fn list_projects(&self) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let projects = load_projects(&pool).await.map_err(mcp_error)?;
        pool.close().await;
        structured(json!({ "projects": projects }))
    }

    #[tool(description = "List all Kanboard tags with active task counts.")]
    async fn list_tags(&self) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let rows = sqlx::query(
            "SELECT tags.id, tags.name, COUNT(tasks.id) AS task_count FROM tags LEFT JOIN task_tags ON task_tags.tag_id = tags.id LEFT JOIN tasks ON tasks.id = task_tags.task_id AND tasks.deleted_at IS NULL GROUP BY tags.id, tags.name ORDER BY tags.name COLLATE NOCASE",
        )
        .fetch_all(&pool)
        .await
        .map_err(mcp_error)?;
        pool.close().await;
        let tags: Vec<Value> = rows
            .into_iter()
            .map(|row| json!({ "id": row.get::<String, _>("id"), "name": row.get::<String, _>("name"), "taskCount": row.get::<i64, _>("task_count") }))
            .collect();
        structured(json!({ "tags": tags }))
    }

    #[tool(description = "List status transition events for one task or recent events across active tasks.")]
    async fn list_task_events(
        &self,
        Parameters(input): Parameters<EventsInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let limit = input.limit.unwrap_or(100).clamp(1, 500);
        let pool = self.pool().await?;
        let events = load_events(&pool, input.task_id.as_deref(), limit)
            .await
            .map_err(mcp_error)?;
        pool.close().await;
        structured(json!({ "events": events }))
    }

    #[tool(description = "Calculate the current 7-day throughput, cycle-time percentiles, 30-day blocked hours, WIP aging, long-running WIP, and 14-day cumulative-flow counts.")]
    async fn get_flow_metrics(&self) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let tasks = load_tasks(&pool, false).await.map_err(mcp_error)?;
        let events = load_events(&pool, None, 100_000).await.map_err(mcp_error)?;
        pool.close().await;
        structured(flow_metrics(&tasks, &events))
    }

    #[tool(description = "Update a task's status/column (e.g. ready, doing, blocked, verify, done). Automatically updates started_at, completed_at, records a status transition event, and notifies the desktop app.")]
    async fn update_task_status(
        &self,
        Parameters(input): Parameters<UpdateTaskStatusInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let now = Utc::now().to_rfc3339();

        let Some(task) = load_task_by_id(&pool, &input.task_id).await.map_err(mcp_error)? else {
            pool.close().await;
            return Err(rmcp::ErrorData::invalid_params("找不到任务", None));
        };

        let columns = load_columns(&pool).await.map_err(mcp_error)?;
        if !columns.iter().any(|c| c.id == input.status) {
            pool.close().await;
            return Err(rmcp::ErrorData::invalid_params(format!("无效的状态列: {}", input.status), None));
        }

        let is_done = input.status == "done";
        let is_verify = input.status == "verify";
        let is_doing = input.status == "doing";
        let is_blocked = input.status == "blocked";

        let in_agent_sop: i64 = if is_done || is_verify {
            0
        } else {
            1
        };

        let completed_at: Option<String> = if is_done {
            Some(task.completed_at.clone().unwrap_or_else(|| now.clone()))
        } else {
            None
        };

        let started_at: Option<String> = if is_doing {
            Some(if task.column_id == "doing" {
                task.started_at.clone().unwrap_or_else(|| now.clone())
            } else {
                now.clone()
            })
        } else {
            None
        };

        let blocked_reason: Option<String> = if is_blocked {
            Some(input.reason.clone().unwrap_or_else(|| task.blocked_reason.clone().unwrap_or_else(|| "other".to_string())))
        } else {
            None
        };

        let blocked_since: Option<String> = if is_blocked {
            Some(if task.column_id == "blocked" {
                task.blocked_since.clone().unwrap_or_else(|| now.clone())
            } else {
                now.clone()
            })
        } else {
            None
        };

        let updated_desc = if let Some(comment) = &input.comment {
            let trimmed = comment.trim();
            if !trimmed.is_empty() {
                if task.description.trim().is_empty() {
                    trimmed.to_string()
                } else {
                    format!("{}\n\n[{}] {}", task.description.trim(), &now[0..19].replace('T', " "), trimmed)
                }
            } else {
                task.description.clone()
            }
        } else {
            task.description.clone()
        };

        let updated_review_notes = if let Some(notes) = &input.review_notes {
            notes.clone()
        } else {
            task.review_notes.clone()
        };

        sqlx::query(
            "UPDATE tasks SET column_id = ?, completed_at = ?, started_at = ?, blocked_reason = ?, blocked_since = ?, description = ?, review_notes = ?, in_agent_sop = ?, updated_at = ? WHERE id = ?"
        )
        .bind(&input.status)
        .bind(&completed_at)
        .bind(&started_at)
        .bind(&blocked_reason)
        .bind(&blocked_since)
        .bind(&updated_desc)
        .bind(&updated_review_notes)
        .bind(in_agent_sop)
        .bind(&now)
        .bind(&input.task_id)
        .execute(&pool)
        .await
        .map_err(mcp_error)?;

        let status_changed = task.column_id != input.status;
        if status_changed {
            sqlx::query(
                "INSERT INTO task_events (task_id, from_status, to_status, created_at) VALUES (?, ?, ?, ?)"
            )
            .bind(&input.task_id)
            .bind(&task.column_id)
            .bind(&input.status)
            .bind(&now)
            .execute(&pool)
            .await
            .map_err(mcp_error)?;
        }

        let updated_task = load_task_by_id(&pool, &input.task_id).await.map_err(mcp_error)?;
        pool.close().await;

        self.emit_task_updated(Some(&input.task_id));
        if status_changed {
            let detail = if is_blocked {
                input.comment.as_deref().or(blocked_reason.as_deref())
            } else {
                input.comment.as_deref()
            };
            self.notify_status_transition(
                &input.task_id,
                &task.title,
                Some(&task.column_id),
                &input.status,
                detail,
            );
        }
        if is_blocked {
            let reason_str = blocked_reason.as_deref().unwrap_or("other");
            let detail_str = input.comment.as_deref().unwrap_or("已移动到阻塞");
            self.emit_task_blocked(&input.task_id, &task.title, reason_str, detail_str);
        }

        structured(json!({ "task": updated_task }))
    }

    #[tool(description = "将本机截图复制到当前 SQLite 数据库同级 attachments 目录，保留原文件。返回 attachment.relativePath 和可直接内嵌的 markdown。提交验证方案前先调用本工具导入实际截图，使用返回的相对引用，禁止使用项目绝对路径。")]
    async fn import_image_attachment(
        &self,
        Parameters(input): Parameters<ImportImageAttachmentInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let database = self.database_path.lock().map_err(mcp_error)?.clone();
        let directory = database.parent().ok_or_else(|| mcp_error("数据库路径无效"))?;
        let attachment = crate::storage::import_image_attachment_impl(directory, std::path::Path::new(&input.file_path))
            .map_err(|err| rmcp::ErrorData::invalid_params(err, None))?;
        let markdown = format!("![{}]({})", attachment.file_name, attachment.relative_path);
        structured(json!({ "attachment": attachment, "markdown": markdown }))
    }

    #[tool(description = "提交任务验证方案并移入待验证列（verify）。实际截图先调用 import_image_attachment 导入，再将返回的 markdown 相对引用写入方案，禁止图片使用项目绝对路径。Agent 必须使用中文提供实现方案、交付情况及测试验证说明，中英文及数字间规范空格，支持标准 Markdown，严禁使用 emoji，严禁自行标记为完成（done）。")]
    async fn submit_task_verification(
        &self,
        Parameters(input): Parameters<SubmitTaskVerificationInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let now = Utc::now().to_rfc3339();

        let Some(task) = load_task_by_id(&pool, &input.task_id).await.map_err(mcp_error)? else {
            pool.close().await;
            return Err(rmcp::ErrorData::invalid_params("找不到任务", None));
        };

        let formatted_notes = format!(
            "### 1. 实现方案\n\n{}\n\n### 2. 交付成果\n\n{}\n\n### 3. 验证与测试指南\n\n{}",
            input.implementation.trim(),
            input.summary.trim(),
            input.test_guide.trim(),
        );

        sqlx::query(
            "UPDATE tasks SET column_id = 'verify', completed_at = NULL, started_at = NULL, blocked_reason = NULL, blocked_since = NULL, review_notes = ?, in_agent_sop = 0, updated_at = ? WHERE id = ?"
        )
        .bind(&formatted_notes)
        .bind(&now)
        .bind(&input.task_id)
        .execute(&pool)
        .await
        .map_err(mcp_error)?;

        let status_changed = task.column_id != "verify";
        if status_changed {
            sqlx::query(
                "INSERT INTO task_events (task_id, from_status, to_status, created_at) VALUES (?, ?, 'verify', ?)"
            )
            .bind(&input.task_id)
            .bind(&task.column_id)
            .bind(&now)
            .execute(&pool)
            .await
            .map_err(mcp_error)?;
        }

        let updated_task = load_task_by_id(&pool, &input.task_id).await.map_err(mcp_error)?;
        pool.close().await;

        self.emit_task_updated(Some(&input.task_id));
        self.notify_status_transition(
            &input.task_id,
            &task.title,
            Some(&task.column_id),
            "verify",
            Some("验证方案已就绪"),
        );
        structured(json!({ "task": updated_task, "verifiedPending": true }))
    }

    #[tool(description = "Move a task to the blocked column due to an exception, failure, missing dependency, or need for human assistance. Records structured error context and notifies the user.")]
    async fn set_task_blocked(
        &self,
        Parameters(input): Parameters<SetTaskBlockedInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let now = Utc::now().to_rfc3339();

        let Some(task) = load_task_by_id(&pool, &input.task_id).await.map_err(mcp_error)? else {
            pool.close().await;
            return Err(rmcp::ErrorData::invalid_params("找不到任务", None));
        };

        let reason = input.reason.trim().to_lowercase();
        let detail = input.detail.trim();
        if detail.is_empty() {
            pool.close().await;
            return Err(rmcp::ErrorData::invalid_params("阻塞详情不能为空", None));
        }

        let banner = format!(
            "\n\n> [!WARNING] 阻塞异常记录 ({})\n> **原因类型**: `{}`\n> **阻塞详情**: {}",
            &now[0..19].replace('T', " "),
            reason,
            detail
        );
        let new_description = if task.description.trim().is_empty() {
            banner.trim_start().to_string()
        } else {
            format!("{}{}", task.description.trim(), banner)
        };

        sqlx::query(
            "UPDATE tasks SET column_id = 'blocked', completed_at = NULL, started_at = NULL, blocked_reason = ?, blocked_since = CASE WHEN column_id = 'blocked' THEN COALESCE(blocked_since, ?) ELSE ? END, in_agent_sop = 1, description = ?, updated_at = ? WHERE id = ?"
        )
        .bind(&reason)
        .bind(&now)
        .bind(&now)
        .bind(&new_description)
        .bind(&now)
        .bind(&input.task_id)
        .execute(&pool)
        .await
        .map_err(mcp_error)?;

        let status_changed = task.column_id != "blocked";
        if status_changed {
            sqlx::query(
                "INSERT INTO task_events (task_id, from_status, to_status, created_at) VALUES (?, ?, 'blocked', ?)"
            )
            .bind(&input.task_id)
            .bind(&task.column_id)
            .bind(&now)
            .execute(&pool)
            .await
            .map_err(mcp_error)?;
        }

        let updated_task = load_task_by_id(&pool, &input.task_id).await.map_err(mcp_error)?;
        pool.close().await;

        self.emit_task_updated(Some(&input.task_id));
        self.notify_status_transition(
            &input.task_id,
            &task.title,
            Some(&task.column_id),
            "blocked",
            Some(detail),
        );
        self.emit_task_blocked(&input.task_id, &task.title, &reason, detail);

        structured(json!({ "task": updated_task, "blocked": true }))
    }

    #[tool(description = "Mark a task checklist item as completed (true) or pending (false).")]
    async fn update_checklist_item(
        &self,
        Parameters(input): Parameters<UpdateChecklistItemInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let now = Utc::now().to_rfc3339();

        let res = sqlx::query(
            "UPDATE task_checklist_items SET completed = ? WHERE id = ? AND task_id = ?"
        )
        .bind(if input.completed { 1i64 } else { 0i64 })
        .bind(&input.item_id)
        .bind(&input.task_id)
        .execute(&pool)
        .await
        .map_err(mcp_error)?;

        if res.rows_affected() == 0 {
            pool.close().await;
            return Err(rmcp::ErrorData::invalid_params("找不到检查项或任务不匹配", None));
        }

        sqlx::query(
            "UPDATE tasks SET in_agent_sop = CASE WHEN column_id IN ('verify', 'done') THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?"
        )
        .bind(&now)
        .bind(&input.task_id)
        .execute(&pool)
        .await
        .map_err(mcp_error)?;

        let updated_task = load_task_by_id(&pool, &input.task_id).await.map_err(mcp_error)?;
        pool.close().await;

        self.emit_task_updated(Some(&input.task_id));
        structured(json!({ "task": updated_task }))
    }

    #[tool(description = "Append timestamped progress notes, execution logs, or comments to a task description.")]
    async fn append_task_notes(
        &self,
        Parameters(input): Parameters<AppendTaskNotesInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let now = Utc::now().to_rfc3339();

        let Some(task) = load_task_by_id(&pool, &input.task_id).await.map_err(mcp_error)? else {
            pool.close().await;
            return Err(rmcp::ErrorData::invalid_params("找不到任务", None));
        };

        let trimmed = input.notes.trim();
        if trimmed.is_empty() {
            pool.close().await;
            return Err(rmcp::ErrorData::invalid_params("内容不能为空", None));
        }

        let new_desc = if task.description.trim().is_empty() {
            trimmed.to_string()
        } else {
            format!("{}\n\n[{}] {}", task.description.trim(), &now[0..19].replace('T', " "), trimmed)
        };

        sqlx::query(
            "UPDATE tasks SET description = ?, in_agent_sop = CASE WHEN column_id IN ('verify', 'done') THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?"
        )
        .bind(&new_desc)
        .bind(&now)
        .bind(&input.task_id)
        .execute(&pool)
        .await
        .map_err(mcp_error)?;

        let updated_task = load_task_by_id(&pool, &input.task_id).await.map_err(mcp_error)?;
        pool.close().await;

        self.emit_task_updated(Some(&input.task_id));
        structured(json!({ "task": updated_task }))
    }

    #[tool(description = "Set or update the local repository / workspace directory path for a project.")]
    async fn set_project_path(
        &self,
        Parameters(input): Parameters<SetProjectPathInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let now = Utc::now().to_rfc3339();

        let res = sqlx::query("UPDATE projects SET path = ?, updated_at = ? WHERE id = ?")
            .bind(input.path.trim())
            .bind(&now)
            .bind(&input.project_id)
            .execute(&pool)
            .await
            .map_err(mcp_error)?;

        if res.rows_affected() == 0 {
            pool.close().await;
            return Err(rmcp::ErrorData::invalid_params("找不到项目", None));
        }

        let projects = load_projects(&pool).await.map_err(mcp_error)?;
        let updated_project = projects.into_iter().find(|p| p.get("id").and_then(Value::as_str) == Some(&input.project_id));
        pool.close().await;

        self.emit_task_updated(None);
        structured(json!({ "project": updated_project }))
    }

    fn emit_sop_updated(&self) {
        if let Some(app) = &self.app {
            let _ = app.emit("sop-updated", ());
        }
    }

    #[tool(description = "获取当前 Kanboard 生效的 SOP（标准作业流程），包含概述 summary 与完整 Markdown 规范 content。")]
    async fn get_custom_sop(&self) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let sop = load_current_sop(&pool).await.map_err(mcp_error)?;
        pool.close().await;
        structured(json!({ "sop": sop }))
    }

    #[tool(description = "写入或更新 Kanboard 自定义 SOP（标准作业流程）。注意：Agent 严禁在未经用户明确确认前调用此工具！必须在用户对定制的 SOP 概述（summary）和完整规范（content）明确答复确认后，方可写入系统生效。")]
    async fn set_custom_sop(
        &self,
        Parameters(input): Parameters<SetCustomSopInput>,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        if input.summary.trim().is_empty() || input.content.trim().is_empty() {
            return Err(rmcp::ErrorData::invalid_params("SOP 概述和完整内容均不能为空", None));
        }
        let pool = self.pool().await?;
        let sop = save_sop(&pool, input.summary.trim(), input.content.trim(), true)
            .await
            .map_err(mcp_error)?;
        pool.close().await;
        self.emit_sop_updated();
        structured(json!({ "sop": sop }))
    }

    #[tool(description = "重置 Kanboard SOP 为系统默认预置标准作业流程。")]
    async fn reset_custom_sop(&self) -> Result<CallToolResult, rmcp::ErrorData> {
        let pool = self.pool().await?;
        let sop = save_sop(&pool, DEFAULT_SOP_SUMMARY, DEFAULT_SOP_CONTENT, false)
            .await
            .map_err(mcp_error)?;
        pool.close().await;
        self.emit_sop_updated();
        structured(json!({ "sop": sop }))
    }
}

async fn load_current_sop(pool: &SqlitePool) -> Result<SopConfig, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id, summary, content, is_custom, updated_at FROM sop_configs WHERE id = 'current'",
    )
    .fetch_optional(pool)
    .await?;

    if let Some(r) = row {
        Ok(SopConfig {
            id: r.get("id"),
            summary: r.get("summary"),
            content: r.get("content"),
            is_custom: r.get::<i64, _>("is_custom") != 0,
            updated_at: r.get("updated_at"),
        })
    } else {
        Ok(SopConfig {
            id: "current".into(),
            summary: DEFAULT_SOP_SUMMARY.into(),
            content: DEFAULT_SOP_CONTENT.into(),
            is_custom: false,
            updated_at: Utc::now().to_rfc3339(),
        })
    }
}

async fn save_sop(
    pool: &SqlitePool,
    summary: &str,
    content: &str,
    is_custom: bool,
) -> Result<SopConfig, sqlx::Error> {
    let now = Utc::now().to_rfc3339();
    let custom_int: i64 = if is_custom { 1 } else { 0 };
    sqlx::query(
        "INSERT INTO sop_configs (id, summary, content, is_custom, updated_at)
         VALUES ('current', ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET summary = excluded.summary, content = excluded.content, is_custom = excluded.is_custom, updated_at = excluded.updated_at",
    )
    .bind(summary)
    .bind(content)
    .bind(custom_int)
    .bind(&now)
    .execute(pool)
    .await?;

    load_current_sop(pool).await
}

fn structured(value: Value) -> Result<CallToolResult, rmcp::ErrorData> {
    Ok(CallToolResult::structured(value))
}

#[derive(Debug)]
struct ColumnData {
    id: String,
    title: String,
    wip_limit: Option<i64>,
}

async fn load_columns(pool: &SqlitePool) -> Result<Vec<ColumnData>, sqlx::Error> {
    Ok(sqlx::query("SELECT id, title, wip_limit FROM task_columns ORDER BY position")
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| ColumnData {
            id: row.get("id"),
            title: row.get("title"),
            wip_limit: row.get("wip_limit"),
        })
        .collect())
}

async fn load_projects(pool: &SqlitePool) -> Result<Vec<Value>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT p.id, p.name, p.color, p.description, p.path, p.target_date, p.status, p.created_at, p.updated_at, t.column_id, COUNT(t.id) AS task_count FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL GROUP BY p.id, p.name, p.color, p.description, p.path, p.target_date, p.status, p.created_at, p.updated_at, t.column_id ORDER BY p.status, p.name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;
    let mut projects: BTreeMap<String, Value> = BTreeMap::new();
    for row in rows {
        let id: String = row.get("id");
        let entry = projects.entry(id.clone()).or_insert_with(|| {
            json!({
                "id": id,
                "name": row.get::<String, _>("name"),
                "color": row.get::<String, _>("color"),
                "description": row.get::<String, _>("description"),
                "path": row.get::<String, _>("path"),
                "targetDate": row.get::<Option<String>, _>("target_date"),
                "status": row.get::<String, _>("status"),
                "createdAt": row.get::<String, _>("created_at"),
                "updatedAt": row.get::<String, _>("updated_at"),
                "taskCounts": {}
            })
        });
        if let Some(column_id) = row.get::<Option<String>, _>("column_id") {
            entry["taskCounts"][column_id] = json!(row.get::<i64, _>("task_count"));
        }
    }
    Ok(projects.into_values().collect())
}

async fn load_tasks(pool: &SqlitePool, deleted: bool) -> Result<Vec<TaskData>, sqlx::Error> {
    let mut tasks = load_all_tasks(pool).await?;
    tasks.retain(|task| task.deleted_at.is_some() == deleted);
    Ok(tasks)
}

async fn load_task_by_id(pool: &SqlitePool, task_id: &str) -> Result<Option<TaskData>, sqlx::Error> {
    let tasks = load_all_tasks(pool).await?;
    Ok(tasks.into_iter().find(|t| t.id == task_id))
}

async fn load_all_tasks(pool: &SqlitePool) -> Result<Vec<TaskData>, sqlx::Error> {
    let task_rows = sqlx::query(
        "SELECT t.id, t.column_id, t.project_id, p.name AS project_name, p.color AS project_color, p.path AS project_path, t.title, t.description, t.due_date, t.priority, t.position, t.completed_at, t.started_at, t.blocked_reason, t.blocked_since, t.recurrence_rule, t.review_notes, t.in_agent_sop, t.created_at, t.updated_at, t.deleted_at FROM tasks t LEFT JOIN projects p ON p.id = t.project_id ORDER BY CASE WHEN t.column_id = 'done' THEN 0 ELSE 1 END, CASE WHEN t.column_id = 'done' THEN t.completed_at END DESC, t.position ASC",
    )
    .fetch_all(pool)
    .await?;
    let tag_rows = sqlx::query(
        "SELECT task_tags.task_id, tags.id, tags.name FROM task_tags JOIN tags ON tags.id = task_tags.tag_id ORDER BY tags.name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;
    let checklist_rows = sqlx::query(
        "SELECT id, task_id, text, completed, position FROM task_checklist_items ORDER BY position",
    )
    .fetch_all(pool)
    .await?;
    let mut tags: HashMap<String, Vec<TagData>> = HashMap::new();
    for row in tag_rows {
        tags.entry(row.get("task_id")).or_default().push(TagData {
            id: row.get("id"),
            name: row.get("name"),
        });
    }
    let mut checklist: HashMap<String, Vec<ChecklistData>> = HashMap::new();
    for row in checklist_rows {
        checklist
            .entry(row.get("task_id"))
            .or_default()
            .push(ChecklistData {
                id: row.get("id"),
                text: row.get("text"),
                completed: row.get::<i64, _>("completed") != 0,
                position: row.get("position"),
            });
    }
    Ok(task_rows
        .into_iter()
        .map(|row| {
            let id: String = row.get("id");
            let project_id: Option<String> = row.get("project_id");
            let project_name: Option<String> = row.get("project_name");
            let project_color: Option<String> = row.get("project_color");
            TaskData {
                id: id.clone(),
                column_id: row.get("column_id"),
                project: project_id.as_ref().and_then(|project_id| {
                    Some(ProjectRef {
                        id: project_id.clone(),
                        name: project_name.clone()?,
                        color: project_color.clone()?,
                        path: row.get::<Option<String>, _>("project_path").unwrap_or_default(),
                    })
                }),
                project_id,
                tags: tags.remove(&id).unwrap_or_default(),
                title: row.get("title"),
                description: row.get("description"),
                due_date: row.get("due_date"),
                priority: row.get("priority"),
                position: row.get("position"),
                completed_at: row.get("completed_at"),
                started_at: row.get("started_at"),
                blocked_reason: row.get("blocked_reason"),
                blocked_since: row.get("blocked_since"),
                checklist: checklist.remove(&id).unwrap_or_default(),
                recurrence_rule: row.get("recurrence_rule"),
                review_notes: row.get::<Option<String>, _>("review_notes").unwrap_or_default(),
                in_agent_sop: row.get::<i64, _>("in_agent_sop") != 0,
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
                deleted_at: row.get("deleted_at"),
            }
        })
        .collect())
}

async fn load_events(
    pool: &SqlitePool,
    task_id: Option<&str>,
    limit: usize,
) -> Result<Vec<EventData>, sqlx::Error> {
    let rows = if let Some(task_id) = task_id {
        sqlx::query("SELECT task_id, from_status, to_status, created_at FROM task_events WHERE task_id = ? ORDER BY created_at DESC LIMIT ?")
            .bind(task_id)
            .bind(limit as i64)
            .fetch_all(pool)
            .await?
    } else {
        sqlx::query("SELECT events.task_id, events.from_status, events.to_status, events.created_at FROM task_events events JOIN tasks ON tasks.id = events.task_id WHERE tasks.deleted_at IS NULL ORDER BY events.created_at DESC LIMIT ?")
            .bind(limit as i64)
            .fetch_all(pool)
            .await?
    };
    Ok(rows
        .into_iter()
        .map(|row| EventData {
            task_id: row.get("task_id"),
            from_status: row.get("from_status"),
            to_status: row.get("to_status"),
            created_at: row.get("created_at"),
        })
        .collect())
}

fn parse_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.with_timezone(&Utc))
}

fn percentile(values: &mut [f64], ratio: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(f64::total_cmp);
    values.get(((values.len() as f64 * ratio).ceil() as usize).saturating_sub(1)).copied()
}

fn flow_metrics(tasks: &[TaskData], events_desc: &[EventData]) -> Value {
    let now = Utc::now();
    let mut by_task: HashMap<&str, Vec<&EventData>> = HashMap::new();
    for event in events_desc.iter().rev() {
        by_task.entry(&event.task_id).or_default().push(event);
    }
    let mut cycle_hours = Vec::new();
    for events in by_task.values() {
        if let Some(started) = events.iter().find(|event| event.to_status == "doing") {
            if let Some(started_at) = parse_time(&started.created_at) {
                if let Some(done_at) = events
                    .iter()
                    .filter(|event| event.to_status == "done")
                    .filter_map(|event| parse_time(&event.created_at))
                    .find(|date| *date >= started_at)
                {
                    cycle_hours.push((done_at - started_at).num_seconds() as f64 / 3600.0);
                }
            }
        }
    }
    let seven_days_ago = now - Duration::days(7);
    let throughput_7d = events_desc
        .iter()
        .filter(|event| event.to_status == "done")
        .filter(|event| parse_time(&event.created_at).is_some_and(|date| date >= seven_days_ago))
        .map(|event| &event.task_id)
        .collect::<HashSet<_>>()
        .len();
    let thirty_days_ago = now - Duration::days(30);
    let mut blocked_seconds = 0i64;
    for events in by_task.values() {
        for (index, event) in events.iter().enumerate() {
            if event.to_status != "blocked" {
                continue;
            }
            let Some(event_time) = parse_time(&event.created_at) else { continue };
            let start = event_time.max(thirty_days_ago);
            let end = events[index + 1..]
                .iter()
                .find(|next| next.to_status != "blocked")
                .and_then(|next| parse_time(&next.created_at))
                .unwrap_or(now)
                .min(now);
            blocked_seconds += (end - start).num_seconds().max(0);
        }
    }
    let doing: Vec<_> = tasks.iter().filter(|task| task.column_id == "doing").collect();
    let ages: Vec<i64> = doing
        .iter()
        .map(|task| task.started_at.as_deref().and_then(parse_time).map_or(0, |date| (now - date).num_seconds()))
        .collect();
    let long_wip: Vec<_> = doing
        .iter()
        .filter(|task| task.started_at.as_deref().and_then(parse_time).is_some_and(|date| now - date >= Duration::days(3)))
        .collect();
    let cfd: Vec<Value> = (0..14)
        .map(|offset| {
            let day = now.date_naive() - Duration::days(13 - offset);
            let end = day.and_hms_opt(23, 59, 59).unwrap().and_utc();
            let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
            for events in by_task.values() {
                if let Some(latest) = events.iter().rev().find(|event| parse_time(&event.created_at).is_some_and(|date| date <= end)) {
                    *counts.entry(&latest.to_status).or_default() += 1;
                }
            }
            json!({ "date": day.format("%Y-%m-%d").to_string(), "counts": counts })
        })
        .collect();
    let mut p50_values = cycle_hours.clone();
    let median = percentile(&mut p50_values, 0.5);
    let p85 = percentile(&mut cycle_hours, 0.85);
    json!({
        "generatedAt": now.to_rfc3339(),
        "throughput7d": throughput_7d,
        "medianCycleHours": median,
        "p85CycleHours": p85,
        "blockedHours30d": blocked_seconds as f64 / 3600.0,
        "longWipTasks": long_wip,
        "agingBuckets": [
            { "label": "0~1 天", "count": ages.iter().filter(|age| **age < 86_400).count() },
            { "label": "1~3 天", "count": ages.iter().filter(|age| **age >= 86_400 && **age < 259_200).count() },
            { "label": "3~7 天", "count": ages.iter().filter(|age| **age >= 259_200 && **age < 604_800).count() },
            { "label": ">7 天", "count": ages.iter().filter(|age| **age >= 604_800).count() }
        ],
        "cfd": cfd
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::{
        model::{CallToolRequestParams, ClientConfig},
        transport::StreamableHttpClientTransport, ServiceExt,
    };
    use sqlx::migrate::Migrator;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn test_format_transition_notification() {
        let (summary, body) = format_transition_notification("建立通知机制", Some("doing"), "verify", None);
        assert_eq!(summary, "任务状态流转通知");
        assert_eq!(body, "任务「建立通知机制」已进入「待验证」状态，验证方案已就绪。点击展开任务详情并验收。");

        let (_, body_blocked) = format_transition_notification("建立通知机制", Some("doing"), "blocked", Some("卡点说明"));
        assert_eq!(body_blocked, "任务「建立通知机制」已进入「阻塞」状态。卡点：卡点说明。点击展开任务详情。");

        let (_, body_doing) = format_transition_notification("建立通知机制", Some("ready"), "doing", None);
        assert_eq!(body_doing, "任务「建立通知机制」已进入「进行中」状态，Agent 正在处理。点击展开任务详情。");

        let (_, body_other) = format_transition_notification("建立通知机制", Some("todo"), "backlog", None);
        assert_eq!(body_other, "任务「建立通知机制」已从「收集箱」流转至「待办池」。点击展开任务详情。");
    }

    #[tokio::test]
    async fn agent_sop_tracks_mutations_and_clears_transition_metadata() {
        let directory = std::env::temp_dir().join(format!(
            "kanboard-agent-state-{}-{}", std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join("kanboard.db");
        let pool = SqlitePool::connect_with(
            SqliteConnectOptions::new().filename(&database).create_if_missing(true)
        ).await.unwrap();
        crate::storage::migrations().run(&pool).await.unwrap();
        sqlx::query("INSERT INTO tasks (id, column_id, title, position, created_at, updated_at) VALUES ('agent-task', 'todo', '状态流转测试', 1000, '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO task_checklist_items (id, task_id, text, position) VALUES ('item-1', 'agent-task', '完成条件', 1000)")
            .execute(&pool).await.unwrap();
        let service = KanboardMcp::new(Arc::new(Mutex::new(database.clone())), None);

        service.append_task_notes(Parameters(AppendTaskNotesInput {
            task_id: "agent-task".into(), notes: "接单".into(),
        })).await.unwrap();
        assert!(load_task_by_id(&pool, "agent-task").await.unwrap().unwrap().in_agent_sop);

        for status in ["doing", "doing", "blocked", "ready", "verify", "done", "todo"] {
            let result = service.update_task_status(Parameters(UpdateTaskStatusInput {
                task_id: "agent-task".into(), status: status.into(),
                reason: None, comment: None, review_notes: None,
            })).await.unwrap().structured_content.unwrap();
            let task = &result["task"];
            assert_eq!(task["inAgentSop"], status != "verify" && status != "done");
            assert_eq!(task["startedAt"].is_string(), status == "doing");
            assert_eq!(task["completedAt"].is_string(), status == "done");
            assert_eq!(task["blockedSince"].is_string(), status == "blocked");
            assert_eq!(task["blockedReason"].is_string(), status == "blocked");
        }
        let events = load_events(&pool, Some("agent-task"), 100).await.unwrap();
        assert_eq!(events.len(), 6, "重复设置相同状态不应生成流转事件");

        // Dedicated blocking clears stale completion/start metadata and preserves its timer.
        sqlx::query("UPDATE tasks SET completed_at = 'old', started_at = 'old' WHERE id = 'agent-task'")
            .execute(&pool).await.unwrap();
        service.set_task_blocked(Parameters(SetTaskBlockedInput {
            task_id: "agent-task".into(), reason: "technical".into(), detail: "首次阻塞".into(),
        })).await.unwrap();
        let blocked = load_task_by_id(&pool, "agent-task").await.unwrap().unwrap();
        assert!(blocked.in_agent_sop);
        assert!(blocked.completed_at.is_none());
        assert!(blocked.started_at.is_none());
        sqlx::query("UPDATE tasks SET blocked_since = '2026-10-21T00:00:00Z' WHERE id = 'agent-task'")
            .execute(&pool).await.unwrap();
        service.set_task_blocked(Parameters(SetTaskBlockedInput {
            task_id: "agent-task".into(), reason: "technical".into(), detail: "补充阻塞详情".into(),
        })).await.unwrap();
        assert_eq!(load_task_by_id(&pool, "agent-task").await.unwrap().unwrap().blocked_since.as_deref(), Some("2026-10-21T00:00:00Z"));

        for initial_status in ["blocked", "done"] {
            sqlx::query("UPDATE tasks SET column_id = ?, completed_at = 'old' WHERE id = 'agent-task'")
                .bind(initial_status).execute(&pool).await.unwrap();
            let result = service.submit_task_verification(Parameters(SubmitTaskVerificationInput {
                task_id: "agent-task".into(), implementation: "实现方案".into(),
                summary: "交付成果".into(), test_guide: "验证步骤".into(),
            })).await.unwrap().structured_content.unwrap();
            let task = &result["task"];
            assert_eq!(task["columnId"], "verify");
            assert_eq!(task["inAgentSop"], false);
            for field in ["completedAt", "startedAt", "blockedReason", "blockedSince"] {
                assert!(task[field].is_null(), "提测必须清除 {field}");
            }
        }

        for status in ["verify", "done", "ready"] {
            sqlx::query("UPDATE tasks SET column_id = ?, in_agent_sop = 0 WHERE id = 'agent-task'")
                .bind(status).execute(&pool).await.unwrap();
            service.update_checklist_item(Parameters(UpdateChecklistItemInput {
                task_id: "agent-task".into(), item_id: "item-1".into(), completed: true,
            })).await.unwrap();
            assert_eq!(load_task_by_id(&pool, "agent-task").await.unwrap().unwrap().in_agent_sop, status == "ready");
            service.append_task_notes(Parameters(AppendTaskNotesInput {
                task_id: "agent-task".into(), notes: "补充说明".into(),
            })).await.unwrap();
            assert_eq!(load_task_by_id(&pool, "agent-task").await.unwrap().unwrap().in_agent_sop, status == "ready");
        }

        pool.close().await;
        fs::remove_file(database).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[tokio::test]
    async fn streamable_http_lists_and_calls_read_tools() {
        let directory = std::env::temp_dir().join(format!(
            "kanboard-mcp-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let database = directory.join("kanboard.db");
        let pool = SqlitePool::connect_with(
            SqliteConnectOptions::new()
                .filename(&database)
                .create_if_missing(true),
        )
        .await
        .unwrap();
        let migrator: Migrator = crate::storage::migrations();
        migrator.run(&pool).await.unwrap();
        pool.close().await;

        let cancellation = CancellationToken::new();
        let service = StreamableHttpService::new(
            {
                let database = Arc::new(Mutex::new(database.clone()));
                move || Ok(KanboardMcp::new(database.clone(), None))
            },
            LocalSessionManager::default().into(),
            StreamableHttpServerConfig::default()
                .with_json_response(true)
                .with_cancellation_token(cancellation.child_token()),
        );
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let address = listener.local_addr().unwrap();
        let shutdown = cancellation.clone();
        let server = tokio::spawn(async move {
            axum::serve(listener, Router::new().nest_service("/mcp", service))
                .with_graceful_shutdown(shutdown.cancelled_owned())
                .await
                .unwrap();
        });

        let transport = StreamableHttpClientTransport::from_uri(format!(
            "http://{address}/mcp"
        ));
        let client = ClientConfig::default().serve(transport).await.unwrap();
        let tools = client.list_all_tools().await.unwrap();
        let names: HashSet<_> = tools.iter().map(|tool| tool.name.as_ref()).collect();
        assert!(names.contains("get_dashboard_summary"));
        assert!(names.contains("list_tasks"));
        assert!(names.contains("get_task"));
        assert!(names.contains("search_tasks"));
        assert!(names.contains("list_projects"));
        assert!(names.contains("list_tags"));
        assert!(names.contains("list_task_events"));
        assert!(names.contains("get_flow_metrics"));
        assert!(names.contains("update_task_status"));
        assert!(names.contains("set_task_blocked"));
        assert!(names.contains("update_checklist_item"));
        assert!(names.contains("append_task_notes"));
        assert!(names.contains("set_project_path"));
        assert!(names.contains("submit_task_verification"));
        assert!(names.contains("import_image_attachment"));
        assert!(names.contains("get_custom_sop"));
        assert!(names.contains("set_custom_sop"));
        assert!(names.contains("reset_custom_sop"));

        let initial_sop_res = client
            .call_tool(CallToolRequestParams::new("get_custom_sop"))
            .await
            .unwrap();
        let initial_sop = initial_sop_res.structured_content.unwrap();
        assert_eq!(initial_sop["sop"]["isCustom"], false);
        assert!(initial_sop["sop"]["summary"].as_str().unwrap().contains("请按 Kanboard SOP 执行该任务"));

        let set_sop_res = client
            .call_tool(
                CallToolRequestParams::new("set_custom_sop")
                    .with_arguments(serde_json::from_value(json!({
                        "summary": "自定义 SOP 概述：严格 TDD 驱动并经过架构评审。",
                        "content": "### 自定义团队 SOP 文档\n\n1. 编写红绿单测\n2. 提交评审"
                    })).unwrap())
            )
            .await
            .unwrap();
        let set_sop = set_sop_res.structured_content.unwrap();
        assert_eq!(set_sop["sop"]["isCustom"], true);
        assert_eq!(set_sop["sop"]["summary"], "自定义 SOP 概述：严格 TDD 驱动并经过架构评审。");

        let reset_sop_res = client
            .call_tool(CallToolRequestParams::new("reset_custom_sop"))
            .await
            .unwrap();
        let reset_sop = reset_sop_res.structured_content.unwrap();
        assert_eq!(reset_sop["sop"]["isCustom"], false);
        assert!(reset_sop["sop"]["summary"].as_str().unwrap().contains("请按 Kanboard SOP 执行该任务"));

        let result = client
            .call_tool(CallToolRequestParams::new("get_dashboard_summary"))
            .await
            .unwrap();
        assert_eq!(result.structured_content.unwrap()["totalActive"], 0);

        let test_pool = SqlitePool::connect_with(
            SqliteConnectOptions::new().filename(&database),
        )
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO tasks (id, column_id, title, description, recurrence_rule, position, created_at, updated_at) VALUES ('task-test-1', 'doing', '测试任务', '', 'none', 1000, '2026-10-21T00:00:00Z', '2026-10-21T00:00:00Z')"
        )
        .execute(&test_pool)
        .await
        .unwrap();
        test_pool.close().await;

        let source_image = directory.join("actual-screenshot.png");
        let png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        fs::write(&source_image, png).unwrap();
        let image_result = client.call_tool(
            CallToolRequestParams::new("import_image_attachment")
                .with_arguments(serde_json::from_value(json!({ "file_path": source_image })).unwrap())
        ).await.unwrap().structured_content.unwrap();
        let relative = image_result["attachment"]["relativePath"].as_str().unwrap();
        assert!(relative.starts_with("attachments/"));
        assert!(image_result["markdown"].as_str().unwrap().contains(relative));
        assert_eq!(crate::storage::read_image_attachment_impl(&directory, relative).unwrap().0, png);
        assert!(source_image.is_file());

        let verify_res = client
            .call_tool(
                CallToolRequestParams::new("submit_task_verification")
                    .with_arguments(serde_json::from_value(json!({
                        "task_id": "task-test-1",
                        "implementation": "| 模块 | 改动类型 | 核心逻辑说明 |\n| :--- | :--- | :--- |\n| `mcp.rs` | 接口规范 | 支持结构化表格入参 |\n| `TaskInspector.vue` | 前端组件 | 渲染 Markdown 表格与视图切换 |",
                        "summary": "- [x] 全部 68 项前端单测通过\n- [x] 全部 2 项后端单测通过",
                        "test_guide": format!("| 验证项 | 测试命令 / 操作路径 | 预期效果 |\n| :--- | :--- | :--- |\n| 前端单测 | `npm test` | 68 passed |\n| 后端测试 | `cargo test` | 2 passed |\n\n{}", image_result["markdown"].as_str().unwrap())
                    })).unwrap())
            )
            .await
            .unwrap();
        let verify_content = verify_res.structured_content.unwrap();
        assert_eq!(verify_content["task"]["columnId"], "verify");
        assert!(verify_content["task"]["reviewNotes"].as_str().unwrap().contains("| 模块 | 改动类型 | 核心逻辑说明 |"));
        assert_eq!(verify_content["verifiedPending"], true);
        assert!(verify_content["task"]["reviewNotes"].as_str().unwrap().contains(relative));

        client.cancel().await.unwrap();
        cancellation.cancel();
        server.await.unwrap();
        fs::remove_file(database).unwrap();
        fs::remove_file(source_image).unwrap();
        fs::remove_dir_all(directory.join("attachments")).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}

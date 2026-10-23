CREATE TABLE IF NOT EXISTS sop_configs (
    id TEXT PRIMARY KEY,
    summary TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    is_custom INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO sop_configs (id, summary, content, is_custom, updated_at)
VALUES (
    'current',
    '请按 Kanboard SOP 执行该任务：前往本地项目路径开发，完成后流转至「待验证」并提交验证方案（可读性优先：必要时使用表格、清单与代码块分项排版，避免单行堆砌，严格遵守中文文案排版指北，严禁使用 emoji）。',
    '### 任务接单与自主执行 SOP（标准作业流程）

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
  ```',
    0,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

---
name: kanboard-assistant
description: Query, manage, and execute local Kanboard tasks, projects, tags, status history, and flow metrics for end-to-end task execution, prioritization, and progress updates.
---

Use the `kanboard` MCP server whenever interacting with the user's Kanboard tasks and projects.

### 1. 任务接单与自主执行 SOP（标准作业流程）

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
     - **遵循《中文文案排版指北》规范**：严格遵循 [mzlogin/chinese-copywriting-guidelines](https://github.com/mzlogin/chinese-copywriting-guidelines)：
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
  | 前端单元测试 | `npm test` | 全部 68 项单测通过 |
  | 后端单元测试 | `cargo test --manifest-path src-tauri/Cargo.toml` | 全部 2 项单测通过 |
  | 界面交互验收 | 在看板中打开待验证任务检查器，查看「验证方案」Tab | Markdown 表格与内容优雅排版，可正常切换编辑与预览 |
  ```

### 2. 自定义 SOP 协同编写指引（【自定义 SOP】）

当用户在对话中给出【自定义 SOP】或提出定制、调整看板标准作业流程（SOP）时，必须严格按照如下流程引导协作：

1. **倾听与调研需求**：
   - 主动询问或确认用户团队的技术栈特性、流程门禁（如是否必须 TDD / 单元测试先行、是否需要架构审查、交付物与排版规范等）以及期望调整的具体环节。
2. **拟定双轨 SOP 方案**：
   - 输出完整的定制草案，草案必须同时包含两个部分：
     - **SOP 概述（`summary`）**：简明精炼（1 至 3 句话），此内容将在任务拖拽/下发时自动注入提示词尾部约束执行模型；
     - **完整 SOP 规范文档（`content`）**：结构清晰的 Markdown 详尽文档，包含接单流程、步骤指引、排版规范与验收模板。
3. **用户明确确认（安全门禁）**：
   - **Agent 严禁在未经用户明确确认前私自调用写入工具！**
   - 必须向用户完整呈现拟定的概述与文档内容，并提示用户回复确认（例如回复「确认应用」或「确认写入」）。
4. **调用工具落盘写入**：
   - 获得用户明确肯定答复后，调用专用工具：
     `set_custom_sop(summary="...", content="...")`
     系统将实时持久化写入数据库，看板端即刻生效，无需重启应用。
5. **支持随时重置**：
   - 若用户需要还原系统初始标准流程，可告知用户在设置面板点击「重置为默认」，或由 Agent 调用 `reset_custom_sop()` 工具完成重置。

### 3. 工具能力索引

- **查询类**：
  - `get_dashboard_summary`: 看板全景概览（逾期、高优、WIP 超限等），用于晨会或批量排期；
  - `list_tasks`: 多维过滤任务列表（支持状态、项目、优先级、截止日等）；
  - `get_task`: 获取单任务详细属性、检查项及完整历史轨迹；
  - `search_tasks`: 模糊检索任务；
  - `list_projects`: 获取所有项目信息及各状态任务分布；
  - `get_flow_metrics`: 看板效能度量（吞吐量、周期耗时、WIP 老化等）；
  - `get_custom_sop`: 获取当前 Kanboard 生效的 SOP，包含概述 summary、完整 Markdown 规范 content 与自定义状态。
- **执行与变更类**：
  - `import_image_attachment`: 导入本机实际截图到数据库同级附件目录，返回相对引用和可直接内嵌的 Markdown；源文件保留，支持 PNG、JPEG、GIF、WebP、BMP、SVG，单张最大 20 MB；
  - `submit_task_verification`: 提交任务提测并流转至 `verify` 列，录入结构化实现方案、交付成果与测试指南（支持表格排版、严格中英文空格、无 emoji、禁止单行堆砌）；
  - `update_task_status`: 变更任务列状态（`todo` / `ready` / `doing` / `verify` / `blocked` / `done`），支持可选 `review_notes`；
  - `update_checklist_item`: 勾选/取消勾选子项；
  - `append_task_notes`: 追加带时间戳的阶段性日志或备注；
  - `set_task_blocked`: 异常阻塞上报与弹窗通知；
  - `set_project_path`: 设置或更新项目本地代码库路径；
  - `set_custom_sop`: 经用户明确确认后，持久化写入自定义 SOP 概述与完整规范文档；
  - `reset_custom_sop`: 重置 SOP 为系统初始默认规范。

如果 MCP 服务不可用，提示用户打开 Kanboard 桌面端并在「设置 > AI 集成」中启动 MCP 服务。

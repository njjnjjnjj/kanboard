---
name: kanboard-assistant
description: Query, manage, and execute local Kanboard tasks, projects, tags, status history, and flow metrics for end-to-end task execution, prioritization, and progress updates.
---

Use the `kanboard` MCP server whenever interacting with the user's Kanboard tasks and projects.

### 1. 任务接单与自主执行 SOP（标准作业流程）

用户下发【看板任务】、拖入任务或指定任务 ID 要求执行时，使用 Kanboard MCP 工具协作：

1. 调用 `get_custom_sop` 读取当前生效的概述和完整规范，按该规范与用户指令执行。未定制时系统返回默认 SOP。
2. 调用 `get_task(task_id)` 读取目标、范围、验收条件、检查清单和项目路径；开始实际工作后移入「进行中」。简单任务直接执行，复杂任务按步骤与对应验证方式组织，按实际进展同步检查清单。
3. 需求经讨论确认后及时修订任务说明：先读取 `get_task`，再调用 `update_task_description(task_id, description, change_summary, expected_description)` 提交完整 Markdown 正文、简短摘要及读取时原文。禁止追加时间戳日志；历史通过 `list_task_description_versions` 查看，进度和阻塞备注独立记录，人工编辑不生成历史。
4. 自主推进已授权工作。关键歧义、范围变化或需要人工决策时请用户介入；仅暂停受影响的部分，整体无法继续时调用 `set_task_blocked` 并说明原因。
5. 可供验收时调用 `submit_task_verification(task_id, content="完整 Markdown 正文")`，由工具流转至「待验证」，Agent 不得自行标记为 `done`。

验收方案由执行 Agent 根据任务类型、复杂度和实际成果自主编排，不强制统一章节、表格、复选清单或篇幅。说明交付结果和必要核对方法，如实交代实际验证结果、未验证项及已知限制；信息可合并，避免重复。简单任务允许简短段落，复杂任务按需使用分节、列表、表格、代码块和截图，不要求套用模板。

自行校验中已有的相关截图先调用 `import_image_attachment(file_path="本机截图绝对路径")`，再将返回的 `markdown` 相对引用附入方案并标明验证点。不得使用项目绝对图片路径、`file://` 或临时协议地址；导入失败如实说明，不得宣称已上传。没有截图时无须额外生成。项目文档可使用 Markdown 本机绝对路径超链接，例如 `[方案](/D:/项目/docs/方案.md)`。

文档遵守中文排版规范，规范中英文、数字间空格及标点，禁止 emoji。最终由用户验收决定是否完成。

### 2. 自定义 SOP 协同编写指引（【自定义 SOP】）

当用户在对话中给出【自定义 SOP】或提出定制、调整看板标准作业流程（SOP）时，必须严格按照如下流程引导协作：

1. **倾听与调研需求**：
   - 主动询问或确认用户团队的技术栈特性、流程门禁（如是否必须 TDD / 单元测试先行、是否需要架构审查、交付物与排版规范等）以及期望调整的具体环节。
2. **拟定双轨 SOP 方案**：
   - 输出完整的定制草案，草案必须同时包含两个部分：
     - **SOP 概述（`summary`）**：简明精炼（1 至 3 句话），用于设置展示及 Agent 通过 `get_custom_sop` 读取，不再追加到任务拖拽或复制提示词中；
     - **完整 SOP 规范文档（`content`）**：结构清晰的 Markdown 详尽文档，包含接单流程、步骤指引、排版规范与验收原则；示例按需提供，不强制验收模板。
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
  - `submit_task_verification`: 提交任务提测并流转至 `verify` 列，通过 `content` 提交 Agent 自主编排的完整 Markdown 验收正文，不强制统一格式；
  - `update_task_status`: 变更任务列状态（`todo` / `ready` / `doing` / `verify` / `blocked` / `done`），支持可选 `review_notes`；
  - `update_checklist_item`: 勾选/取消勾选子项；
  - `update_task_description`: 整篇替换任务说明，必须提供修改摘要及原文，并自动保存历史版本；
  - `list_task_description_versions`: 查询任务说明历史正文、摘要、来源、保存时间及独立操作记录；
  - `append_task_notes`: 保存独立操作备注，不修改任务说明正文；
  - `set_task_blocked`: 异常阻塞上报与弹窗通知；
  - `set_project_path`: 设置或更新项目本地代码库路径；
  - `set_custom_sop`: 经用户明确确认后，持久化写入自定义 SOP 概述与完整规范文档；
  - `reset_custom_sop`: 重置 SOP 为系统初始默认规范。

如果 MCP 服务不可用，提示用户打开 Kanboard 桌面端并在「设置 > AI 集成」中启动 MCP 服务。

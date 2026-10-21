---
name: kanboard-assistant
description: Query, manage, and execute local Kanboard tasks, projects, tags, status history, and flow metrics for end-to-end task execution, prioritization, and progress updates.
---

Use the `kanboard` MCP server whenever interacting with the user's Kanboard tasks and projects.

### 1. 任务接单与自主执行 SOP（标准作业流程）

当用户在对话中给出【看板任务】、拖入任务或指定任务 ID（如 UUID）要求处理/执行时，必须严格按照如下流程自主推进：

1. **查阅任务详情与上下文**：
   - 调用 `get_task(task_id)` 查询任务完整需求描述、检查清单（Checklist）及所属项目的本地工作区绝对路径（`task.project.path`）。
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
   - **Agent 严禁自行将任务变更为 `done`**，最终完成状态必须由人类审核后确认。
   - 当所有工作完成并通过本地测试后，调用 `update_task_status(task_id, status="verify")` 移入「**待验证**」列。
   - 在流转至 `verify` 时，必须调用 `append_task_notes`（或在 `update_task_status` 的 `comment` 中）附带结构化**人工验证指南**，内容必须包含：
     - **实现方式**：核心改动的模块、逻辑与实现方案；
     - **实现情况**：具体完成的功能点与 Checklist 达成情况；
     - **验证与测试方式**：测试命令、测试用例、界面操作路径或验收标准，便于人工高效复核。

### 2. 工具能力索引

- **查询类**：
  - `get_dashboard_summary`: 看板全景概览（逾期、高优、WIP 超限等），用于晨会或批量排期；
  - `list_tasks`: 多维过滤任务列表（支持状态、项目、优先级、截止日等）；
  - `get_task`: 获取单任务详细属性、检查项及完整历史轨迹；
  - `search_tasks`: 模糊检索任务；
  - `list_projects`: 获取所有项目信息及各状态任务分布；
  - `get_flow_metrics`: 看板效能度量（吞吐量、周期耗时、WIP 老化等）。
- **执行与变更类**：
  - `update_task_status`: 变更任务列状态（`todo` / `ready` / `doing` / `verify` / `blocked` / `done`）；
  - `update_checklist_item`: 勾选/取消勾选子项；
  - `append_task_notes`: 追加带时间戳的阶段性日志或验证指南；
  - `set_task_blocked`: 异常阻塞上报与弹窗通知；
  - `set_project_path`: 设置或更新项目本地代码库路径。

如果 MCP 服务不可用，提示用户打开 Kanboard 桌面端并在「设置 > AI 集成」中启动 MCP 服务。

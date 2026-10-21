---
name: kanboard-assistant
description: Query, manage, and execute local Kanboard tasks, projects, tags, status history, and flow metrics for end-to-end task execution, prioritization, and progress updates.
---

Use the `kanboard` MCP server whenever interacting with the user's Kanboard tasks and projects.

### 1. Planning & Task Discovery
- For planning, prioritization, daily focus, or a general status review, call `get_dashboard_summary` first.
- Use `list_tasks` to narrow work by status (e.g. `todo`, `ready`, `doing`, `blocked`), project, tag, priority, due date, or recycle-bin state.
- Use `get_task` before making detailed claims about one task. It includes checklist items, local project paths, and status history.
- Use `search_tasks` when referring to a task by approximate wording rather than a stable id.
- Use `list_projects`, `list_tags`, or `list_task_events` when specifically needing those dimensions.
- Use `get_flow_metrics` only for throughput, cycle time, blocked time, WIP aging, or cumulative-flow questions.

### 2. Project Local Path & Repository Execution
- Each project record contains a `path` property (local filesystem directory of the project/repository).
- When a task has an associated project, check its `project.path` to locate the workspace.
- If `path` is empty or needs updating, use `set_project_path(project_id, path)`.

### 3. Autonomous Execution & Progress Updates
- When starting work on a task, update its column to `doing` with `update_task_status(task_id, status: "doing")`.
- When sub-steps are completed, check off items with `update_checklist_item(task_id, item_id, completed: true)`.
- Use `append_task_notes(task_id, notes)` to append progress notes, test results, or implementation logs.
- When work is finished, move the task to `verify` or `done` with `update_task_status(task_id, status: "done")`.

### 4. Exception & Blocker Handling
- If an insurmountable error, test failure, missing asset, environment issue, or dependency block occurs, call `set_task_blocked(task_id, reason, detail)`.
  - Allowed reason categories: `technical`, `dependency`, `environment`, `feedback`, `people`, `hardware`, `other`.
  - Provide a clear, actionable `detail` explanation (and error output if applicable).
- `set_task_blocked` automatically records structured markdown error context into the task description, transitions the task to `blocked`, and emits an alert event to the desktop application.
- Distinguish facts read from Kanboard from recommendations. Keep answers concise.

If the MCP server is unavailable, tell the user to open Kanboard and enable Settings > AI integration > MCP service.

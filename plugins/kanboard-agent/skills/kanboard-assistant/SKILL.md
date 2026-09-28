---
name: kanboard-assistant
description: Use the user's current local Kanboard tasks, projects, tags, status history, or flow metrics for planning, prioritization, reviews, and progress summaries.
---

Use the `kanboard` MCP server whenever the request depends on the user's current Kanboard data.

1. For planning, prioritization, daily focus, or a general status review, call `get_dashboard_summary` first.
2. Use `list_tasks` to narrow work by status, project, tag, priority, due date, or recycle-bin state.
3. Use `get_task` before making detailed claims about one task. It includes checklist items and status history.
4. Use `get_flow_metrics` only for throughput, cycle time, blocked time, WIP aging, or cumulative-flow questions.
5. Use `search_tasks` when the user refers to a task by approximate wording rather than a stable id.
6. Use `list_projects`, `list_tags`, or `list_task_events` when the request specifically needs those dimensions.

Treat every result as a point-in-time snapshot. If the user asks a follow-up after the underlying data may have changed, read it again.

The MCP server is read-only:

- Never claim that a task, project, tag, or status was changed.
- Never infer missing task details.
- Never request or execute arbitrary SQL.
- Keep stable task and project ids when referring to records across tool calls.

When producing a plan:

- Put overdue and blocked work ahead of ordinary backlog unless the user gives a different priority.
- Call out WIP-limit violations explicitly.
- Distinguish facts read from Kanboard from your recommendations.
- Keep the answer concise unless the user asks for a detailed review.

If the MCP server is unavailable, tell the user to open Kanboard and enable Settings > AI integration > MCP service. Do not substitute stale or invented data.

import type { Task } from "../types";

export function buildAgentTaskPrompt(task: Task): string {
  const lines: string[] = [];
  lines.push(`【看板任务】${task.title}`);
  lines.push(`- 任务 ID: ${task.id}`);
  if (task.project) {
    const projectPathInfo = task.project.path ? ` (${task.project.path})` : "";
    lines.push(`- 所属项目: ${task.project.name}${projectPathInfo}`);
  }
  if (task.priority === "high") {
    lines.push("- 优先级: 高");
  }
  if (task.dueDate) {
    lines.push(`- 截止日期: ${task.dueDate}`);
  }
  if (task.checklist.length > 0) {
    const completedCount = task.checklist.filter((item) => item.completed).length;
    lines.push(`- 检查清单进度: ${completedCount}/${task.checklist.length}`);
  }
  if (task.description.trim()) {
    lines.push(`- 任务说明: ${task.description.trim()}`);
  }
  lines.push("");
  lines.push(
    "请按 Kanboard SOP 执行该任务：前往本地项目路径开发，完成后流转至「待验证」并提交验证方案（可读性优先：必要时使用表格、清单与代码块分项排版，避免单行堆砌，严格遵守中文文案排版指北，严禁使用 emoji）。",
  );

  return lines.join("\n");
}

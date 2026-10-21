import type { Task } from "../types";

export function buildAgentTaskPrompt(task: Task): string {
  const lines: string[] = [];
  lines.push(`【Kanboard 任务派发】${task.title}`);
  lines.push(`- 任务 ID: ${task.id}`);
  lines.push(`- 当前状态: ${task.columnId}`);
  lines.push(`- 优先级: ${task.priority === "high" ? "高" : "普通"}`);
  if (task.project) {
    lines.push(`- 所属项目: ${task.project.name}`);
    if (task.project.path) {
      lines.push(`- 项目本地路径: ${task.project.path}`);
    }
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
  lines.push("请使用本地 `kanboard` MCP 服务自主推进并完成该任务：");
  lines.push(`1. 调用 \`get_task(task_id="${task.id}")\` 获取任务详情、完整检查清单及历史流转。`);
  lines.push(`2. 调用 \`update_task_status(task_id="${task.id}", status="doing")\` 将任务移至进行中。`);
  if (task.project?.path) {
    lines.push(`3. 前往项目本地路径 \`${task.project.path}\` 进行代码修改与测试。`);
  } else {
    lines.push("3. 根据任务要求进行代码修改与测试。");
  }
  lines.push("4. 在完成子项时，调用 `update_checklist_item` 实时打钩标记进度。");
  lines.push("5. 若遇到阻塞或无法自动解决的异常，调用 `set_task_blocked` 记录详细原因与阻塞上下文并向我汇报。");
  lines.push(`6. 任务全部完成后，调用 \`update_task_status(task_id="${task.id}", status="done")\`。`);

  return lines.join("\n");
}

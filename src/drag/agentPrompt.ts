import type { Task } from "../types";
import { currentSop, DEFAULT_SOP_SUMMARY } from "../data/sopRepository";

export function buildAgentTaskPrompt(task: Task, sopSummary?: string): string {
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

  const activeSopSummary = sopSummary?.trim() || currentSop.value.summary?.trim() || DEFAULT_SOP_SUMMARY;
  lines.push(activeSopSummary);

  return lines.join("\n");
}

export function buildCustomSopPrompt(currentSummary?: string): string {
  const summary = currentSummary?.trim() || currentSop.value.summary?.trim() || DEFAULT_SOP_SUMMARY;
  return [
    "【自定义 SOP】",
    "请作为研发流程专家与我协作定制 Kanboard 的任务执行 SOP（标准作业流程）。",
    "",
    "当前生效的 SOP 概述：",
    summary,
    "",
    "协作流程指引：",
    "1. 需求访谈：询问我团队的技术栈、分支规范、测试门禁与质量交付标准。",
    "2. 拟定双轨方案：根据讨论结果，输出包含两部分的草案：",
    "   - SOP 概述（summary）：精简指引（1 至 3 句），用于任务下发时约束 Agent；",
    "   - 完整 SOP 文档（content）：结构化 Markdown 长文档，包含流程、表格排版与提测规范。",
    "3. 人工确认门禁：草案向我汇报，必须在获得我明确确认（如输入“确认应用”）后，方可调用 MCP 工具 set_custom_sop 写入系统生效。",
    "4. 重置说明：告知我若需还原，可要求你调用 reset_custom_sop 或在设置界面点击“重置为默认”。",
  ].join("\n");
}

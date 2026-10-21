import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { buildAgentTaskPrompt } from "./agentPrompt";

describe("agentPrompt", () => {
  it("formats concise task prompt with project and path", () => {
    const task: Task = {
      id: "task-123",
      columnId: "todo",
      projectId: "p-1",
      project: { id: "p-1", name: "medchat-edge", color: "#8b4b3d", path: "D:/workspace/medchat-edge" },
      tags: [],
      title: "优化APP启动",
      description: "启动耗时降低到500ms以内",
      dueDate: "2026-10-30",
      priority: "high",
      position: 1000,
      completedAt: null,
      startedAt: null,
      blockedReason: null,
      blockedSince: null,
      checklist: [{ id: "c-1", text: "分析trace", completed: true, position: 1000 }],
      recurrenceRule: "none",
      reviewNotes: "",
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
    };

    const prompt = buildAgentTaskPrompt(task);
    expect(prompt).toContain("【看板任务】优化APP启动");
    expect(prompt).toContain("task-123");
    expect(prompt).toContain("所属项目: medchat-edge (D:/workspace/medchat-edge)");
    expect(prompt).toContain("优先级: 高");
    expect(prompt).toContain("检查清单进度: 1/1");
    expect(prompt).toContain("请按 Kanboard SOP 执行该任务：前往本地项目路径开发，完成后流转至「待验证」并附上验证指南。");
  });

  it("formats task prompt without project or path gracefully", () => {
    const task: Task = {
      id: "task-456",
      columnId: "ready",
      projectId: null,
      project: null,
      tags: [],
      title: "独立小任务",
      description: "",
      dueDate: null,
      priority: "none",
      position: 2000,
      completedAt: null,
      startedAt: null,
      blockedReason: null,
      blockedSince: null,
      checklist: [],
      recurrenceRule: "none",
      reviewNotes: "",
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
    };

    const prompt = buildAgentTaskPrompt(task);
    expect(prompt).toContain("【看板任务】独立小任务");
    expect(prompt).toContain("task-456");
    expect(prompt).not.toContain("所属项目");
    expect(prompt).toContain("请按 Kanboard SOP 执行该任务：前往本地项目路径开发，完成后流转至「待验证」并附上验证指南。");
  });
});

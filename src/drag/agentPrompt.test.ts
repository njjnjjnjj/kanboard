import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { AGENT_TASK_SOP_GUIDE, buildAgentTaskPrompt, buildCustomSopPrompt } from "./agentPrompt";
import { currentSop } from "../data/sopRepository";

describe("agentPrompt", () => {
  it("formats concise task prompt with project and path and appends SOP guidance", () => {
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
      inAgentSop: false,
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
    };

    const prompt = buildAgentTaskPrompt(task);
    expect(prompt).toContain("【看板任务】优化APP启动");
    expect(prompt).toContain("task-123");
    expect(prompt).toContain("所属项目: medchat-edge (D:/workspace/medchat-edge)");
    expect(prompt).toContain("优先级: 高");
    expect(prompt).toContain("检查清单进度: 1/1");
    expect(prompt).toContain("截止日期: 2026-10-30");
    expect(prompt).toContain("任务说明: 启动耗时降低到500ms以内");
    expect(prompt).toContain(AGENT_TASK_SOP_GUIDE);
    expect(prompt).toContain("get_custom_sop");
    expect(prompt).not.toContain("update_task_description");
    expect(prompt.endsWith("\n")).toBe(false);
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
      inAgentSop: false,
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
    };

    const prompt = buildAgentTaskPrompt(task);
    expect(prompt).toContain("【看板任务】独立小任务");
    expect(prompt).toContain("task-456");
    expect(prompt).not.toContain("所属项目");
    expect(prompt).toBe(`【看板任务】独立小任务\n- 任务 ID: task-456\n\n${AGENT_TASK_SOP_GUIDE}`);
  });

  it("keeps task prompts independent of the active custom SOP summary content", () => {
    const task: Task = {
      id: "task-789",
      columnId: "doing",
      projectId: null,
      project: null,
      tags: [],
      title: "重构网络层",
      description: "",
      dueDate: null,
      priority: "none",
      position: 3000,
      completedAt: null,
      startedAt: null,
      blockedReason: null,
      blockedSince: null,
      checklist: [],
      recurrenceRule: "none",
      reviewNotes: "",
      inAgentSop: false,
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
    };

    const previousSop = currentSop.value;
    try {
      currentSop.value = { ...previousSop, isCustom: true, summary: "执行团队敏捷 SOP：遵循 TDD 规范。" };
      const prompt = buildAgentTaskPrompt(task);
      expect(prompt).not.toContain("执行团队敏捷 SOP：遵循 TDD 规范。");
      expect(prompt).toContain(AGENT_TASK_SOP_GUIDE);
      expect(prompt).toBe(`【看板任务】重构网络层\n- 任务 ID: task-789\n\n${AGENT_TASK_SOP_GUIDE}`);
    } finally {
      currentSop.value = previousSop;
    }
  });

  it("builds custom SOP collaboration prompt with intention format", () => {
    const prompt = buildCustomSopPrompt("这是当前团队概述");
    expect(prompt).toContain("【自定义 SOP】");
    expect(prompt).toContain("这是当前团队概述");
    expect(prompt).toContain("需求访谈");
    expect(prompt).toContain("拟定双轨方案");
    expect(prompt).toContain("set_custom_sop");
    expect(prompt).toContain("reset_custom_sop");
    expect(prompt).toContain("get_custom_sop");
    expect(prompt).not.toContain("用于任务下发时约束 Agent");
  });
});

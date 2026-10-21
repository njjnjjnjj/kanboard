import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { Task, TaskColumn } from "../types";
import TaskInspector from "./TaskInspector.vue";

const mockTask: Task = {
  id: "task-001",
  columnId: "verify",
  projectId: null,
  project: null,
  tags: [],
  title: "待验证任务",
  description: "需求描述",
  dueDate: null,
  priority: "none",
  position: 1000,
  completedAt: null,
  startedAt: null,
  blockedReason: null,
  blockedSince: null,
  checklist: [],
  recurrenceRule: "none",
  reviewNotes: "### 实现方案\n已完成相关逻辑改造\n\n### 交付情况\n全部功能点已实现\n\n### 验证与测试方式\n请执行测试",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
};

const columns: TaskColumn[] = [
  { id: "todo", title: "收集箱", position: 1000, wipLimit: null, tasks: [] },
  { id: "doing", title: "进行中", position: 2000, wipLimit: null, tasks: [] },
  { id: "verify", title: "待验证", position: 3000, wipLimit: null, tasks: [] },
  { id: "done", title: "已完成", position: 4000, wipLimit: null, tasks: [] },
];

describe("TaskInspector verification tab", () => {
  it("renders 3 peer tabs and auto-selects verification tab when task is in verify status", () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: mockTask,
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
    });

    const tabs = wrapper.findAll(".task-inspector__tabs button");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].text()).toContain("任务详情");
    expect(tabs[1].text()).toContain("完成条件");
    expect(tabs[2].text()).toContain("待验证方案");
    expect(tabs[2].attributes("aria-selected")).toBe("true");

    const verificationPanel = wrapper.find("#task-verification-panel");
    expect(verificationPanel.isVisible()).toBe(true);
    expect(wrapper.find(".task-verification__toolbar").text()).toContain("当前任务等待人工核验");
    expect(wrapper.find(".secondary-button").text()).toBe("通过验证并完成");
  });

  it("passes verification and marks task as done upon clicking the button", async () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: mockTask,
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
    });

    const passBtn = wrapper.find(".task-verification__toolbar .secondary-button");
    await passBtn.trigger("click");

    const saveEvents = wrapper.emitted("save");
    expect(saveEvents).toBeTruthy();
    expect(saveEvents?.[0]?.[0]).toBe("task-001");
    expect(saveEvents?.[0]?.[1]).toMatchObject({
      columnId: "done",
      reviewNotes: expect.stringContaining("### 实现方案"),
    });
  });

  it("defaults to details tab for non-verify tasks and allows switching to verification tab", async () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: { ...mockTask, columnId: "todo", reviewNotes: "" },
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
    });

    const tabs = wrapper.findAll(".task-inspector__tabs button");
    expect(tabs[0].attributes("aria-selected")).toBe("true");
    expect(tabs[2].attributes("aria-selected")).toBe("false");

    // Click verification tab
    await tabs[2].trigger("click");
    expect(tabs[2].attributes("aria-selected")).toBe("true");
    expect(wrapper.find("#task-verification-panel").isVisible()).toBe(true);
    // Non-verify task does not show the pass verification toolbar
    expect(wrapper.find(".task-verification__toolbar").exists()).toBe(false);
  });
});

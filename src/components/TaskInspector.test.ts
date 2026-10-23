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
  reviewNotes: "### 1. 核心改动与实现方案\n\n| 模块 | 改动说明 |\n| :--- | :--- |\n| `TaskInspector.vue` | 增加表格渲染 |\n\n### 2. 交付成果\n\n- [x] 全部功能点已实现\n- [x] 新增 3 项测试\n\n### 3. 测试与验证指南\n\n```bash\nnpm test\n```",
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
  it("renders 3 peer tabs with '验证方案' and auto-selects verification tab when task is in verify status", () => {
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
    expect(tabs[2].text()).toContain("验证方案");
    expect(tabs[2].attributes("aria-selected")).toBe("true");

    const verificationPanel = wrapper.find("#task-verification-panel");
    expect(verificationPanel.isVisible()).toBe(true);
    expect(wrapper.find(".task-verification__toolbar").text()).toContain("当前任务等待人工核验");
    expect(wrapper.find(".secondary-button").text()).toBe("通过验证并完成");
  });

  it("renders unified instant-rendering editor directly without separate preview mode", async () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: mockTask,
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
    });

    // Verification notes editor is directly rendered in place
    const textarea = wrapper.find("textarea[data-inspector-review-notes]");
    expect(textarea.exists()).toBe(true);
    expect((textarea.element as HTMLTextAreaElement).value).toContain("### 1. 核心改动与实现方案");
    expect((textarea.element as HTMLTextAreaElement).value).toContain("| 模块 | 改动说明 |");

    // No separate toggle pills exist anymore
    expect(wrapper.find(".verification-view-toggle").exists()).toBe(false);
    expect(wrapper.find(".description-view-toggle").exists()).toBe(false);

    // Can directly update review notes
    await textarea.setValue("### 1. 更新改动");
    expect((textarea.element as HTMLTextAreaElement).value).toBe("### 1. 更新改动");
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
      reviewNotes: expect.stringContaining("### 1. 核心改动与实现方案"),
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
    // Directly presents the editor ready to write
    expect(wrapper.find("textarea[data-inspector-review-notes]").exists()).toBe(true);
  });

  it("opens fullscreen and pressing Esc only exits fullscreen without closing inspector", async () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: mockTask,
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
      attachTo: document.body,
    });

    const fullscreenBtn = wrapper.find(".fullscreen-toggle-btn");
    await fullscreenBtn.trigger("click");
    expect(document.querySelector(".markdown-fullscreen-modal")).toBeTruthy();

    const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(escEvent);
    await wrapper.vm.$nextTick();

    expect(document.querySelector(".markdown-fullscreen-modal")).toBeFalsy();
    expect(wrapper.emitted("close")).toBeFalsy();
    wrapper.unmount();
  });
});

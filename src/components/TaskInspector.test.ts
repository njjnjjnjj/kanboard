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
  inAgentSop: false,
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
  it("does not expose or submit an editable agent marker", async () => {
    const wrapper = mount(TaskInspector, {
      props: { task: { ...mockTask, columnId: "doing", inAgentSop: true }, columns, projects: [], tags: [], saving: false },
    });
    expect(wrapper.find(".field--agent-sop").exists()).toBe(false);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[0]?.[1]).not.toHaveProperty("inAgentSop");
    wrapper.unmount();
  });

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

  it("preserves draft description when props.task updates on the same task", async () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: mockTask,
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
    });

    const textarea = wrapper.find("textarea[data-inspector-description]");
    await textarea.setValue("正在本地编辑的任务说明");
    expect((textarea.element as HTMLTextAreaElement).value).toBe("正在本地编辑的任务说明");

    // Background refresh occurs for the same task
    await wrapper.setProps({
      task: {
        ...mockTask,
        columnId: "verify",
      },
    });
    await wrapper.vm.$nextTick();

    // Draft description must NOT be overwritten
    expect((textarea.element as HTMLTextAreaElement).value).toBe("正在本地编辑的任务说明");
    wrapper.unmount();
  });

  it("displays conflict banner and allows accepting external description when external content changes while draft is dirty", async () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: mockTask,
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
    });

    const textarea = wrapper.find("textarea[data-inspector-description]");
    await textarea.setValue("本地输入的内容");

    // External agent appends notes to task description
    await wrapper.setProps({
      task: {
        ...mockTask,
        description: "外部追加的最新说明",
      },
    });
    await wrapper.vm.$nextTick();

    // Local edits are preserved
    expect((textarea.element as HTMLTextAreaElement).value).toBe("本地输入的内容");

    // Conflict banner appears
    const banner = wrapper.find(".field--description .conflict-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("任务说明已有外部更新");

    // User accepts external update
    const acceptBtn = banner.findAll("button")[0];
    await acceptBtn.trigger("click");
    await wrapper.vm.$nextTick();

    expect((textarea.element as HTMLTextAreaElement).value).toBe("外部追加的最新说明");
    expect(wrapper.find(".field--description .conflict-banner").exists()).toBe(false);
    wrapper.unmount();
  });

  it("automatically syncs external description when user has not edited description", async () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: mockTask,
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
    });

    const textarea = wrapper.find("textarea[data-inspector-description]");
    expect((textarea.element as HTMLTextAreaElement).value).toBe("需求描述");

    // Background update without user having edited
    await wrapper.setProps({
      task: {
        ...mockTask,
        description: "由 Agent 补充的完整背景说明",
      },
    });
    await wrapper.vm.$nextTick();

    expect((textarea.element as HTMLTextAreaElement).value).toBe("由 Agent 补充的完整背景说明");
    expect(wrapper.find(".field--description .conflict-banner").exists()).toBe(false);
    wrapper.unmount();
  });

  it("syncs column status while preserving uncommitted description edits", async () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: { ...mockTask, columnId: "doing" },
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
    });

    const textarea = wrapper.find("textarea[data-inspector-description]");
    await textarea.setValue("正在开发中记录的笔记");

    // Agent finishes task and moves it to verify
    await wrapper.setProps({
      task: {
        ...mockTask,
        columnId: "verify",
      },
    });
    await wrapper.vm.$nextTick();

    // Status header and select are updated to 待验证
    expect(wrapper.find(".task-inspector__header span").text()).toBe("待验证");
    // Description remains intact
    expect((textarea.element as HTMLTextAreaElement).value).toBe("正在开发中记录的笔记");
    wrapper.unmount();
  });
});

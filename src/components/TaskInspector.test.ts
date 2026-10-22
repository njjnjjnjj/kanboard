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

  it("renders markdown preview with tables and lists by default and allows switching to edit mode", async () => {
    const wrapper = mount(TaskInspector, {
      props: {
        task: mockTask,
        columns,
        projects: [],
        tags: [],
        saving: false,
      },
    });

    // Verification preview is rendered with markdown elements
    const preview = wrapper.find(".verification-preview");
    expect(preview.exists()).toBe(true);
    expect(preview.html()).toContain("<h3>1. 核心改动与实现方案</h3>");
    expect(preview.find("table").exists()).toBe(true);
    expect(preview.find("th").text()).toBe("模块");
    expect(preview.html()).toContain("增加表格渲染");
    expect(preview.html()).toContain("全部功能点已实现");
    expect(preview.html()).toContain("language-bash");
    expect(preview.html()).toContain("npm test");
    expect(wrapper.find("textarea[data-inspector-review-notes]").exists()).toBe(false);

    // Switch to edit mode
    const editToggle = wrapper.findAll(".view-toggle-btn")[1];
    expect(editToggle.text()).toBe("编辑");
    await editToggle.trigger("click");

    const textarea = wrapper.find("textarea[data-inspector-review-notes]");
    expect(textarea.exists()).toBe(true);
    expect((textarea.element as HTMLTextAreaElement).value).toContain("### 1. 核心改动与实现方案");

    // Switch back to preview
    const previewToggle = wrapper.findAll(".view-toggle-btn")[0];
    await previewToggle.trigger("click");
    expect(wrapper.find(".verification-preview").exists()).toBe(true);
    expect(wrapper.find("textarea[data-inspector-review-notes]").exists()).toBe(false);
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
    // Empty review notes shows the empty guide state
    expect(wrapper.find(".verification-empty").exists()).toBe(true);

    // Clicking "编写验证方案" in empty state switches to edit mode
    await wrapper.find(".verification-empty button").trigger("click");
    expect(wrapper.find("textarea[data-inspector-review-notes]").exists()).toBe(true);
  });
});

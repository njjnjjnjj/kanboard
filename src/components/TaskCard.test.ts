import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../types";
import TaskCard from "./TaskCard.vue";

const mockTask: Task = {
  id: "task-001",
  columnId: "todo",
  projectId: "p-1",
  project: {
    id: "p-1",
    name: "medchat-edge",
    color: "#8b4b3d",
    path: "D:/workspace/medchat-edge",
  },
  tags: [{ id: "tag-1", name: "优化" }],
  title: "优化APP启动速度",
  description: "冷启动耗时降低至500ms以内",
  dueDate: "2026-10-31",
  priority: "high",
  position: 1000,
  completedAt: null,
  startedAt: null,
  blockedReason: null,
  blockedSince: null,
  checklist: [{ id: "c-1", text: "测试子任务", completed: false, position: 1000 }],
  recurrenceRule: "none",
  reviewNotes: "",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
};

describe("TaskCard native drag", () => {
  it("makes the whole card draggable natively without extra agent button", () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    const card = wrapper.get(".task-card");
    expect(card.attributes("draggable")).toBe("true");
    expect(wrapper.find(".task-card__agent-drag").exists()).toBe(false);
  });

  it("sets plain text prompt on card native dragstart", async () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    const card = wrapper.get(".task-card");
    const setData = vi.fn();
    const dataTransfer = {
      setData,
      effectAllowed: "none",
    };

    const dragEvent = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(dragEvent, "dataTransfer", { value: dataTransfer });

    await card.element.dispatchEvent(dragEvent);

    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      expect.stringContaining("【看板任务】优化APP启动速度"),
    );
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      expect.stringContaining("task-001"),
    );
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      expect.stringContaining("D:/workspace/medchat-edge"),
    );
    expect(setData).toHaveBeenCalledWith(
      "application/x-kanboard-task-id",
      "task-001",
    );
    expect(dataTransfer.effectAllowed).toBe("copyMove");
  });

  it("selects the card on click and preserves checkbox toggling", async () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    await wrapper.get(".task-card").trigger("click");
    expect(wrapper.emitted("select")).toEqual([["task-001"]]);

    await wrapper.get(".task-card__check").trigger("click");
    expect(wrapper.emitted("toggle")).toHaveLength(1);
  });
});

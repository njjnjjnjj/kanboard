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
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
};

describe("TaskCard Agent drag", () => {
  it("renders the Agent drag handle", () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    const dragHandle = wrapper.find(".task-card__agent-drag");
    expect(dragHandle.exists()).toBe(true);
    expect(dragHandle.attributes("draggable")).toBe("true");
    expect(dragHandle.text()).toContain("Agent");
  });

  it("sets plain text prompt on native dragstart", async () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    const dragHandle = wrapper.get(".task-card__agent-drag");
    const setData = vi.fn();
    const dataTransfer = {
      setData,
      effectAllowed: "none",
    };

    const dragEvent = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(dragEvent, "dataTransfer", { value: dataTransfer });

    await dragHandle.element.dispatchEvent(dragEvent);

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
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("does not trigger card selection when clicking the drag handle", async () => {
    const wrapper = mount(TaskCard, {
      props: { task: mockTask, selected: false },
    });

    const dragHandle = wrapper.get(".task-card__agent-drag");
    await dragHandle.trigger("click");

    expect(wrapper.emitted("select")).toBeUndefined();
  });
});

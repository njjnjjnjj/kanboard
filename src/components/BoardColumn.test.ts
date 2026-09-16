import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { VueDraggable } from "vue-draggable-plus";
import type { TaskColumn } from "../types";
import BoardColumn from "./BoardColumn.vue";

const column: TaskColumn = {
  id: "todo",
  title: "待处理",
  position: 1000,
  tasks: [
    {
      id: "task-1",
      columnId: "todo",
      projectId: null,
      project: null,
      tags: [],
      title: "可拖动任务",
      description: "",
      dueDate: null,
      priority: "none",
      position: 1000,
      completedAt: null,
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    },
  ],
};

function mountTrashZone(rect: { top: number; bottom: number; left: number; right: number }) {
  const zone = document.createElement("div");
  zone.dataset.dragTrash = "";
  zone.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    toJSON: () => ({}),
  }) as DOMRect;
  document.body.appendChild(zone);
  return zone;
}

afterEach(() => {
  document.querySelectorAll("[data-drag-trash]").forEach((zone) => zone.remove());
});

describe("BoardColumn drag contract", () => {
  it("allows dragging from the whole card while preserving the check control", async () => {
    const wrapper = mount(BoardColumn, {
      props: { column, selectedTaskId: null },
    });
    const draggable = wrapper.findComponent(VueDraggable);

    expect(draggable.props("handle")).toBeUndefined();
    expect(draggable.props("draggable")).toBe(".task-card");
    expect(draggable.props("filter")).toBe(".task-card__check");
    expect(draggable.props("preventOnFilter")).toBe(false);
    expect(draggable.props("forceFallback")).toBe(true);

    draggable.vm.$emit("start", {
      item: wrapper.get("[data-task-id='task-1']").element,
      oldDraggableIndex: 0,
    });
    draggable.vm.$emit("end", {
      item: wrapper.get("[data-task-id='task-1']").element,
      originalEvent: { clientX: 40, clientY: 120 },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("dragStart")).toEqual([[{ taskId: "task-1", index: 0 }]]);
    expect(wrapper.emitted("taskDrop")).toEqual([[{ taskId: "task-1", intoTrash: false }]]);
  });

  it("reports a drop released inside the delete zone", async () => {
    const zone = mountTrashZone({ top: 400, bottom: 452, left: 14, right: 786 });
    const wrapper = mount(BoardColumn, {
      props: { column, selectedTaskId: null },
    });
    const draggable = wrapper.findComponent(VueDraggable);

    draggable.vm.$emit("start", {
      item: wrapper.get("[data-task-id='task-1']").element,
      oldDraggableIndex: 0,
    });
    draggable.vm.$emit("end", {
      item: wrapper.get("[data-task-id='task-1']").element,
      originalEvent: { clientX: 400, clientY: 430 },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("taskDrop")).toEqual([[{ taskId: "task-1", intoTrash: true }]]);
    expect(zone.dataset.dragTrash).toBe("");
  });

  it("refuses insertions while the pointer is over the delete zone", () => {
    mountTrashZone({ top: 400, bottom: 452, left: 14, right: 786 });
    const wrapper = mount(BoardColumn, {
      props: { column, selectedTaskId: null },
    });
    const allowInsert = wrapper.findComponent(VueDraggable).props("onMove") as (
      event: unknown,
      originalEvent: unknown,
    ) => boolean;

    expect(allowInsert({}, { clientX: 400, clientY: 300 })).toBe(true);
    expect(allowInsert({}, { clientX: 400, clientY: 430 })).toBe(false);
  });

  it("keeps an empty column free of placeholder content", () => {
    const wrapper = mount(BoardColumn, {
      props: {
        column: { ...column, tasks: [] },
        selectedTaskId: null,
      },
    });

    expect(wrapper.find(".board-column__empty").exists()).toBe(false);
    expect(wrapper.get(".board-column__tasks").text()).toBe("");
  });
});

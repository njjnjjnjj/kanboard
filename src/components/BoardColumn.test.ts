import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
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

describe("BoardColumn drag contract", () => {
  it("uses the visible grip and only task cards as draggable items", async () => {
    const wrapper = mount(BoardColumn, {
      props: { column, selectedTaskId: null },
    });
    const draggable = wrapper.findComponent(VueDraggable);

    expect(draggable.props("handle")).toBe(".task-card__grip");
    expect(draggable.props("draggable")).toBe(".task-card");
    expect(draggable.props("forceFallback")).toBe(true);

    draggable.vm.$emit("end");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("reorder")).toHaveLength(1);
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

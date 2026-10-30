import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VueDraggable } from "vue-draggable-plus";
import tauriConfig from "../../src-tauri/tauri.conf.json";
import type { TaskColumn } from "../types";
import { AGENT_TASK_SOP_GUIDE } from "../drag/agentPrompt";
import BoardColumn from "./BoardColumn.vue";
import { ref } from "vue";

const column: TaskColumn = {
  id: "todo",
  title: "待处理",
  position: 1000,
  wipLimit: null,
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
      startedAt: null,
      blockedReason: null,
      blockedSince: null,
      checklist: [],
      recurrenceRule: "none",
      inAgentSop: false,
      reviewNotes: "",
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
  it("uses the shared motion policy for Sortable and turns it off for keyboard or reduced motion", async () => {
    const motionEnabled = ref(false);
    const wrapper = mount(BoardColumn, {
      props: { column, selectedTaskId: null },
      global: { provide: { motionEnabled } },
    });
    const draggable = wrapper.getComponent(VueDraggable);
    expect(draggable.props("animation")).toBe(0);
    motionEnabled.value = true;
    await wrapper.vm.$nextTick();
    expect(draggable.props("animation")).toBe(120);
    expect(draggable.props("easing")).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    wrapper.unmount();
  });

  it("keeps full WIP and matching counts when collapsed without a drop target", async () => {
    const wrapper = mount(BoardColumn, {
      props: {
        column: { ...column, wipLimit: 2, totalTaskCount: 3 },
        selectedTaskId: null,
        collapsed: true,
        showMatches: true,
      },
    });
    const list = wrapper.getComponent(VueDraggable);
    const listElement = list.element;
    expect(list.isVisible()).toBe(false);
    expect(list.props("disabled")).toBe(true);
    expect(list.attributes("inert")).toBeDefined();
    expect(list.attributes("aria-hidden")).toBe("true");
    expect(wrapper.get(".board-column__header").text()).toContain("3 / 2");
    expect(wrapper.get(".board-column__header").text()).toContain("超限");
    expect(wrapper.get(".board-column__matches").text()).toBe("匹配 1");
    const button = wrapper.get("[aria-label='展开待处理列']");
    expect(button.attributes("aria-expanded")).toBe("false");
    await button.trigger("click");
    expect(wrapper.emitted("toggleCollapse")).toEqual([["todo"]]);
    expect(wrapper.emitted("updateTasks")).toBeUndefined();
    await wrapper.setProps({ collapseDisabled: true });
    await button.trigger("click");
    expect(wrapper.emitted("toggleCollapse")).toHaveLength(1);
    await wrapper.setProps({ collapsed: false });
    expect(wrapper.getComponent(VueDraggable).element).toBe(listElement);
    expect((listElement as HTMLElement).style.display).not.toBe("none");
    expect(list.attributes("aria-hidden")).toBeUndefined();
    expect(list.props("disabled")).toBe(false);
    wrapper.unmount();
  });

  it("lets the Windows webview receive native HTML5 drops for the board", () => {
    // Tauri's default native drop handler intercepts the HTML5 events Sortable needs.
    expect(tauriConfig.app.windows[0]).toHaveProperty("dragDropEnabled", false);
  });

  it("allows dragging from the whole card with native drag support", async () => {
    const wrapper = mount(BoardColumn, {
      props: { column, selectedTaskId: null },
    });
    const draggable = wrapper.findComponent(VueDraggable);

    expect(draggable.props("handle")).toBeUndefined();
    expect(draggable.props("draggable")).toBe(".task-card");
    expect(draggable.props("filter")).toBe(".task-card__check");
    expect(draggable.props("preventOnFilter")).toBe(false);
    expect(draggable.props("forceFallback")).toBe(false);
    expect(draggable.props("setData")).toBeTypeOf("function");

    const setDataFn = draggable.props("setData") as (dt: { setData: (k: string, v: string) => void; effectAllowed: string }, el: HTMLElement) => void;
    const mockSetData = vi.fn();
    const dataTransfer = { setData: mockSetData, effectAllowed: "" };
    setDataFn(dataTransfer, wrapper.get("[data-task-id='task-1']").element as HTMLElement);
    expect(mockSetData).toHaveBeenCalledWith(
      "text/plain",
      `【看板任务】可拖动任务\n- 任务 ID: task-1\n\n${AGENT_TASK_SOP_GUIDE}`,
    );
    expect(mockSetData).toHaveBeenCalledWith("application/x-kanboard-task-id", "task-1");
    expect(dataTransfer.effectAllowed).toBe("copyMove");

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

  it("shows and highlights a WIP limit exceeded by the full column", () => {
    const wrapper = mount(BoardColumn, {
      props: {
        column: { ...column, id: "doing", wipLimit: 2, totalTaskCount: 3 },
        selectedTaskId: null,
      },
    });

    expect(wrapper.classes()).toContain("board-column--wip-exceeded");
    expect(wrapper.get(".board-column__header").text()).toContain("3 / 2");
    expect(wrapper.get(".board-column__header").text()).toContain("超限");
  });

  it("supports inline editing of WIP limit for eligible columns", async () => {
    const wrapper = mount(BoardColumn, {
      props: {
        column: { ...column, id: "doing", wipLimit: 2, totalTaskCount: 1 },
        selectedTaskId: null,
      },
    });

    const badge = wrapper.get(".board-column__wip-badge--editable");
    expect(badge.attributes("role")).toBe("button");
    expect(badge.attributes("title")).toBe("点击修改上限");

    await badge.trigger("click");
    const input = wrapper.get(".board-column__wip-inline-input");
    expect(input.isVisible()).toBe(true);

    await input.setValue("6");
    await wrapper.get(".board-column__wip-form").trigger("submit");

    expect(wrapper.emitted("updateWipLimit")).toEqual([["doing", 6]]);
    expect(wrapper.find(".board-column__wip-inline-input").exists()).toBe(false);
  });

  it("cancels inline editing of WIP limit when Escape is pressed", async () => {
    const wrapper = mount(BoardColumn, {
      props: {
        column: { ...column, id: "verify", wipLimit: 2, totalTaskCount: 0 },
        selectedTaskId: null,
      },
    });

    await wrapper.get(".board-column__wip-badge--editable").trigger("click");
    const input = wrapper.get(".board-column__wip-inline-input");
    await input.setValue("10");
    await input.trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("updateWipLimit")).toBeUndefined();
    expect(wrapper.find(".board-column__wip-inline-input").exists()).toBe(false);
  });
});

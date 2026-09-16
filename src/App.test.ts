import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VueDraggable } from "vue-draggable-plus";
import App from "./App.vue";
import type { Task, TaskColumn } from "./types";

const repository = vi.hoisted(() => ({
  createTask: vi.fn(),
  deleteTag: vi.fn(),
  deleteTask: vi.fn(),
  loadProjects: vi.fn(),
  loadTags: vi.fn(),
  loadTaskWall: vi.fn(),
  saveProject: vi.fn(),
  saveTaskOrder: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("./data/taskRepository", () => repository);

const existingTask: Task = {
  id: "task-1",
  columnId: "todo",
  projectId: null,
  project: null,
  tags: [],
  title: "整理个人任务",
  description: "",
  dueDate: null,
  priority: "none",
  position: 1000,
  completedAt: null,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

function wall(): TaskColumn[] {
  return [
    { id: "todo", title: "待处理", position: 1000, tasks: [{ ...existingTask }] },
    { id: "doing", title: "进行中", position: 2000, tasks: [] },
    { id: "waiting", title: "等待", position: 3000, tasks: [] },
    { id: "done", title: "已完成", position: 4000, tasks: [] },
  ];
}

describe("personal task wall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.loadTaskWall.mockResolvedValue(wall());
    repository.loadProjects.mockResolvedValue([]);
    repository.loadTags.mockResolvedValue([]);
    repository.saveTaskOrder.mockResolvedValue(undefined);
    repository.updateTask.mockResolvedValue([]);
    repository.deleteTask.mockResolvedValue(undefined);
    repository.deleteTag.mockResolvedValue(undefined);
  });

  it("adds a task from the header and selects it", async () => {
    repository.createTask.mockResolvedValue({
      ...existingTask,
      id: "task-2",
      title: "准备每周回顾",
      position: 2000,
    });
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    await wrapper.get("[aria-label='新任务标题']").setValue("准备每周回顾");
    await wrapper.get(".quick-add").trigger("submit");
    await flushPromises();

    expect(repository.createTask).toHaveBeenCalledWith("准备每周回顾", "todo", null);
    expect(wrapper.text()).toContain("准备每周回顾");
    expect(wrapper.text()).toContain("任务详情");
    expect(document.activeElement).toBe(wrapper.get("[data-inspector-description]").element);
    expect(wrapper.find("select").exists()).toBe(false);
    wrapper.unmount();
  });

  it("adds a task directly to the project currently in view", async () => {
    repository.loadProjects.mockResolvedValue([
      {
        id: "project-1",
        name: "看板桌面版",
        color: "#285a78",
        description: "",
        targetDate: null,
        status: "active",
        createdAt: "2026-09-16T00:00:00.000Z",
        updatedAt: "2026-09-16T00:00:00.000Z",
      },
    ]);
    repository.createTask.mockResolvedValue({
      ...existingTask,
      id: "task-2",
      title: "补充项目筛选",
      position: 2000,
    });
    const wrapper = mount(App);
    await flushPromises();

    const projectButton = wrapper.findAll("button").find((button) => button.text().includes("看板桌面版"));
    await projectButton?.trigger("click");
    await wrapper.get("[aria-label='新任务标题']").setValue("补充项目筛选");
    await wrapper.get(".quick-add").trigger("submit");
    await flushPromises();

    expect(repository.createTask).toHaveBeenCalledWith("补充项目筛选", "todo", "project-1");
    expect(wrapper.get("[data-task-id='task-2']").text()).toContain("看板桌面版");
  });

  it("moves a task to completed from its check control", async () => {
    const wrapper = mount(App);
    await flushPromises();

    await wrapper.get("[aria-label='完成任务：整理个人任务']").trigger("click");
    await flushPromises();

    expect(repository.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ columnId: "done" }),
    );
    expect(wrapper.find("[aria-label='恢复任务：整理个人任务']").exists()).toBe(true);
  });

  /** Delete zone geometry as laid out by the app: a compact pill at the bottom centre. */
  const trashRect = { top: 400, bottom: 456, left: 460, right: 740, x: 460, y: 400, width: 280, height: 56 };

  function stubTrashZone(wrapper: ReturnType<typeof mount>) {
    const zone = wrapper.get("[data-drag-trash]").element as HTMLElement;
    zone.getBoundingClientRect = () => ({ ...trashRect, toJSON: () => ({}) }) as DOMRect;
    return zone;
  }

  it("deletes a task dropped on the drag trash", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    stubTrashZone(wrapper);
    const sourceColumn = wrapper.findAllComponents(VueDraggable)[0];

    sourceColumn.vm.$emit("end", {
      item: wrapper.get("[data-task-id='task-1']").element,
      originalEvent: { clientX: 600, clientY: 428 },
    });
    await flushPromises();

    expect(repository.deleteTask).toHaveBeenCalledWith("task-1");
    expect(wrapper.text()).not.toContain("整理个人任务");
    wrapper.unmount();
  });

  it("pulls the dragged card out of the column while the pointer is on the trash", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    stubTrashZone(wrapper);
    const sourceColumn = wrapper.findAllComponents(VueDraggable)[0];
    const card = wrapper.get("[data-task-id='task-1']").element as HTMLElement;
    const todoList = wrapper.get('[data-column="todo"] .board-column__tasks').element;
    const doingList = wrapper.get('[data-column="doing"] .board-column__tasks').element;

    sourceColumn.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    // Sortable parks the dragged node in whatever list the pointer last hovered.
    card.classList.add("task-card--ghost");
    doingList.appendChild(card);
    expect(doingList.contains(card)).toBe(true);

    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 600, clientY: 428 }));
    await wrapper.vm.$nextTick();

    expect(doingList.contains(card)).toBe(false);
    expect(todoList.children[0]).toBe(card);
    // Nothing of the card may be advertised in a column while the pointer is on "delete".
    expect(wrapper.get(".board-columns").classes()).toContain("board-columns--trash-target");
    wrapper.unmount();
  });

  it("keeps a task released above the drag trash in the wall", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    stubTrashZone(wrapper);
    const sourceColumn = wrapper.findAllComponents(VueDraggable)[0];

    sourceColumn.vm.$emit("end", {
      item: wrapper.get("[data-task-id='task-1']").element,
      originalEvent: { clientX: 600, clientY: 240 },
    });
    await flushPromises();

    expect(repository.deleteTask).not.toHaveBeenCalled();
    expect(repository.saveTaskOrder).toHaveBeenCalled();
    wrapper.unmount();
  });
});

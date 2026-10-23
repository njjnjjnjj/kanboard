import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VueDraggable } from "vue-draggable-plus";
import App from "./App.vue";
import type { Task, TaskColumn } from "./types";

const taskCreatedListener = vi.hoisted(() => ({
  value: undefined as undefined | ((event: { payload: string | null }) => void | Promise<void>),
}));
const openTaskListener = vi.hoisted(() => ({
  value: undefined as undefined | ((event: { payload: string }) => void | Promise<void>),
}));
const mcpStatusTransitionListener = vi.hoisted(() => ({
  value: undefined as undefined | ((event: { payload: any }) => void | Promise<void>),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, listener: any) => {
    if (event === "task-created") taskCreatedListener.value = listener;
    if (event === "open-task") openTaskListener.value = listener;
    if (event === "mcp:status-transition") mcpStatusTransitionListener.value = listener;
    return vi.fn();
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  onAction: vi.fn(async () => ({ unregister: vi.fn() })),
}));

const repository = vi.hoisted(() => ({
  createTask: vi.fn(),
  deleteTag: vi.fn(),
  deleteTask: vi.fn(),
  loadDeletedTasks: vi.fn(),
  loadProjects: vi.fn(),
  loadTags: vi.fn(),
  loadTaskEvents: vi.fn(),
  loadTaskWall: vi.fn(),
  saveProject: vi.fn(),
  saveTaskOrder: vi.fn(),
  updateTask: vi.fn(),
  createRecurringSuccessor: vi.fn(),
  restoreTask: vi.fn(),
  trashTask: vi.fn(),
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
  startedAt: null,
  blockedReason: null,
  blockedSince: null,
  checklist: [],
  recurrenceRule: "none",
  reviewNotes: "",
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
};

function wall(): TaskColumn[] {
  return [
    { id: "todo", title: "收集箱", position: 1000, wipLimit: null, tasks: [{ ...existingTask }] },
    { id: "backlog", title: "待办池", position: 2000, wipLimit: null, tasks: [] },
    { id: "ready", title: "就绪", position: 3000, wipLimit: null, tasks: [] },
    { id: "doing", title: "进行中", position: 4000, wipLimit: 2, tasks: [] },
    { id: "verify", title: "待验证", position: 5000, wipLimit: 2, tasks: [] },
    { id: "blocked", title: "阻塞", position: 6000, wipLimit: null, tasks: [] },
    { id: "done", title: "已完成", position: 7000, wipLimit: null, tasks: [] },
  ];
}

describe("personal task wall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taskCreatedListener.value = undefined;
    openTaskListener.value = undefined;
    mcpStatusTransitionListener.value = undefined;
    repository.loadTaskWall.mockResolvedValue(wall());
    repository.loadProjects.mockResolvedValue([]);
    repository.loadTags.mockResolvedValue([]);
    repository.loadTaskEvents.mockResolvedValue([]);
    repository.loadDeletedTasks.mockResolvedValue([]);
    repository.createRecurringSuccessor.mockResolvedValue(false);
    repository.restoreTask.mockResolvedValue(undefined);
    repository.trashTask.mockResolvedValue("2026-09-17T00:00:00.000Z");
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

  it("opens the newly captured task for editing when requested", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const refreshedWall = wall();
    refreshedWall[0].tasks.push({ ...existingTask, id: "new-task", title: "补充任务信息" });
    repository.loadTaskWall.mockResolvedValue(refreshedWall);

    await taskCreatedListener.value?.({ payload: "new-task" });
    await flushPromises();

    expect(repository.loadTaskWall).toHaveBeenCalledTimes(2);
    expect(wrapper.find(".task-drawer-layer").exists()).toBe(true);
    expect((wrapper.get("[data-inspector-title]").element as HTMLInputElement).value).toBe("补充任务信息");
    wrapper.unmount();
  });

  it("focuses quick capture with Ctrl + K", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));

    expect(document.activeElement).toBe(wrapper.get("[aria-label='新任务标题']").element);
    wrapper.unmount();
  });

  it("keeps task details out of the layout until a task is selected", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.find(".task-inspector").exists()).toBe(false);
    expect(wrapper.find(".task-drawer-layer").exists()).toBe(false);

    await wrapper.get("[data-task-id='task-1']").trigger("click");
    await flushPromises();
    expect(wrapper.find(".task-drawer-layer").exists()).toBe(true);
    expect(document.activeElement).toBe(wrapper.get("[data-inspector-title]").element);

    await wrapper.get("[aria-label='关闭任务详情']").trigger("click");
    await flushPromises();
    expect(wrapper.find(".task-inspector").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get("[data-task-id='task-1']").element);
    wrapper.unmount();
  });

  it("does not show the retired focus mode", async () => {
    const readyWall = wall();
    const task = readyWall[0]!.tasks.shift()!;
    task.columnId = "ready";
    readyWall[2]!.tasks.push(task);
    repository.loadTaskWall.mockResolvedValue(readyWall);
    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find("[data-tour='focus-mode']").exists()).toBe(false);
    expect(wrapper.find(".focus-bar").exists()).toBe(false);
    const shortcut = new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, shiftKey: true, cancelable: true });
    window.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(false);
    await wrapper.get("[data-task-id='task-1']").trigger("click");
    expect(wrapper.find(".task-inspector__save .secondary-button").exists()).toBe(false);
    wrapper.unmount();
  });

  it("switches between details and a full checklist page without losing the draft", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    await wrapper.get("[data-task-id='task-1']").trigger("click");
    await wrapper.get("[data-inspector-description]").setValue("任务背景");
    expect(wrapper.get("#task-details-tab").attributes("aria-selected")).toBe("true");
    await wrapper.get("#task-checklist-tab").trigger("click");
    expect(wrapper.get("#task-checklist-tab").attributes("aria-selected")).toBe("true");
    expect(wrapper.get("#task-details-panel").attributes("style")).toContain("display: none");
    await wrapper.get(".task-checklist__add").trigger("click");
    await flushPromises();
    const input = wrapper.find<HTMLInputElement>(".task-checklist__item input[type='text']").element;
    expect(input).not.toBeNull();
    input.value = "完成验收";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();

    expect(wrapper.get("#task-checklist-tab").text()).toContain("0/1");
    await wrapper.get("#task-details-tab").trigger("click");
    expect((wrapper.get("[data-inspector-description]").element as HTMLTextAreaElement).value).toBe("任务背景");
    await wrapper.get("#task-details-tab").trigger("keydown", { key: "ArrowRight" });
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get("#task-checklist-tab").element);
    expect(wrapper.find(".task-inspector").exists()).toBe(true);
    await wrapper.get(".task-inspector__form").trigger("submit");
    await flushPromises();
    expect(repository.updateTask).toHaveBeenCalledWith(
      "task-1", expect.objectContaining({ description: "任务背景", checklist: [expect.objectContaining({ text: "完成验收" })] }),
    );
    expect(wrapper.get("#task-checklist-tab").attributes("aria-selected")).toBe("true");
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
    expect(wrapper.find(".board-columns").exists()).toBe(true);
  });

  it("shows full-height columns after switching from swimlanes to a project", async () => {
    repository.loadProjects.mockResolvedValue([{
      id: "project-1", name: "看板桌面版", color: "#285a78", description: "", targetDate: null,
      status: "active", createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
    }]);
    const wrapper = mount(App);
    await flushPromises();

    await wrapper.get("[data-tour='swimlane']").trigger("click");
    expect(wrapper.find(".swimlane-board").exists()).toBe(true);
    await wrapper.get(".workspace-nav__section .workspace-nav__row").trigger("click");
    expect(wrapper.find(".board-columns").exists()).toBe(true);
    expect(wrapper.find(".swimlane-board").exists()).toBe(false);
    expect(wrapper.get("[data-tour='swimlane']").attributes("disabled")).toBeDefined();
    wrapper.unmount();
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

  it("moves active work to verification instead of marking it done", async () => {
    const activeWall = wall();
    const task = activeWall[0]!.tasks.shift()!;
    task.columnId = "doing";
    activeWall.find((column) => column.id === "doing")!.tasks.push(task);
    repository.loadTaskWall.mockResolvedValue(activeWall);
    const wrapper = mount(App);
    await flushPromises();

    await wrapper.get("[aria-label='提交验证：整理个人任务']").trigger("click");
    await flushPromises();

    expect(repository.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ columnId: "verify" }),
    );
  });

  /** Delete zone geometry as laid out by the app: a compact pill at the bottom centre. */
  const trashRect = { top: 400, bottom: 456, left: 460, right: 740, x: 460, y: 400, width: 280, height: 56 };

  function stubTrashZone(wrapper: ReturnType<typeof mount>) {
    const zone = wrapper.get("[data-drag-trash]").element as HTMLElement;
    zone.getBoundingClientRect = () => ({ ...trashRect, toJSON: () => ({}) }) as DOMRect;
    return zone;
  }

  it("moves a task to trash and offers undo after dropping it on the delete zone", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    stubTrashZone(wrapper);
    const sourceColumn = wrapper.findAllComponents(VueDraggable)[0];

    sourceColumn.vm.$emit("end", {
      item: wrapper.get("[data-task-id='task-1']").element,
      originalEvent: { clientX: 600, clientY: 428 },
    });
    await flushPromises();

    expect(repository.trashTask).toHaveBeenCalledWith("task-1");
    expect(wrapper.text()).not.toContain("整理个人任务");
    expect(wrapper.get("[aria-label='撤回删除']").text()).toContain("撤回删除");

    await wrapper.get("[aria-label='撤回删除']").trigger("click");
    await flushPromises();
    expect(repository.restoreTask).toHaveBeenCalledWith("task-1");
    wrapper.unmount();
  });

  it("pulls the dragged card out of the column while the pointer is on the trash", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const zone = stubTrashZone(wrapper);
    const sourceColumn = wrapper.findAllComponents(VueDraggable)[0];
    const card = wrapper.get("[data-task-id='task-1']").element as HTMLElement;
    const todoList = wrapper.get('[data-column="todo"] .board-column__tasks').element;
    const doingList = wrapper.get('[data-column="doing"] .board-column__tasks').element;

    sourceColumn.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    expect(zone.hasAttribute("disabled")).toBe(false);
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

    expect(repository.trashTask).not.toHaveBeenCalled();
    expect(repository.saveTaskOrder).toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each(["todo", "doing"])("saves an internal native drop into %s", async (targetColumnId) => {
    const initialWall = wall();
    const secondTask = { ...existingTask, id: "task-2", title: "第二个任务", position: 2000 };
    initialWall[0]!.tasks.push(secondTask);
    repository.loadTaskWall.mockResolvedValue(initialWall);
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const sourceColumn = wrapper.findAllComponents(VueDraggable)[0]!;
    const targetColumn = wrapper.findAllComponents(VueDraggable)[targetColumnId === "todo" ? 0 : 3]!;
    const card = wrapper.get("[data-task-id='task-1']").element;

    sourceColumn.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    sourceColumn.vm.$emit("update:modelValue", [secondTask]);
    targetColumn.vm.$emit("update:modelValue", targetColumnId === "todo"
      ? [secondTask, { ...existingTask }]
      : [{ ...existingTask }]);
    await wrapper.vm.$nextTick();

    const target = wrapper.get(`[data-column='${targetColumnId}'] .board-column__tasks`);
    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    const dataTransfer = { dropEffect: "none" };
    Object.defineProperty(dragOver, "dataTransfer", { value: dataTransfer });
    target.element.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe("move");
    await target.trigger("drop");
    sourceColumn.vm.$emit("end", { item: card, originalEvent: { clientX: 600, clientY: 240 } });
    await flushPromises();

    expect(repository.saveTaskOrder).toHaveBeenCalledTimes(1);
    const savedColumns = repository.saveTaskOrder.mock.calls[0]![0] as TaskColumn[];
    expect(savedColumns.find((column) => column.id === targetColumnId)!.tasks.map((task) => task.id))
      .toEqual(targetColumnId === "todo" ? ["task-2", "task-1"] : ["task-1"]);
    expect(repository.trashTask).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("reverts card state and does not save order when drag ends outside the window without an internal drop", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    vi.clearAllMocks();

    const sourceColumn = wrapper.findAllComponents(VueDraggable)[0];
    const card = wrapper.get("[data-task-id='task-1']").element as HTMLElement;

    // Start drag
    sourceColumn.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    sourceColumn.vm.$emit("update:modelValue", []);
    wrapper.findAllComponents(VueDraggable)[3]!.vm.$emit("update:modelValue", [{ ...existingTask }]);
    await wrapper.vm.$nextTick();

    // End drag without an internal drop event (e.g. dropped in Codex outside the window)
    sourceColumn.vm.$emit("end", {
      item: card,
      originalEvent: { clientX: -100, clientY: -100 },
    });
    await flushPromises();

    expect(repository.saveTaskOrder).not.toHaveBeenCalled();
    expect(repository.trashTask).not.toHaveBeenCalled();
    expect(wrapper.find("[data-column='todo'] [data-task-id='task-1']").exists()).toBe(true);
    expect(wrapper.find("[data-column='doing'] [data-task-id='task-1']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("expands corresponding task panel when receiving open-task event from notification click", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    await openTaskListener.value?.({ payload: "task-1" });
    await flushPromises();

    expect(wrapper.find(".task-drawer-layer").exists()).toBe(true);
    expect((wrapper.get("[data-inspector-title]").element as HTMLInputElement).value).toBe("整理个人任务");
    wrapper.unmount();
  });

  it("reloads tasks and announces status update when receiving mcp:status-transition event", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    vi.clearAllMocks();

    await mcpStatusTransitionListener.value?.({
      payload: {
        taskId: "task-1",
        title: "整理个人任务",
        fromStatus: "doing",
        toStatus: "verify",
      },
    });
    await flushPromises();

    expect(repository.loadTaskWall).toHaveBeenCalledTimes(1);
    expect(wrapper.get(".sr-status").text()).toContain("待验证");
    wrapper.unmount();
  });

  it("re-expands task inspector and closes dashboard if open when open-task event arrives", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    // Open flow dashboard first
    wrapper.get("[data-tour='flow-dashboard']").trigger("click");
    await wrapper.vm.$nextTick();

    // Send open-task event
    await openTaskListener.value?.({ payload: "task-1" });
    await flushPromises();

    expect(wrapper.find(".task-drawer-layer").exists()).toBe(true);
    expect((wrapper.get("[data-inspector-title]").element as HTMLInputElement).value).toBe("整理个人任务");
    wrapper.unmount();
  });
});

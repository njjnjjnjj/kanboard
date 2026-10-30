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
const mcpTaskUpdatedListener = vi.hoisted(() => ({
  value: undefined as undefined | ((event?: { payload?: any }) => void | Promise<void>),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, listener: any) => {
    if (event === "task-created") taskCreatedListener.value = listener;
    if (event === "open-task") openTaskListener.value = listener;
    if (event === "mcp:status-transition") mcpStatusTransitionListener.value = listener;
    if (event === "mcp:task-updated") mcpTaskUpdatedListener.value = listener;
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
  updateColumnWipLimit: vi.fn(),
  sortDoneTasks: (tasks: any[]) =>
    tasks.sort((a, b) => {
      const timeA = a.completedAt ? Date.parse(a.completedAt) : a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const timeB = b.completedAt ? Date.parse(b.completedAt) : b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.position ?? 0) - (a.position ?? 0);
    }),
  compareDoneTasks: (a: any, b: any) => {
    const timeA = a.completedAt ? Date.parse(a.completedAt) : a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const timeB = b.completedAt ? Date.parse(b.completedAt) : b.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (timeB !== timeA) return timeB - timeA;
    return (b.position ?? 0) - (a.position ?? 0);
  },
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
  inAgentSop: false,
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
    localStorage.removeItem("kanboard.collapsed-columns.v1");
    Element.prototype.scrollIntoView = vi.fn();
    document.elementFromPoint = vi.fn(() => null);
    taskCreatedListener.value = undefined;
    openTaskListener.value = undefined;
    mcpStatusTransitionListener.value = undefined;
    mcpTaskUpdatedListener.value = undefined;
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

  it("defaults to collapsed done, remembers manual choices and persists expand-all without task writes", async () => {
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.get("[data-column='done']").classes()).toContain("board-column--collapsed");
    expect(wrapper.findAll(".board-column--collapsed")).toHaveLength(1);
    const titles = ["收集箱", "待办池", "就绪", "进行中", "待验证", "阻塞"];
    for (const title of titles) await wrapper.get(`[aria-label='收起${title}列']`).trigger("click");
    expect(wrapper.findAll(".board-column--collapsed")).toHaveLength(7);
    expect(wrapper.findAllComponents(VueDraggable).filter((list) => !list.props("disabled"))).toHaveLength(0);
    expect(wrapper.get(".board-columns").attributes("style")).toContain(Array(7).fill("minmax(64px, 0fr)").join(" "));
    await wrapper.get("[aria-label='展开进行中列']").trigger("click");
    await wrapper.get("[aria-label='展开待验证列']").trigger("click");
    expect(wrapper.findAllComponents(VueDraggable).filter((list) => !list.props("disabled"))).toHaveLength(2);
    expect(wrapper.findAll(".board-column--collapsed")).toHaveLength(5);
    await wrapper.findAll("button").find((button) => button.text() === "展开全部")!.trigger("click");
    expect(wrapper.findAllComponents(VueDraggable)).toHaveLength(7);
    expect(localStorage.getItem("kanboard.collapsed-columns.v1")).toBe("[]");
    expect(wrapper.get("[data-task-id='task-1']").text()).toContain("整理个人任务");
    expect(repository.updateTask).not.toHaveBeenCalled();
    expect(repository.saveTaskOrder).not.toHaveBeenCalled();
    await wrapper.get("[aria-label='收起收集箱列']").trigger("click");
    wrapper.unmount();
    const reopened = mount(App);
    await flushPromises();
    expect(reopened.findAll(".board-column--collapsed")).toHaveLength(1);
    expect(reopened.get("[data-column='todo']").classes()).toContain("board-column--collapsed");
    expect(reopened.get("[data-column='done']").classes()).not.toContain("board-column--collapsed");
    reopened.unmount();
  });

  it.each(["{invalid", '{"done":true}'])("uses the default layout if the saved preference is invalid: %s", async (saved) => {
    localStorage.setItem("kanboard.collapsed-columns.v1", saved);
    const wrapper = mount(App);
    await flushPromises();
    expect(wrapper.findAll(".board-column--collapsed")).toHaveLength(1);
    expect(wrapper.get("[data-column='done']").classes()).toContain("board-column--collapsed");
    wrapper.unmount();
  });

  it("remembers an explicitly expanded done column instead of reapplying the default", async () => {
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.get("[aria-label='展开已完成列']").trigger("click");
    wrapper.unmount();
    const reopened = mount(App);
    await flushPromises();
    expect(reopened.findAll(".board-column--collapsed")).toHaveLength(0);
    expect(localStorage.getItem("kanboard.collapsed-columns.v1")).toBe("[]");
    reopened.unmount();
  });

  it("does not persist task-navigation expansion when another column is manually changed", async () => {
    localStorage.setItem("kanboard.collapsed-columns.v1", JSON.stringify(["todo", "done"]));
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await openTaskListener.value?.({ payload: "task-1" });
    await flushPromises();
    expect(wrapper.get("[data-column='todo']").classes()).not.toContain("board-column--collapsed");
    await wrapper.get("[aria-label='关闭任务详情']").trigger("click");
    await wrapper.get("[aria-label='收起待办池列']").trigger("click");
    expect(JSON.parse(localStorage.getItem("kanboard.collapsed-columns.v1")!)).toEqual(["todo", "done", "backlog"]);
    wrapper.unmount();
    const reopened = mount(App);
    await flushPromises();
    expect(reopened.get("[data-column='todo']").classes()).toContain("board-column--collapsed");
    reopened.unmount();
  });

  it("responds instantly to keyboard input and resumes pointer motion on pointerdown", async () => {
    const wrapper = mount(App);
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".app-shell").attributes("data-input-mode")).toBe("keyboard");
    expect(wrapper.findAllComponents(VueDraggable)[0]!.props("animation")).toBe(0);
    await wrapper.get(".app-shell").trigger("pointerdown");
    expect(wrapper.get(".app-shell").attributes("data-input-mode")).toBe("pointer");
    expect(wrapper.findAllComponents(VueDraggable)[0]!.props("animation")).toBe(120);
    const search = wrapper.get("[aria-label='搜索任务']");
    search.element.addEventListener("keydown", (event) => event.stopPropagation());
    await search.trigger("keydown", { key: "Tab" });
    expect(wrapper.get(".app-shell").attributes("data-input-mode")).toBe("keyboard");
    await wrapper.get(".app-shell").trigger("pointerdown");
    const portal = document.createElement("button");
    document.body.append(portal);
    portal.addEventListener("keydown", (event) => event.stopPropagation());
    portal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".app-shell").attributes("data-input-mode")).toBe("keyboard");
    portal.remove();
    wrapper.unmount();
  });

  it("responds to live reduced-motion changes and removes its listener on unmount", async () => {
    const query = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", vi.fn(() => query));
    const wrapper = mount(App);
    try {
      await flushPromises();
      expect(wrapper.findAllComponents(VueDraggable)[0]!.props("animation")).toBe(0);
      const onChange = query.addEventListener.mock.calls[0]![1];
      onChange({ matches: false });
      await wrapper.vm.$nextTick();
      expect(wrapper.findAllComponents(VueDraggable)[0]!.props("animation")).toBe(120);
      wrapper.unmount();
      expect(query.removeEventListener).toHaveBeenCalledWith("change", onChange);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows matches in collapsed columns while keeping full WIP under combined filters", async () => {
    const tasks = wall();
    tasks[3]!.tasks = [
      { ...existingTask, id: "high", columnId: "doing", priority: "high", title: "目标任务" },
      { ...existingTask, id: "normal", columnId: "doing", title: "目标普通" },
      { ...existingTask, id: "other", columnId: "doing", priority: "high", title: "其他任务" },
    ];
    repository.loadTaskWall.mockResolvedValue(tasks);
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.get("[aria-label='收起进行中列']").trigger("click");
    await wrapper.get("[aria-label='搜索任务']").setValue("目标");
    await wrapper.findAll(".filter-tabs button").find((button) => button.text() === "高优先级")!.trigger("click");
    const doing = wrapper.get("[data-column='doing']");
    expect(doing.get(".board-column__matches").text()).toBe("匹配 1");
    expect(doing.get(".board-column__header").text()).toContain("3 / 2");
    expect(doing.classes()).toContain("board-column--wip-exceeded");
    await wrapper.get("[aria-label='搜索任务']").setValue("无匹配");
    expect(doing.get(".board-column__matches").text()).toBe("匹配 0");
    await wrapper.get("[aria-label='搜索任务']").setValue("目标");
    await wrapper.get("[aria-label='展开进行中列']").trigger("click");
    expect(doing.findAll(".task-card")).toHaveLength(1);
    expect(doing.get("[data-task-id='high']").text()).toContain("目标任务");
    expect(repository.updateTask).not.toHaveBeenCalled();
    expect(repository.saveTaskOrder).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("shares collapsed columns across swimlanes and project scopes with unique heading IDs", async () => {
    repository.loadProjects.mockResolvedValue([
      { id: "p1", name: "项目一", color: "#285a78", description: "", path: "", targetDate: null, status: "active" },
      { id: "p2", name: "项目二", color: "#285a78", description: "", path: "", targetDate: null, status: "active" },
    ]);
    const tasks = wall();
    tasks[0]!.tasks = [
      { ...existingTask, projectId: "p1" },
      { ...existingTask, id: "task-2", projectId: "p2" },
    ];
    repository.loadTaskWall.mockResolvedValue(tasks);
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.get("[aria-label='收起收集箱列']").trigger("click");
    await wrapper.get("[data-tour='swimlane']").trigger("click");
    expect(wrapper.findAll(".swimlane-row")).toHaveLength(2);
    expect(wrapper.findAll("[data-column='todo'].board-column--collapsed")).toHaveLength(2);
    const headings = wrapper.findAll(".board-column h2").map((heading) => heading.attributes("id"));
    expect(new Set(headings).size).toBe(14);
    await wrapper.findAll("[aria-label='展开收集箱列']")[0]!.trigger("click");
    expect(wrapper.findAll("[data-column='todo'].board-column--collapsed")).toHaveLength(0);
    await wrapper.findAll("[aria-label='收起收集箱列']")[1]!.trigger("click");
    await wrapper.get(".workspace-nav__section .workspace-nav__row").trigger("click");
    expect(wrapper.get("[data-column='todo']").classes()).toContain("board-column--collapsed");
    await wrapper.get("[aria-label='展开收集箱列']").trigger("click");
    expect(wrapper.findAll(".task-card")).toHaveLength(1);
    expect(repository.saveTaskOrder).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("unfolds the target column and clears conflicting search when a notification opens a task", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.get("[aria-label='收起收集箱列']").trigger("click");
    await wrapper.get("[aria-label='搜索任务']").setValue("无匹配");
    await openTaskListener.value?.({ payload: "task-1" });
    await flushPromises();
    expect(wrapper.get("[data-column='todo']").classes()).not.toContain("board-column--collapsed");
    expect(wrapper.find("[data-task-id='task-1']").exists()).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    expect(document.activeElement).toBe(wrapper.get("[data-inspector-title]").element);
    wrapper.unmount();
  });

  it("locks collapse controls during drag and keeps hidden tasks when saving a move", async () => {
    const tasks = wall();
    tasks[1]!.tasks = [{ ...existingTask, id: "hidden", columnId: "backlog" }];
    repository.loadTaskWall.mockResolvedValue(tasks);
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.get("[aria-label='收起待办池列']").trigger("click");
    const source = wrapper.getComponent("[data-column='todo']").findComponent(VueDraggable);
    const target = wrapper.getComponent("[data-column='doing']").findComponent(VueDraggable);
    const card = wrapper.get("[data-task-id='task-1']").element;
    source.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    await wrapper.vm.$nextTick();
    expect(wrapper.get("[aria-label='展开待办池列']").attributes("disabled")).toBeDefined();
    expect(wrapper.get("[aria-label='收起进行中列']").attributes("disabled")).toBeDefined();
    await wrapper.get("[aria-label='收起进行中列']").trigger("click");
    expect(wrapper.get("[data-column='doing']").classes()).not.toContain("board-column--collapsed");
    source.vm.$emit("update:modelValue", []);
    target.vm.$emit("update:modelValue", [{ ...existingTask }]);
    await wrapper.vm.$nextTick();
    await wrapper.get("[data-column='doing'] .board-column__tasks").trigger("drop");
    source.vm.$emit("end", { item: card, originalEvent: { clientX: 600, clientY: 240 } });
    await flushPromises();
    const saved = repository.saveTaskOrder.mock.calls[0]![0] as TaskColumn[];
    expect(saved[1]!.tasks.map((task) => task.id)).toEqual(["hidden"]);
    expect(saved[3]!.tasks.map((task) => task.id)).toEqual(["task-1"]);
    await wrapper.get("[aria-label='展开待办池列']").trigger("click");
    expect(wrapper.find("[data-task-id='hidden']").exists()).toBe(true);
    wrapper.unmount();
  });

  it.each(["dragenter", "dragover", "mousemove", "touchmove"])("automatically opens a collapsed target on %s and preserves its tasks on drop", async (eventType) => {
    const tasks = wall();
    const hidden = { ...existingTask, id: "hidden", columnId: "doing" };
    tasks[3]!.tasks = [hidden];
    const unrelated = { ...existingTask, id: "unrelated", columnId: "backlog" };
    tasks[1]!.tasks = [unrelated];
    repository.loadTaskWall.mockResolvedValue(tasks);
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.get("[aria-label='收起进行中列']").trigger("click");
    const source = wrapper.getComponent("[data-column='todo']").findComponent(VueDraggable);
    const card = wrapper.get("[data-task-id='task-1']").element;
    const collapsed = wrapper.get("[data-column='doing']");
    vi.mocked(document.elementFromPoint).mockReturnValue(collapsed.get(".board-column__toggle").element);
    // Ordinary pointer movement and foreign dragovers must not expand the column.
    window.dispatchEvent(new MouseEvent(eventType, { clientX: 700, clientY: 250 }));
    await wrapper.vm.$nextTick();
    expect(collapsed.classes()).toContain("board-column--collapsed");
    source.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    await wrapper.vm.$nextTick();
    const move = new MouseEvent(eventType, { clientX: 700, clientY: 250, bubbles: true, cancelable: true });
    if (eventType === "touchmove") Object.defineProperty(move, "touches", { value: [{ clientX: 700, clientY: 250 }] });
    window.dispatchEvent(move);
    await wrapper.vm.$nextTick();
    expect(collapsed.classes()).not.toContain("board-column--collapsed");
    expect(collapsed.find("[data-task-id='hidden']").exists()).toBe(true);
    expect(repository.saveTaskOrder).not.toHaveBeenCalled();
    expect(repository.updateTask).not.toHaveBeenCalled();
    const target = wrapper.getComponent("[data-column='doing']").findComponent(VueDraggable);
    source.vm.$emit("update:modelValue", []);
    target.vm.$emit("update:modelValue", [hidden, { ...existingTask }]);
    await wrapper.vm.$nextTick();
    await wrapper.get("[data-column='doing'] .board-column__tasks").trigger("drop");
    source.vm.$emit("end", { item: card, originalEvent: { clientX: 700, clientY: 250 } });
    await flushPromises();
    const saved = repository.saveTaskOrder.mock.calls[0]![0] as TaskColumn[];
    expect(saved[0]!.tasks).toHaveLength(0);
    expect(saved[3]!.tasks.map((task) => task.id)).toEqual(["hidden", "task-1"]);
    expect(saved[1]!.tasks.map((task) => task.id)).toEqual(["unrelated"]);
    expect(collapsed.classes()).toContain("board-column--collapsed");
    expect(JSON.parse(localStorage.getItem("kanboard.collapsed-columns.v1")!)).toEqual(["done", "doing"]);
    wrapper.unmount();
  });

  it("lands a quick release in the auto-expanded column instead of the last Sortable list", async () => {
    const tasks = wall();
    tasks[3]!.tasks = [{ ...existingTask, id: "hidden", columnId: "doing" }];
    repository.loadTaskWall.mockResolvedValue(tasks);
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.get("[aria-label='收起进行中列']").trigger("click");
    const source = wrapper.getComponent("[data-column='todo']").findComponent(VueDraggable);
    const intermediate = wrapper.getComponent("[data-column='ready']").findComponent(VueDraggable);
    const card = wrapper.get("[data-task-id='task-1']").element;
    source.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    source.vm.$emit("update:modelValue", []);
    intermediate.vm.$emit("update:modelValue", [{ ...existingTask }]);
    vi.mocked(document.elementFromPoint).mockReturnValue(wrapper.get("[data-column='doing']").element);
    window.dispatchEvent(new MouseEvent("dragenter", { clientX: 700, clientY: 250 }));
    await wrapper.vm.$nextTick();
    // No Sortable update:modelValue or dragover has reached the new target yet.
    await wrapper.get("[data-column='doing'] .board-column__tasks").trigger("drop");
    source.vm.$emit("end", { item: card, originalEvent: { clientX: 700, clientY: 250 } });
    await flushPromises();
    expect(repository.saveTaskOrder).toHaveBeenCalledTimes(1);
    const saved = repository.saveTaskOrder.mock.calls[0]![0] as TaskColumn[];
    expect(saved[2]!.tasks).toHaveLength(0);
    expect(saved[3]!.tasks.map((task) => task.id)).toEqual(["hidden", "task-1"]);
    wrapper.unmount();
  });

  it.each(["p1", "p2"])("respects swimlane drag groups when released over an auto-opened column in %s", async (targetProject) => {
    repository.loadProjects.mockResolvedValue([
      { id: "p1", name: "项目一", color: "#285a78", description: "", path: "", targetDate: null, status: "active" },
      { id: "p2", name: "项目二", color: "#285a78", description: "", path: "", targetDate: null, status: "active" },
    ]);
    const tasks = wall();
    tasks[0]!.tasks = [{ ...existingTask, projectId: "p1" }];
    tasks[3]!.tasks = [{ ...existingTask, id: "other-project", projectId: "p2", columnId: "doing" }];
    repository.loadTaskWall.mockResolvedValue(tasks);
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.get("[aria-label='收起进行中列']").trigger("click");
    await wrapper.get("[data-tour='swimlane']").trigger("click");
    const source = wrapper.getComponent(".swimlane-row[data-project-id='p1'] [data-column='todo']").findComponent(VueDraggable);
    const card = wrapper.get("[data-task-id='task-1']").element;
    const target = wrapper.get(`.swimlane-row[data-project-id='${targetProject}'] [data-column='doing']`);
    source.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    vi.mocked(document.elementFromPoint).mockReturnValue(target.element);
    window.dispatchEvent(new MouseEvent("dragenter", { clientX: 700, clientY: 250 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll("[data-column='doing'].board-column--collapsed")).toHaveLength(0);
    await target.get(".board-column__tasks").trigger("drop");
    source.vm.$emit("end", { item: card, originalEvent: { clientX: 700, clientY: 250 } });
    await flushPromises();
    const saved = repository.saveTaskOrder.mock.calls[0]![0] as TaskColumn[];
    expect(saved[0]!.tasks.map((task) => task.id)).toEqual(targetProject === "p1" ? [] : ["task-1"]);
    expect(saved[3]!.tasks.map((task) => task.id)).toEqual(targetProject === "p1" ? ["other-project", "task-1"] : ["other-project"]);
    expect(saved[3]!.tasks[0]!.projectId).toBe("p2");
    wrapper.unmount();
  });

  it("restores automatically opened columns when a drag is cancelled without saving preferences", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.get("[aria-label='收起进行中列']").trigger("click");
    const preferenceBeforeDrag = localStorage.getItem("kanboard.collapsed-columns.v1");
    const source = wrapper.getComponent("[data-column='todo']").findComponent(VueDraggable);
    const card = wrapper.get("[data-task-id='task-1']").element;
    const target = wrapper.get("[data-column='doing']");
    vi.mocked(document.elementFromPoint).mockReturnValue(target.element);
    source.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    window.dispatchEvent(new MouseEvent("dragover", { clientX: 700, clientY: 250 }));
    await wrapper.vm.$nextTick();
    expect(target.classes()).not.toContain("board-column--collapsed");
    source.vm.$emit("end", { item: card, originalEvent: { clientX: -100, clientY: -100 } });
    await flushPromises();
    expect(target.classes()).toContain("board-column--collapsed");
    expect(wrapper.find("[data-column='todo'] [data-task-id='task-1']").exists()).toBe(true);
    expect(localStorage.getItem("kanboard.collapsed-columns.v1")).toBe(preferenceBeforeDrag);
    expect(repository.saveTaskOrder).not.toHaveBeenCalled();
    expect(repository.updateTask).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([false, true])("restores the default done fold after dropping into it, including save failure: %s", async (failSave) => {
    repository.loadTaskWall.mockResolvedValueOnce(wall()).mockResolvedValue(wall());
    if (failSave) repository.saveTaskOrder.mockRejectedValueOnce(new Error("保存失败"));
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const source = wrapper.getComponent("[data-column='todo']").findComponent(VueDraggable);
    const card = wrapper.get("[data-task-id='task-1']").element;
    vi.mocked(document.elementFromPoint).mockReturnValue(wrapper.get("[data-column='done']").element);
    source.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    window.dispatchEvent(new MouseEvent("dragenter", { clientX: 900, clientY: 250 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get("[data-column='done']").classes()).not.toContain("board-column--collapsed");
    await wrapper.get("[data-column='done'] .board-column__tasks").trigger("drop");
    source.vm.$emit("end", { item: card, originalEvent: { clientX: 900, clientY: 250 } });
    await flushPromises();
    expect(wrapper.get("[data-column='done']").classes()).toContain("board-column--collapsed");
    expect(wrapper.get("[data-column='backlog']").classes()).not.toContain("board-column--collapsed");
    expect(localStorage.getItem("kanboard.collapsed-columns.v1")).toBeNull();
    await wrapper.get("[aria-label='展开已完成列']").trigger("click");
    expect(wrapper.find("[data-column='done'] [data-task-id='task-1']").exists()).toBe(!failSave);
    expect(wrapper.find("[data-column='todo'] [data-task-id='task-1']").exists()).toBe(failSave);
    wrapper.unmount();
  });

  it("does not open a collapsed column underneath the drag trash", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    stubTrashZone(wrapper);
    await wrapper.get("[aria-label='收起进行中列']").trigger("click");
    vi.mocked(document.elementFromPoint).mockReturnValue(wrapper.get("[data-column='doing']").element);
    const source = wrapper.getComponent("[data-column='todo']").findComponent(VueDraggable);
    const card = wrapper.get("[data-task-id='task-1']").element;
    source.vm.$emit("start", { item: card, oldDraggableIndex: 0 });
    window.dispatchEvent(new MouseEvent("dragover", { clientX: 600, clientY: 428 }));
    await wrapper.vm.$nextTick();
    expect(wrapper.get("[data-column='doing']").classes()).toContain("board-column--collapsed");
    expect(document.elementFromPoint).not.toHaveBeenCalled();
    source.vm.$emit("end", { item: card, originalEvent: { clientX: 600, clientY: 428 } });
    await flushPromises();
    expect(repository.trashTask).toHaveBeenCalledWith("task-1");
    expect(repository.saveTaskOrder).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("skips collapsed columns when navigating tasks with the keyboard", async () => {
    const tasks = wall();
    tasks[3]!.tasks = [{ ...existingTask, id: "active-task", columnId: "doing", title: "进行中的任务" }];
    repository.loadTaskWall.mockResolvedValue(tasks);
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.get("[aria-label='收起收集箱列']").trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    await flushPromises();
    expect((wrapper.get("[data-inspector-title]").element as HTMLInputElement).value).toBe("进行中的任务");
    expect(wrapper.get("[data-column='todo']").classes()).toContain("board-column--collapsed");
    wrapper.unmount();
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

    await wrapper.get("[aria-label='收起收集箱列']").trigger("click");
    await wrapper.get("[aria-label='新任务标题']").setValue("准备每周回顾");
    await wrapper.get(".quick-add").trigger("submit");
    await flushPromises();

    expect(repository.createTask).toHaveBeenCalledWith("准备每周回顾", "todo", null);
    expect(wrapper.text()).toContain("准备每周回顾");
    expect(wrapper.get("[data-column='todo']").classes()).not.toContain("board-column--collapsed");
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

  it("closes statistics with Escape while preserving the inspector behind it", async () => {
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.get("[data-task-id='task-1']").trigger("click");
    await wrapper.get("[data-tour='flow-dashboard']").trigger("click");
    expect(wrapper.find(".flow-dashboard").exists()).toBe(true);
    await wrapper.get(".flow-dashboard").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find(".flow-dashboard").exists()).toBe(false);
    expect(wrapper.find(".task-inspector").exists()).toBe(true);
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

  it("shows column header count scoped to the selected project instead of global count", async () => {
    repository.loadProjects.mockResolvedValue([{
      id: "project-1", name: "看板桌面版", color: "#285a78", description: "", targetDate: null,
      status: "active", createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
    }]);
    const projectWall = wall();
    projectWall[0]!.tasks = [
      { ...existingTask, id: "task-1", projectId: "project-1", project: { id: "project-1", name: "看板桌面版", color: "#285a78", path: "" } },
      { ...existingTask, id: "task-2", projectId: null, project: null },
    ];
    projectWall.find((col) => col.id === "doing")!.tasks = [
      { ...existingTask, id: "task-3", columnId: "doing", projectId: null, project: null },
    ];
    repository.loadTaskWall.mockResolvedValue(projectWall);

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.get("[data-column='todo'] .board-column__header").text()).toContain("2");
    expect(wrapper.get("[data-column='doing'] .board-column__header").text()).toContain("1 / 2");

    const projectButton = wrapper.findAll("button").find((button) => button.text().includes("看板桌面版"));
    await projectButton?.trigger("click");
    await flushPromises();

    expect(wrapper.get("[data-column='todo'] .board-column__header").text()).toContain("1");
    expect(wrapper.get("[data-column='doing'] .board-column__header").text()).toContain("0 / 2");
    expect(wrapper.findAll("[data-column='todo'] .task-card")).toHaveLength(1);
    expect(wrapper.findAll("[data-column='doing'] .task-card")).toHaveLength(0);

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
    expect(wrapper.get("[data-column='done']").classes()).toContain("board-column--collapsed");
    await wrapper.get("[aria-label='展开已完成列']").trigger("click");
    expect(wrapper.find("[aria-label='恢复任务：整理个人任务']").exists()).toBe(true);
  });

  it("moves active work to verification instead of marking it done", async () => {
    const activeWall = wall();
    const task = activeWall[0]!.tasks.shift()!;
    task.columnId = "doing";
    task.inAgentSop = true;
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
    expect(wrapper.get("[data-task-id='task-1']").classes()).not.toContain("task-card--agent-active");
    wrapper.unmount();
  });

  it("preserves the MCP marker when saving task details", async () => {
    const activeWall = wall();
    activeWall[0]!.tasks[0]!.inAgentSop = true;
    repository.loadTaskWall.mockResolvedValue(activeWall);
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.get("[data-task-id='task-1']").trigger("click");
    await wrapper.get("[data-inspector-title]").setValue("更新标题");
    await wrapper.get(".task-inspector__form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[data-task-id='task-1']").classes()).toContain("task-card--agent-active");
    expect(repository.updateTask.mock.calls[0]?.[1]).not.toHaveProperty("inAgentSop");
    wrapper.unmount();
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

  it("preserves uncommitted description draft during mcp background refresh and does not flicker workspace", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    // Select task-1 and start editing description
    await wrapper.get("[data-task-id='task-1']").trigger("click");
    await flushPromises();

    const descTextarea = wrapper.get("[data-inspector-description]");
    await descTextarea.setValue("正在编辑的重要说明，不能被后台刷新覆盖");
    expect((descTextarea.element as HTMLTextAreaElement).value).toBe("正在编辑的重要说明，不能被后台刷新覆盖");

    // Simulate an MCP status transition or task update arriving in background
    const updatedWall = wall();
    const taskInDb = updatedWall[0].tasks.find((t) => t.id === "task-1")!;
    taskInDb.columnId = "verify";
    repository.loadTaskWall.mockResolvedValue(updatedWall);

    await mcpStatusTransitionListener.value?.({
      payload: {
        taskId: "task-1",
        title: "整理个人任务",
        fromStatus: "todo",
        toStatus: "verify",
      },
    });
    await flushPromises();

    // Workspace main is STILL mounted (no flicker / unmounting)
    expect(wrapper.find(".wall-workspace").exists()).toBe(true);
    expect(wrapper.find(".system-state").exists()).toBe(false);

    // Inspector remains open and uncommitted draft description is preserved
    expect(wrapper.find(".task-drawer-layer").exists()).toBe(true);
    expect((descTextarea.element as HTMLTextAreaElement).value).toBe("正在编辑的重要说明，不能被后台刷新覆盖");
    expect(wrapper.find(".task-inspector__header span").text()).toBe("待验证");
    wrapper.unmount();
  });

  it("reconciles board columns in-place on refresh without unmounting wall-workspace", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    const initialWorkspace = wrapper.find(".wall-workspace").element;

    // Simulate background mcp:task-updated event
    const updatedWall = wall();
    updatedWall[0].tasks[0].title = "整理个人任务 (已更新)";
    repository.loadTaskWall.mockResolvedValue(updatedWall);

    await mcpTaskUpdatedListener.value?.();
    await flushPromises();

    // The main wall-workspace DOM element is preserved (not remounted or flickered)
    expect(wrapper.find(".wall-workspace").exists()).toBe(true);
    expect(wrapper.find(".wall-workspace").element).toBe(initialWorkspace);
    expect(wrapper.text()).toContain("整理个人任务 (已更新)");
    wrapper.unmount();
  });

  it("places newly completed task at the top of the done column", async () => {
    const initialWall = wall();
    // Add an older completed task to done column
    initialWall[6].tasks = [
      {
        ...existingTask,
        id: "task-old-done",
        columnId: "done",
        title: "早先完成的任务",
        completedAt: "2026-10-25T10:00:00.000Z",
      },
    ];
    repository.loadTaskWall.mockResolvedValue(initialWall);

    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    // Select task-1 and mark it as done
    await wrapper.get("[data-task-id='task-1']").trigger("click");
    await flushPromises();

    // Click status select to set to done
    const statusSelect = wrapper.findAllComponents({ name: "TaskSelect" })[1];
    await statusSelect.vm.$emit("update:modelValue", "done");
    await wrapper.get(".task-inspector__form").trigger("submit");
    await flushPromises();

    // The done column cards should show task-1 first (at top) and task-old-done second
    await wrapper.get("[aria-label='展开已完成列']").trigger("click");
    const doneColumn = wrapper.find(".board-column--done");
    const cards = doneColumn.findAll(".task-card");
    expect(cards[0].text()).toContain("整理个人任务");
    expect(cards[1].text()).toContain("早先完成的任务");
    wrapper.unmount();
  });

  it("updates column WIP limit via column header inline edit and persists it", async () => {
    repository.updateColumnWipLimit.mockResolvedValue(undefined);
    const wrapper = mount(App);
    await flushPromises();

    const doingCol = wrapper.findComponent({ name: "BoardColumn" });
    const allBoardCols = wrapper.findAllComponents({ name: "BoardColumn" });
    const doingWrapper = allBoardCols.find((col) => col.props("column").id === "doing");
    expect(doingWrapper).toBeDefined();

    await doingWrapper!.vm.$emit("updateWipLimit", "doing", 5);
    await flushPromises();

    expect(repository.updateColumnWipLimit).toHaveBeenCalledWith("doing", 5);
    expect(doingWrapper!.props("column").wipLimit).toBe(5);
    expect(wrapper.text()).toContain("进行中上限已更新为 5 项");
    wrapper.unmount();
  });

  it("syncs column WIP limits updated from SettingsPanel", async () => {
    const wrapper = mount(App);
    await flushPromises();

    const settingsPanel = wrapper.findComponent({ name: "SettingsPanel" });
    expect(settingsPanel.exists()).toBe(true);

    await settingsPanel.vm.$emit("updateWipLimits", { doing: 6, verify: 4 });
    await flushPromises();

    const allBoardCols = wrapper.findAllComponents({ name: "BoardColumn" });
    const doingCol = allBoardCols.find((col) => col.props("column").id === "doing");
    const verifyCol = allBoardCols.find((col) => col.props("column").id === "verify");

    expect(doingCol?.props("column").wipLimit).toBe(6);
    expect(verifyCol?.props("column").wipLimit).toBe(4);
    wrapper.unmount();
  });
});

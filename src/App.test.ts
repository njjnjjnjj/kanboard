import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import type { Task, TaskColumn } from "./types";

const repository = vi.hoisted(() => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  loadTaskWall: vi.fn(),
  saveTaskOrder: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("./data/taskRepository", () => repository);

const existingTask: Task = {
  id: "task-1",
  columnId: "todo",
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
    repository.saveTaskOrder.mockResolvedValue(undefined);
    repository.updateTask.mockResolvedValue(undefined);
    repository.deleteTask.mockResolvedValue(undefined);
  });

  it("adds a task from the header and selects it", async () => {
    repository.createTask.mockResolvedValue({
      ...existingTask,
      id: "task-2",
      title: "准备每周回顾",
      position: 2000,
    });
    const wrapper = mount(App);
    await flushPromises();

    await wrapper.get("[aria-label='新任务标题']").setValue("准备每周回顾");
    await wrapper.get(".quick-add").trigger("submit");
    await flushPromises();

    expect(repository.createTask).toHaveBeenCalledWith("准备每周回顾", "todo");
    expect(wrapper.text()).toContain("准备每周回顾");
    expect(wrapper.text()).toContain("任务详情");
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
});

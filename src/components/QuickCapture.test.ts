import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuickCapture from "./QuickCapture.vue";

const createTask = vi.hoisted(() => vi.fn());
const close = vi.hoisted(() => vi.fn());
const emit = vi.hoisted(() => vi.fn());

vi.mock("../data/taskRepository", () => ({ createTask }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ close }) }));
vi.mock("@tauri-apps/api/event", () => ({ emit }));

describe("quick capture window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTask.mockResolvedValue({ id: "new-task" });
    emit.mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
  });

  it("adds a task to inbox and closes after saving", async () => {
    const wrapper = mount(QuickCapture, { attachTo: document.body });
    await flushPromises();

    await wrapper.get("#quick-capture-title").setValue("记录全局任务");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(createTask).toHaveBeenCalledWith("记录全局任务", "todo", null);
    expect(emit).toHaveBeenCalledWith("task-created", null);
    expect(close).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("still closes without showing a save error when refresh notification fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    emit.mockRejectedValueOnce(new Error("listener unavailable"));
    const wrapper = mount(QuickCapture);

    await wrapper.get("#quick-capture-title").setValue("已实际保存");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(createTask).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(wrapper.find("[role='alert']").exists()).toBe(false);
    consoleError.mockRestore();
  });

  it("saves, opens the main board and closes quick capture with Ctrl + Enter", async () => {
    const wrapper = mount(QuickCapture);
    await wrapper.get("#quick-capture-title").setValue("保存后打开看板");

    await wrapper.get(".quick-capture-panel").trigger("keydown", { key: "Enter", ctrlKey: true });
    await flushPromises();

    expect(createTask).toHaveBeenCalledWith("保存后打开看板", "todo", null);
    expect(emit).toHaveBeenNthCalledWith(1, "task-created", "new-task");
    expect(emit).toHaveBeenNthCalledWith(2, "open-main-window");
    expect(close).toHaveBeenCalledOnce();
  });
});

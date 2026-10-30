import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TaskDescriptionHistory from "./TaskDescriptionHistory.vue";
import type { TaskDescriptionHistory as History } from "../types";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const history: History = {
  versions: [
    { version: 3, previousDescription: "标题\n人工修改后的要求", description: "标题\n新要求", summary: "调整验收范围", source: "agent", createdAt: "2026-10-27T00:00:00Z" },
    { version: 2, previousDescription: "标题", description: "标题\n旧要求", summary: "补充需求", source: "agent", createdAt: "2026-10-26T00:00:00Z" },
  ], notes: [],
};
const options = { props: { taskId: "task", updatedAt: "now" }, global: { stubs: { Teleport: true, MarkdownEditor: { props: ["modelValue", "readonly"], template: '<div class="history-preview">{{ modelValue }}</div>' } } } };

describe("Agent revision history", () => {
  beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue(history); });
  it("shows a commit list and compares the selected change with its actual pre-edit body", async () => {
    const wrapper = mount(TaskDescriptionHistory, options);
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith("list_task_description_versions", { taskId: "task" });
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.get(".description-diff-line--removed").text()).toContain("人工修改后的要求");
    expect(wrapper.get(".description-diff-line--added").text()).toContain("新要求");
    await wrapper.findAll(".revision-item")[1]!.trigger("click");
    expect(wrapper.get(".revision-detail h3").text()).toBe("补充需求");
    expect(wrapper.get(".description-diff-line--added").text()).toContain("旧要求");
    expect(wrapper.find(".description-diff-line--removed").exists()).toBe(false);
    await wrapper.findAll("button").find((button) => button.text() === "修改后正文")!.trigger("click");
    expect(wrapper.get(".history-preview").text()).toContain("旧要求");
    expect(invoke).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it("compares a single Agent revision with its saved baseline", async () => {
    invoke.mockResolvedValueOnce({ versions: [history.versions[0]], notes: [] });
    const wrapper = mount(TaskDescriptionHistory, options);
    await flushPromises();
    expect(wrapper.findAll(".revision-item")).toHaveLength(1);
    expect(wrapper.get(".description-diff-line--removed").text()).toContain("人工修改后的要求");
    expect(wrapper.get(".description-diff-line--added").text()).toContain("新要求");
    wrapper.unmount();
  });
  it("hides old manual records and displays a clear empty state", async () => {
    invoke.mockResolvedValueOnce({ versions: [{ ...history.versions[0], source: "user" }], notes: [] });
    const wrapper = mount(TaskDescriptionHistory, options);
    await flushPromises();
    expect(wrapper.text()).toContain("还没有 Agent 修改记录");
    expect(wrapper.find(".description-history__diff").exists()).toBe(false);
    expect(wrapper.find(".revision-list").exists()).toBe(false);
    wrapper.unmount();
  });
  it("ignores a late response after switching tasks and closes on Escape", async () => {
    let resolve!: (history: History) => void;
    invoke.mockReturnValueOnce(new Promise<History>((done) => { resolve = done; }));
    const wrapper = mount(TaskDescriptionHistory, options);
    await wrapper.setProps({ taskId: "next-task" });
    await flushPromises();
    resolve({ versions: [], notes: [] });
    await flushPromises();
    expect(wrapper.text()).toContain("调整验收范围");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });
  it("supports keyboard selection and retries loading failures", async () => {
    invoke.mockRejectedValueOnce("不可用");
    const wrapper = mount(TaskDescriptionHistory, options);
    await flushPromises();
    expect(wrapper.get("[role='alert']").text()).toContain("暂时无法读取");
    await wrapper.get(".secondary-button").trigger("click");
    await flushPromises();
    await wrapper.findAll(".revision-item")[0]!.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.get(".revision-detail h3").text()).toBe("补充需求");
    wrapper.unmount();
  });
});

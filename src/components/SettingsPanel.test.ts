import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPanel from "./SettingsPanel.vue";
import { TASK_DESCRIPTION_POLICY } from "../data/sopRepository";

const invoke = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
const enable = vi.hoisted(() => vi.fn());
const disable = vi.hoisted(() => vi.fn());
const isEnabled = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const updateColumnWipLimitsMock = vi.hoisted(() => vi.fn());
const loadColumnsMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-autostart", () => ({ disable, enable, isEnabled }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: confirmMock,
  open: vi.fn(),
  save,
}));
vi.mock("../data/taskRepository", () => ({
  updateColumnWipLimits: updateColumnWipLimitsMock,
  loadColumns: loadColumnsMock,
}));

describe("SettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockImplementation((command: string) => {
      if (command === "get_storage_info") {
        return Promise.resolve({ path: "C:\\data\\kanboard.db", directory: "C:\\data", version: "0.1.0" });
      }
      if (command === "get_mcp_status") return Promise.resolve({ enabled: false, running: false, url: "http://127.0.0.1:47831/mcp", lastError: null });
      if (command === "get_custom_sop") {
        return Promise.resolve({
          id: "current",
          summary: "默认 SOP 概述文本",
          content: "### 默认 SOP 规范完整内容",
          isCustom: false,
          updatedAt: "2026-10-23T00:00:00Z",
        });
      }
      return Promise.resolve(undefined);
    });
    isEnabled.mockResolvedValue(false);
    updateColumnWipLimitsMock.mockResolvedValue(undefined);
    loadColumnsMock.mockResolvedValue([
      { id: "doing", title: "进行中", position: 4000, wipLimit: 2 },
      { id: "verify", title: "待验证", position: 5000, wipLimit: 2 },
    ]);
  });

  it("shows autostart off by default and enables it on request", async () => {
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    const toggle = wrapper.get('[role="switch"]');
    expect(toggle.attributes("aria-checked")).toBe("false");

    isEnabled.mockResolvedValue(true);
    await toggle.trigger("click");
    await flushPromises();

    expect(enable).toHaveBeenCalledOnce();
    expect(disable).not.toHaveBeenCalled();
    expect(toggle.attributes("aria-checked")).toBe("true");
  });

  it("disables an existing autostart registration", async () => {
    isEnabled.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    const toggle = wrapper.get('[role="switch"]');
    expect(toggle.attributes("aria-checked")).toBe("true");

    await toggle.trigger("click");
    await flushPromises();

    expect(disable).toHaveBeenCalledOnce();
    expect(enable).not.toHaveBeenCalled();
    expect(toggle.attributes("aria-checked")).toBe("false");
  });

  it("shows the current version and database path", async () => {
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    expect(wrapper.text()).toContain("0.1.0");
    expect(wrapper.text()).toContain("C:\\data\\kanboard.db");
    expect(invoke).toHaveBeenCalledWith("get_storage_info");
  });

  it("exports a backup and notifies globally", async () => {
    save.mockResolvedValue("C:\\backup\\tasks.db");
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "导出数据")!.trigger("click");
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("export_data", { path: "C:\\backup\\tasks.db" });
    expect(wrapper.emitted("announce")).toBeTruthy();
    expect(wrapper.emitted("announce")?.[0]?.[0]).toContain("已导出到 C:\\backup\\tasks.db");
    // Ensure no message inside panel body
    expect(wrapper.find(".settings-panel__message").exists()).toBe(false);
  });

  it("enables the local MCP service from AI integration settings", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "get_storage_info") return Promise.resolve({ path: "C:\\data\\kanboard.db", directory: "C:\\data", version: "0.1.0" });
      if (command === "get_mcp_status") return Promise.resolve({ enabled: false, running: false, url: "http://127.0.0.1:47831/mcp", lastError: null });
      if (command === "set_mcp_enabled") return Promise.resolve({ enabled: true, running: true, url: "http://127.0.0.1:47831/mcp", lastError: null });
      if (command === "get_custom_sop") {
        return Promise.resolve({
          id: "current",
          summary: "默认 SOP 概述文本",
          content: "### 默认 SOP 规范完整内容",
          isCustom: false,
          updatedAt: "2026-10-23T00:00:00Z",
        });
      }
      return Promise.resolve(undefined);
    });
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    const toggle = wrapper.get('[aria-label="开启 MCP 服务"]');
    await toggle.trigger("click");
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("set_mcp_enabled", { enabled: true });
    expect(wrapper.text()).toContain("MCP 服务运行中");
  });

  it("renders SOP section with default version and opens readonly viewer with full content", async () => {
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    expect(wrapper.text()).toContain("任务执行 SOP（标准作业流程）");
    expect(wrapper.text()).toContain("系统默认");
    expect(wrapper.text()).toContain("默认 SOP 概述文本");

    const viewButton = wrapper.findAll("button").find((btn) => btn.text() === "查看完整 SOP");
    expect(viewButton).toBeDefined();
    await viewButton!.trigger("click");
    await flushPromises();

    // Check modal
    const modal = document.querySelector(".markdown-fullscreen-modal");
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain("标准作业流程 (SOP) · 全屏只读");
    expect(modal?.textContent).toContain("只读模式");
    expect(modal?.textContent).toContain(`${17 + "\n\n### 任务说明修订规范\n\n".length + TASK_DESCRIPTION_POLICY.length} 字符`);
    expect(wrapper.text()).toContain("update_task_description");

    // Close viewer via escape or close button
    const escBtn = modal?.querySelector(".info-esc-btn") as HTMLButtonElement | null;
    expect(escBtn).not.toBeNull();
    escBtn?.click();
    await flushPromises();
    expect(document.querySelector(".markdown-fullscreen-modal")).toBeNull();
  });

  it("handles custom SOP reset to default and notifies globally", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "get_storage_info") return Promise.resolve({ path: "C:\\data\\kanboard.db", directory: "C:\\data", version: "0.1.0" });
      if (command === "get_mcp_status") return Promise.resolve({ enabled: true, running: true, url: "http://127.0.0.1:47831/mcp", lastError: null });
      if (command === "get_custom_sop") {
        return Promise.resolve({
          id: "current",
          summary: "敏捷 TDD 自定义概述",
          content: "### 团队定制 SOP 文档",
          isCustom: true,
          updatedAt: "2026-10-23T00:00:00Z",
        });
      }
      if (command === "reset_custom_sop") {
        return Promise.resolve({
          id: "current",
          summary: "默认 SOP 概述文本",
          content: "### 默认 SOP 规范完整内容",
          isCustom: false,
          updatedAt: "2026-10-23T00:00:00Z",
        });
      }
      return Promise.resolve(undefined);
    });
    confirmMock.mockResolvedValue(true);

    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    expect(wrapper.text()).toContain("自定义版本");
    expect(wrapper.text()).toContain("敏捷 TDD 自定义概述");

    const resetBtn = wrapper.findAll("button").find((btn) => btn.text() === "重置为默认");
    expect(resetBtn).toBeDefined();
    await resetBtn!.trigger("click");
    await flushPromises();

    expect(confirmMock).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("reset_custom_sop");
    expect(wrapper.emitted("announce")).toBeTruthy();
    expect(wrapper.emitted("announce")?.[0]?.[0]).toContain("SOP 已成功重置为系统默认规范。");
    // Ensure no message inside panel body
    expect(wrapper.find(".settings-panel__message").exists()).toBe(false);
  });

  it("loads and displays current WIP limits in the settings panel", async () => {
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true,
        columns: [
          { id: "doing", title: "进行中", position: 4000, wipLimit: 5, tasks: [] },
          { id: "verify", title: "待验证", position: 5000, wipLimit: 3, tasks: [] },
        ],
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("在制品上限 (WIP Limit)");
    const doingInput = wrapper.get<HTMLInputElement>("#wip-limit-doing");
    const verifyInput = wrapper.get<HTMLInputElement>("#wip-limit-verify");

    expect(doingInput.element.value).toBe("5");
    expect(verifyInput.element.value).toBe("3");
  });

  it("updates and saves WIP limits successfully", async () => {
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true,
        columns: [
          { id: "doing", title: "进行中", position: 4000, wipLimit: 2, tasks: [] },
          { id: "verify", title: "待验证", position: 5000, wipLimit: 2, tasks: [] },
        ],
      },
    });
    await flushPromises();

    const doingInput = wrapper.get<HTMLInputElement>("#wip-limit-doing");
    const verifyInput = wrapper.get<HTMLInputElement>("#wip-limit-verify");

    await doingInput.setValue("8");
    await verifyInput.setValue("4");

    const saveBtn = wrapper.findAll("button").find((btn) => btn.text().includes("保存上限"));
    expect(saveBtn).toBeDefined();
    await saveBtn!.trigger("click");
    await flushPromises();

    expect(updateColumnWipLimitsMock).toHaveBeenCalledWith({ doing: 8, verify: 4 });
    expect(wrapper.emitted("updateWipLimits")).toEqual([[{ doing: 8, verify: 4 }]]);
    expect(wrapper.emitted("announce")?.some((msg) => String(msg[0]).includes("已保存在制品上限"))).toBe(true);
  });

  it("rejects invalid WIP limits with validation notice", async () => {
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true,
        columns: [
          { id: "doing", title: "进行中", position: 4000, wipLimit: 2, tasks: [] },
          { id: "verify", title: "待验证", position: 5000, wipLimit: 2, tasks: [] },
        ],
      },
    });
    await flushPromises();

    const doingInput = wrapper.get<HTMLInputElement>("#wip-limit-doing");
    await doingInput.setValue("0");

    const saveBtn = wrapper.findAll("button").find((btn) => btn.text().includes("保存上限"));
    await saveBtn!.trigger("click");
    await flushPromises();

    expect(updateColumnWipLimitsMock).not.toHaveBeenCalled();
    expect(wrapper.emitted("announce")?.some((msg) => String(msg[0]).includes("「进行中」上限必须为大于等于 1 的整数"))).toBe(true);
  });

  it("resets WIP limits back to default 2 items", async () => {
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true,
        columns: [
          { id: "doing", title: "进行中", position: 4000, wipLimit: 10, tasks: [] },
          { id: "verify", title: "待验证", position: 5000, wipLimit: 6, tasks: [] },
        ],
      },
    });
    await flushPromises();

    const resetBtn = wrapper.findAll("button").find((btn) => btn.text().includes("恢复默认 (2项)"));
    expect(resetBtn).toBeDefined();
    await resetBtn!.trigger("click");
    await flushPromises();

    expect(updateColumnWipLimitsMock).toHaveBeenCalledWith({ doing: 2, verify: 2 });
    expect(wrapper.emitted("updateWipLimits")).toEqual([[{ doing: 2, verify: 2 }]]);
    expect(wrapper.emitted("announce")?.some((msg) => String(msg[0]).includes("默认在制品上限"))).toBe(true);
  });

  it("adjusts WIP limits using stepper buttons and preset chips", async () => {
    const wrapper = mount(SettingsPanel, {
      props: {
        open: true,
        columns: [
          { id: "doing", title: "进行中", position: 4000, wipLimit: 2, tasks: [{ id: "t1" } as any, { id: "t2" } as any, { id: "t3" } as any] },
          { id: "verify", title: "待验证", position: 5000, wipLimit: 2, tasks: [{ id: "t4" } as any] },
        ],
      },
    });
    await flushPromises();

    // Check live capacity display
    expect(wrapper.find(".wip-card--doing").classes()).toContain("wip-card--exceeded");
    expect(wrapper.find(".wip-card--doing .wip-card__status-tag").text()).toContain("超限 1 项");

    // Click increment button on doing card
    const plusDoing = wrapper.get('button[aria-label="增加「进行中」上限"]');
    await plusDoing.trigger("click");
    expect(wrapper.get<HTMLInputElement>("#wip-limit-doing").element.value).toBe("3");
    // After incrementing to 3, with 3 tasks it should now be full
    expect(wrapper.find(".wip-card--doing").classes()).toContain("wip-card--full");
    expect(wrapper.find(".wip-card--doing .wip-card__status-tag").text()).toContain("已满载");

    // Click decrement button on doing card
    const minusDoing = wrapper.get('button[aria-label="减少「进行中」上限"]');
    await minusDoing.trigger("click");
    expect(wrapper.get<HTMLInputElement>("#wip-limit-doing").element.value).toBe("2");

    // Click preset chip on verify card (e.g. 4 项)
    const preset4 = wrapper.findAll(".wip-card--verify .wip-preset-chip").find((c) => c.text() === "4 项");
    expect(preset4).toBeDefined();
    await preset4!.trigger("click");
    expect(wrapper.get<HTMLInputElement>("#wip-limit-verify").element.value).toBe("4");
    expect(wrapper.find(".wip-card--verify .wip-card__status-tag").text()).toContain("空闲 3 项");

    // Click '不限' preset chip
    const presetUnlimited = wrapper.findAll(".wip-card--doing .wip-preset-chip").find((c) => c.text() === "不限");
    expect(presetUnlimited).toBeDefined();
    await presetUnlimited!.trigger("click");
    expect(wrapper.get<HTMLInputElement>("#wip-limit-doing").element.value).toBe("");
    expect(wrapper.find(".wip-card--doing .wip-card__status-tag").text()).toContain("自由流转");
  });

  it("switches tabs and updates stage header when clicking sidebar navigation items", async () => {
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    // Default tab is 'general'
    const generalTab = wrapper.get("#settings-tab-general");
    expect(generalTab.attributes("aria-selected")).toBe("true");
    expect(wrapper.get(".settings-panel__stage-header h3").text()).toBe("常规与系统偏好");

    // Click 'ai' tab
    const aiTab = wrapper.get("#settings-tab-ai");
    await aiTab.trigger("click");
    expect(aiTab.attributes("aria-selected")).toBe("true");
    expect(generalTab.attributes("aria-selected")).toBe("false");
    expect(wrapper.get(".settings-panel__stage-header h3").text()).toBe("AI 集成与本地服务");

    // Click 'sop' tab
    const sopTab = wrapper.get("#settings-tab-sop");
    await sopTab.trigger("click");
    expect(sopTab.attributes("aria-selected")).toBe("true");
    expect(wrapper.get(".settings-panel__stage-header h3").text()).toBe("标准作业流程 (SOP)");

    // Click 'wip' tab
    const wipTab = wrapper.get("#settings-tab-wip");
    await wipTab.trigger("click");
    expect(wipTab.attributes("aria-selected")).toBe("true");
    expect(wrapper.get(".settings-panel__stage-header h3").text()).toBe("在制品上限 (WIP Limit)");

    // Click 'data' tab
    const dataTab = wrapper.get("#settings-tab-data");
    await dataTab.trigger("click");
    expect(dataTab.attributes("aria-selected")).toBe("true");
    expect(wrapper.get(".settings-panel__stage-header h3").text()).toBe("数据备份与存储位置");
  });

  it("navigates tabs using ArrowUp and ArrowDown keys", async () => {
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    const tablist = wrapper.get('[role="tablist"]');

    // Currently at 'general', press ArrowDown -> 'ai'
    await tablist.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.get("#settings-tab-ai").attributes("aria-selected")).toBe("true");

    // Press ArrowDown again -> 'sop'
    await tablist.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.get("#settings-tab-sop").attributes("aria-selected")).toBe("true");

    // Press ArrowUp -> back to 'ai'
    await tablist.trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.get("#settings-tab-ai").attributes("aria-selected")).toBe("true");

    // Press ArrowUp -> 'general'
    await tablist.trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.get("#settings-tab-general").attributes("aria-selected")).toBe("true");

    // Press ArrowUp from first tab -> wrap around to 'data'
    await tablist.trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.get("#settings-tab-data").attributes("aria-selected")).toBe("true");
  });

  it("reflects MCP running status and custom SOP badge in sidebar navigation", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "get_storage_info") {
        return Promise.resolve({ path: "C:\\data\\kanboard.db", directory: "C:\\data", version: "0.1.0" });
      }
      if (command === "get_mcp_status") {
        return Promise.resolve({ enabled: true, running: true, url: "http://127.0.0.1:47831/mcp", lastError: null });
      }
      if (command === "get_custom_sop") {
        return Promise.resolve({
          id: "current",
          summary: "自定义 SOP 概述文本",
          content: "### 自定义 SOP 规范完整内容",
          isCustom: true,
          updatedAt: "2026-10-25T00:00:00Z",
        });
      }
      return Promise.resolve(undefined);
    });

    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    // Verify MCP running status dot
    const mcpStatusDot = wrapper.get("#settings-tab-ai .settings-panel__nav-status");
    expect(mcpStatusDot.classes()).toContain("is-running");

    // Verify custom SOP badge
    const sopBadge = wrapper.get("#settings-tab-sop .settings-panel__nav-badge");
    expect(sopBadge.text()).toBe("自定义");
  });
});

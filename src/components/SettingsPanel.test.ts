import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPanel from "./SettingsPanel.vue";

const invoke = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
const enable = vi.hoisted(() => vi.fn());
const disable = vi.hoisted(() => vi.fn());
const isEnabled = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-autostart", () => ({ disable, enable, isEnabled }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: confirmMock,
  open: vi.fn(),
  save,
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
    expect(modal?.textContent).toContain("17 字符");

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
});

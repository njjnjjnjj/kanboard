import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPanel from "./SettingsPanel.vue";

const invoke = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
const enable = vi.hoisted(() => vi.fn());
const disable = vi.hoisted(() => vi.fn());
const isEnabled = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-autostart", () => ({ disable, enable, isEnabled }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
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

  it("exports a backup to the selected file", async () => {
    save.mockResolvedValue("C:\\backup\\tasks.db");
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "导出数据")!.trigger("click");
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("export_data", { path: "C:\\backup\\tasks.db" });
    expect(wrapper.text()).toContain("已导出到 C:\\backup\\tasks.db");
  });

  it("enables the local MCP service from AI integration settings", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "get_storage_info") return Promise.resolve({ path: "C:\\data\\kanboard.db", directory: "C:\\data", version: "0.1.0" });
      if (command === "get_mcp_status") return Promise.resolve({ enabled: false, running: false, url: "http://127.0.0.1:47831/mcp", lastError: null });
      if (command === "set_mcp_enabled") return Promise.resolve({ enabled: true, running: true, url: "http://127.0.0.1:47831/mcp", lastError: null });
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

  it("prepares the plugin and opens Codex", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "get_storage_info") return Promise.resolve({ path: "C:\\data\\kanboard.db", directory: "C:\\data", version: "0.1.0" });
      if (command === "get_mcp_status") return Promise.resolve({ enabled: true, running: true, url: "http://127.0.0.1:47831/mcp", lastError: null });
      if (command === "connect_codex") return Promise.resolve({ opened: true, marketplacePath: "C:\\data\\marketplace.json", deepLink: "codex://plugins/kanboard-agent" });
      return Promise.resolve(undefined);
    });
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "连接到 Codex")!.trigger("click");
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("connect_codex");
    expect(wrapper.text()).toContain("已打开 Codex");
  });

  it("configures Antigravity connection", async () => {
    invoke.mockImplementation((command: string) => {
      if (command === "get_storage_info") return Promise.resolve({ path: "C:\\data\\kanboard.db", directory: "C:\\data", version: "0.1.0" });
      if (command === "get_mcp_status") return Promise.resolve({ enabled: true, running: true, url: "http://127.0.0.1:47831/mcp", lastError: null });
      if (command === "connect_antigravity") return Promise.resolve({ configPath: "C:\\Users\\user\\.gemini\\config\\mcp_config.json", configured: true });
      return Promise.resolve(undefined);
    });
    const wrapper = mount(SettingsPanel, { props: { open: true } });
    await flushPromises();

    await wrapper.findAll("button").find((button) => button.text() === "连接到 Antigravity")!.trigger("click");
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("connect_antigravity");
    expect(wrapper.text()).toContain("已成功配置 Antigravity！");
  });
});

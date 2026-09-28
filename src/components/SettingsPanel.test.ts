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
    invoke.mockResolvedValue({ path: "C:\\data\\kanboard.db", directory: "C:\\data", version: "0.1.0" });
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

    await wrapper.get(".settings-panel__actions button").trigger("click");
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith("export_data", { path: "C:\\backup\\tasks.db" });
    expect(wrapper.text()).toContain("已导出到 C:\\backup\\tasks.db");
  });
});

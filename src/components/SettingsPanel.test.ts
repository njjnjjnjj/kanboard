import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPanel from "./SettingsPanel.vue";

const invoke = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  open: vi.fn(),
  save,
}));

describe("SettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoke.mockResolvedValue({ path: "C:\\data\\kanboard.db", directory: "C:\\data", version: "0.1.0" });
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

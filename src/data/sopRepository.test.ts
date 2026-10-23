import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentSop,
  loadSopConfig,
  saveSopConfig,
  resetSopConfig,
  createDefaultSopConfig,
  DEFAULT_SOP_SUMMARY,
  DEFAULT_SOP_CONTENT,
} from "./sopRepository";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("sopRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSop.value = createDefaultSopConfig();
  });

  it("loads SOP from backend", async () => {
    invoke.mockResolvedValueOnce({
      id: "current",
      summary: "从数据库读取的概述",
      content: "### 从数据库读取的内容",
      isCustom: true,
      updatedAt: "2026-10-23T12:00:00Z",
    });

    const sop = await loadSopConfig();
    expect(invoke).toHaveBeenCalledWith("get_custom_sop");
    expect(sop.summary).toBe("从数据库读取的概述");
    expect(sop.isCustom).toBe(true);
    expect(currentSop.value.summary).toBe("从数据库读取的概述");
  });

  it("saves custom SOP to backend", async () => {
    invoke.mockResolvedValueOnce({
      id: "current",
      summary: "新的定制概述",
      content: "### 新的定制内容",
      isCustom: true,
      updatedAt: "2026-10-23T12:30:00Z",
    });

    const sop = await saveSopConfig("新的定制概述", "### 新的定制内容");
    expect(invoke).toHaveBeenCalledWith("set_custom_sop", {
      summary: "新的定制概述",
      content: "### 新的定制内容",
    });
    expect(sop.isCustom).toBe(true);
    expect(currentSop.value.summary).toBe("新的定制概述");
  });

  it("resets SOP to default", async () => {
    invoke.mockResolvedValueOnce({
      id: "current",
      summary: DEFAULT_SOP_SUMMARY,
      content: DEFAULT_SOP_CONTENT,
      isCustom: false,
      updatedAt: "2026-10-23T13:00:00Z",
    });

    const sop = await resetSopConfig();
    expect(invoke).toHaveBeenCalledWith("reset_custom_sop");
    expect(sop.isCustom).toBe(false);
    expect(sop.summary).toBe(DEFAULT_SOP_SUMMARY);
  });
});

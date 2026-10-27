import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "driver.js";

const driverApi = vi.hoisted(() => ({
  drive: vi.fn(),
  isActive: vi.fn(() => true),
  getActiveIndex: vi.fn(() => 5),
  moveNext: vi.fn(),
  destroy: vi.fn(),
}));
const driverFactory = vi.hoisted(() => vi.fn((_config: unknown) => driverApi));
vi.mock("driver.js", () => ({ driver: driverFactory }));

import {
  notifyOnboardingTaskDropped,
  startOnboarding,
  stopOnboarding,
  ONBOARDING_KEY,
} from "./onboarding";

describe("flow onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.body.className = "";
  });

  it("starts the guide with the 12 enriched flow anchors including interactive drag", () => {
    startOnboarding();

    expect(driverApi.drive).toHaveBeenCalledOnce();
    const config = driverFactory.mock.calls[0]![0] as Config;
    expect(config.steps?.length).toBe(12);

    expect(config.steps?.[0]?.element).toBe("[data-tour='quick-capture']");
    expect(config.steps?.[1]?.element).toBe("[data-tour='project-filter']");
    expect(config.steps?.[2]?.element).toBe("[data-tour='search-filter']");
    expect(config.steps?.[3]?.element).toBe("[data-tour='flow-filters']");
    expect(config.steps?.[4]?.element).toBe("[data-tour='board-columns']");
    expect(config.steps?.[5]?.element).toBe("[data-tour='board-columns']");
    expect(config.steps?.[5]?.popover?.title).toContain("动手试一试：卡片拖拽流转");
    expect(typeof config.steps?.[6]?.element).toBe("function");
    expect(config.steps?.[7]?.element).toBe("[data-column='blocked']");
    expect(config.steps?.[8]?.element).toBe("[data-tour='swimlane']");
    expect(typeof config.steps?.[9]?.element).toBe("function");
    expect(config.steps?.[10]?.element).toBe("[data-tour='flow-dashboard']");
    expect(config.steps?.[11]?.element).toBe("[data-tour='guide-help']");

    expect(config.onDestroyed).toBeTypeOf("function");
    (config.onDestroyed as unknown as () => void)();
    expect(localStorage.getItem(ONBOARDING_KEY)).toBe("seen");
  });

  it("calls onExit callback when destroyed", () => {
    const onExit = vi.fn();
    startOnboarding({ onExit });

    const config = driverFactory.mock.calls[0]![0] as Config;
    (config.onDestroyed as unknown as () => void)();

    expect(onExit).toHaveBeenCalledOnce();
  });

  it("notifies drag drop when on step 5 and dropped into doing", () => {
    vi.useFakeTimers();
    startOnboarding();

    const descEl = document.createElement("div");
    descEl.className = "driver-popover-description";
    document.body.appendChild(descEl);

    notifyOnboardingTaskDropped({
      taskId: "mock-task-drag-demo",
      intoTrash: false,
      toColumnId: "doing",
    });

    expect(descEl.innerHTML).toContain("太棒了！卡片已成功流转至「进行中」");

    vi.advanceTimersByTime(1200);
    expect(driverApi.moveNext).toHaveBeenCalled();

    descEl.remove();
    vi.useRealTimers();
  });

  it("stops active tour when stopOnboarding is called", () => {
    startOnboarding();
    stopOnboarding();
    expect(driverApi.destroy).toHaveBeenCalled();
  });
});

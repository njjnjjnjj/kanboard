import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "driver.js";

const driverApi = vi.hoisted(() => ({ drive: vi.fn() }));
const driverFactory = vi.hoisted(() => vi.fn((_config: unknown) => driverApi));
vi.mock("driver.js", () => ({ driver: driverFactory }));

import { startOnboarding } from "./onboarding";

describe("flow onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("starts the guide with the core flow anchors", () => {
    startOnboarding();

    expect(driverApi.drive).toHaveBeenCalledOnce();
    const config = driverFactory.mock.calls[0]![0] as Config;
    expect(config.steps?.map((step) => step.element)).toEqual([
      "[data-tour='quick-capture']",
      "[data-tour='project-filter']",
      "[data-column='ready']",
      "[data-column='doing']",
      "[data-column='blocked']",
      "[data-tour='guide-help']",
    ]);
    expect(config.onDestroyed).toBeTypeOf("function");
    (config.onDestroyed as unknown as () => void)();
    expect(localStorage.getItem("kanboard.flow-onboarding.v1")).toBe("seen");
  });
});

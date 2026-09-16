import { describe, expect, it } from "vitest";
import { elapsedLabel, isAgingWarning } from "./flowTime";

describe("flow age", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");

  it("formats useful minute, hour and day labels", () => {
    expect(elapsedLabel("2026-09-16T11:45:00.000Z", now)).toBe("15m");
    expect(elapsedLabel("2026-09-16T07:00:00.000Z", now)).toBe("5h");
    expect(elapsedLabel("2026-09-12T12:00:00.000Z", now)).toBe("4d");
  });

  it("warns once work has aged for three days", () => {
    expect(isAgingWarning("2026-09-13T12:00:01.000Z", now)).toBe(false);
    expect(isAgingWarning("2026-09-13T12:00:00.000Z", now)).toBe(true);
  });
});

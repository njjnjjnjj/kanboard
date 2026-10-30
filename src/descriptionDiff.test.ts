import { describe, expect, it } from "vitest";
import { diffDescription } from "./descriptionDiff";

describe("description diff", () => {
  it("preserves line numbers and marks additions and removals between any versions", () => {
    expect(diffDescription("标题\n旧要求\n链接", "标题\n新要求\n链接")).toEqual([
      { kind: "same", text: "标题", oldLine: 1, newLine: 1 },
      { kind: "removed", text: "旧要求", oldLine: 2, newLine: null },
      { kind: "added", text: "新要求", oldLine: null, newLine: 2 },
      { kind: "same", text: "链接", oldLine: 3, newLine: 3 },
    ]);
  });
  it("handles empty bodies, CRLF and unchanged Markdown without interpreting HTML", () => {
    expect(diffDescription("", "")).toEqual([]);
    expect(diffDescription("a\r\nb", "a\nb").every((line) => line.kind === "same")).toBe(true);
    expect(diffDescription("", "<script>alert(1)</script>")[0]?.text).toBe("<script>alert(1)</script>");
    expect(diffDescription("清空", "")[0]?.kind).toBe("removed");
  });
  it("bounds the comparison cost for large rewrites and preserves exact contents", () => {
    const before = Array.from({ length: 1100 }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: 1100 }, (_, i) => `new ${i}`).join("\n");
    const diff = diffDescription(before, after);
    expect(diff.filter((line) => line.kind !== "added").map((line) => line.text).join("\n")).toBe(before);
    expect(diff.filter((line) => line.kind !== "removed").map((line) => line.text).join("\n")).toBe(after);
  });
});

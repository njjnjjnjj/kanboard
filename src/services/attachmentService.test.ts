import { describe, expect, it, vi } from "vitest";
import { isTauri, convertFileSrc } from "@tauri-apps/api/core";
import { blobToBase64, resolveImageSrc, saveImageAttachment, normalizeAttachmentMarkdown } from "./attachmentService";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path, protocol) => `http://${protocol}.localhost/${encodeURIComponent(path)}`),
}));

describe("attachmentService", () => {
  it("converts Blob to base64 data url", async () => {
    const blob = new Blob(["hello attachment"], { type: "text/plain" });
    const b64 = await blobToBase64(blob);
    expect(b64).toContain("data:text/plain;base64,");
  });

  it("saves attachment in mock / web environment with hierarchical date path", async () => {
    const blob = new Blob(["image-content"], { type: "image/png" });
    const result = await saveImageAttachment(blob, "demo.png");
    expect(result.relativePath).toMatch(/^attachments\/\d{4}\/\d{2}\/demo\.png$/);
    expect(result.fileName).toBe("demo.png");
  });

  it("resolves image src correctly", () => {
    expect(resolveImageSrc("https://example.com/pic.png")).toBe("https://example.com/pic.png");
    expect(resolveImageSrc("data:image/png;base64,xxxx")).toBe("data:image/png;base64,xxxx");
    expect(resolveImageSrc("blob:http://localhost/xxx")).toBe("blob:http://localhost/xxx");
    // Non-tauri fallback
    expect(resolveImageSrc("attachments/2026/10/pic.png")).toBe("attachments/2026/10/pic.png");
  });

  it("uses the Rust image protocol without loading an absolute storage directory", () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const path = "attachments/2026/10/pic.png";
    const resolved = resolveImageSrc(path);
    expect(convertFileSrc).toHaveBeenCalledWith(path, "kanboard-image");
    expect(normalizeAttachmentMarkdown(`![截图](${resolved})`)).toBe(`![截图](${path})`);
    expect(resolveImageSrc("/D:/project/pic.png")).toBe("");
    expect(resolveImageSrc("file:///D:/project/pic.png")).toBe("");
    vi.mocked(isTauri).mockReturnValue(false);
  });

  it("restores portable references for Windows and macOS protocol URLs", () => {
    expect(normalizeAttachmentMarkdown("![截图](kanboard-image://localhost/attachments/2026/10/pic.png)"))
      .toBe("![截图](attachments/2026/10/pic.png)");
    expect(normalizeAttachmentMarkdown("![远程](https://example.com/pic.png)"))
      .toBe("![远程](https://example.com/pic.png)");
  });
});

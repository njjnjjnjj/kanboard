import { describe, expect, it } from "vitest";
import { blobToBase64, resolveImageSrc, saveImageAttachment } from "./attachmentService";

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
});

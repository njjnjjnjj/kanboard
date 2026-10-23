import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";

export interface AttachmentResult {
  relativePath: string;
  absolutePath: string;
  fileName: string;
  fileSize: number;
}

let cachedStorageDir: string | null = null;

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
}

export async function getStorageDirectory(): Promise<string> {
  if (cachedStorageDir) return cachedStorageDir;
  if (isTauri()) {
    try {
      const info = await invoke<{ directory: string }>("get_storage_info");
      cachedStorageDir = info.directory;
      return info.directory;
    } catch (err) {
      console.error("Failed to get storage directory", err);
    }
  }
  return "";
}

export async function saveImageAttachment(
  file: File | Blob,
  customName?: string
): Promise<AttachmentResult> {
  const fileName = customName || (file instanceof File ? file.name : "image.png");
  const dataBase64 = await blobToBase64(file);

  if (isTauri()) {
    const result = await invoke<AttachmentResult>("save_image_attachment", {
      fileName,
      dataBase64,
    });
    return result;
  }

  // Web / Test 环境模拟
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const mockRelative = `attachments/${year}/${month}/${fileName}`;
  return {
    relativePath: mockRelative,
    absolutePath: mockRelative,
    fileName,
    fileSize: file.size,
  };
}

export function resolveImageSrc(src: string, storageDir?: string): string {
  if (!src) return "";
  if (/^(https?:|data:|blob:)/i.test(src)) {
    return src;
  }

  if (isTauri()) {
    try {
      // 相对附件路径处理（例如 attachments/2026/10/img.png）
      if (!src.includes(":") && !src.startsWith("/") && !src.startsWith("\\")) {
        const base = storageDir || cachedStorageDir;
        if (base) {
          const sep = base.includes("\\") ? "\\" : "/";
          const fullPath = `${base}${sep}${src.replace(/\//g, sep)}`;
          return convertFileSrc(fullPath);
        }
      }
      return convertFileSrc(src);
    } catch {
      return src;
    }
  }

  return src;
}

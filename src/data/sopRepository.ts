import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SopConfig } from "../types";
// 与后端共用同一份默认规范，避免重置与前端回退内容不一致。
import DEFAULT_SOP_SUMMARY from "../../docs/default-sop-summary.txt?raw";
import DEFAULT_SOP_CONTENT from "../../docs/default-sop.md?raw";

export const TASK_DESCRIPTION_POLICY = "任务说明修订必须先读取 get_task，再调用 update_task_description，提交完整 Markdown 正文、简短 change_summary 和读取时的 expected_description；不得向正文追加时间戳日志。历史版本仅记录 Agent 通过 MCP 提交的修改，人工编辑不生成记录；通过 list_task_description_versions 查看单次修改前后差异，进度与阻塞备注独立记录。文档使用 Markdown 超链接，本机文档可用绝对路径。";

export { DEFAULT_SOP_SUMMARY, DEFAULT_SOP_CONTENT };

export function createDefaultSopConfig(): SopConfig {
  return {
    id: "current",
    summary: DEFAULT_SOP_SUMMARY,
    content: DEFAULT_SOP_CONTENT,
    isCustom: false,
    updatedAt: new Date().toISOString(),
  };
}

export const currentSop = ref<SopConfig>(createDefaultSopConfig());

let listenerInitialized = false;

export async function loadSopConfig(): Promise<SopConfig> {
  try {
    const config = await invoke<SopConfig>("get_custom_sop");
    if (config) {
      currentSop.value = config;
      return config;
    }
  } catch (error) {
    console.warn("loadSopConfig failed, fallback to default", error);
  }
  return currentSop.value;
}

export async function saveSopConfig(summary: string, content: string): Promise<SopConfig> {
  const config = await invoke<SopConfig>("set_custom_sop", {
    summary: summary.trim(),
    content: content.trim(),
  });
  currentSop.value = config;
  return config;
}

export async function resetSopConfig(): Promise<SopConfig> {
  const config = await invoke<SopConfig>("reset_custom_sop");
  currentSop.value = config;
  return config;
}

export function initSopListener(): void {
  if (listenerInitialized) return;
  listenerInitialized = true;
  try {
    listen("sop-updated", () => {
      loadSopConfig();
    });
  } catch {
    // Non-Tauri environment (e.g. unit test)
  }
}

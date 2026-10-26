import { createApp } from "vue";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App.vue";
import QuickCapture from "./components/QuickCapture.vue";
import DocumentPreview from "./components/DocumentPreview.vue";
import "driver.js/dist/driver.css";
import "./styles.css";

const windowLabel = getCurrentWebviewWindow().label;
const isQuickCapture = windowLabel === "quick-capture";
const isDocumentPreview = windowLabel.startsWith("document-preview-");
if (isQuickCapture || isDocumentPreview) {
  document.body.classList.add(isDocumentPreview ? "document-preview-window" : "quick-capture-window");
  document.querySelector("#startup-splash")?.remove();
}
createApp(isDocumentPreview ? DocumentPreview : isQuickCapture ? QuickCapture : App).mount("#app");

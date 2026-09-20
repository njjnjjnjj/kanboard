import { createApp } from "vue";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App.vue";
import QuickCapture from "./components/QuickCapture.vue";
import "driver.js/dist/driver.css";
import "./styles.css";

const isQuickCapture = getCurrentWebviewWindow().label === "quick-capture";
if (isQuickCapture) {
  document.body.classList.add("quick-capture-window");
  document.querySelector("#startup-splash")?.remove();
}
createApp(isQuickCapture ? QuickCapture : App).mount("#app");

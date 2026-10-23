import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, "../node_modules/vditor/dist");
const dest = path.resolve(__dirname, "../public/vditor/dist");

if (fs.existsSync(src)) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log("Vditor dist copied to public/vditor/dist successfully.");
} else {
  console.warn("node_modules/vditor/dist not found!");
}

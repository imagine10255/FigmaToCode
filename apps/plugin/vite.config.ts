import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import react from "@vitejs/plugin-react-swc";

// 面板上顯示的 build 版本：vYYMMDD-HHmm（本機時間），每次 build 自動更新
const pad = (value: number) => String(value).padStart(2, "0");
const now = new Date();
const panelBuildVersion = `v${String(now.getFullYear()).slice(2)}${pad(
  now.getMonth() + 1,
)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

// https://vitejs.dev/config/
export default defineConfig({
  root: "./ui-src",
  define: {
    __PANEL_BUILD_VERSION__: JSON.stringify(panelBuildVersion),
  },
  plugins: [react(), viteSingleFile()],
  build: {
    target: "es2017",
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    outDir: "../dist",
    rollupOptions: {
      output: {},
    },
  },
});

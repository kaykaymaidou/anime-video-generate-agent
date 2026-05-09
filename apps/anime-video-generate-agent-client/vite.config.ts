import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["@mlc-ai/web-llm"],
  },
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    // 默认对齐 Nest（4010）。仅在 legacy Next（3999）时需自行 export VITE_GATEWAY_ORIGIN=http://localhost:3999
    proxy: {
      "/api": {
        target: process.env.VITE_GATEWAY_ORIGIN || "http://127.0.0.1:4010",
        changeOrigin: true,
      },
      "/exports": {
        target: process.env.VITE_GATEWAY_ORIGIN || "http://127.0.0.1:4010",
        changeOrigin: true,
      },
    },
  },
});

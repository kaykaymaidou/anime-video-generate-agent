import { defineConfig } from "@playwright/test";

/**
 * E2E 默认对接 Vite 开发服务器：`127.0.0.1:5173`（与 `vite.config` 默认端口一致）。
 *
 * CI：设置 `CI=true` 时 `reuseExistingServer: false`，由 Playwright 拉起全新 dev server。
 * 本地：若已在跑 `pnpm dev`，会复用现有进程（省重复启动）。
 *
 * 环境变量：
 * - `PLAYWRIGHT_BASE_URL` — 覆盖 baseURL（若改端口，请同步改 `webServer.command` 里的 `--port`）。
 * - `PLAYWRIGHT_SKIP_WEBSERVER` — 任意非空值则禁用自动起服务（仅连你已手动启动的前端）。
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL,
  },
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          command: "pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});

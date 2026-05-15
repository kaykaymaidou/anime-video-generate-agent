import { test, expect } from "@playwright/test";

/**
 * E2E（Playwright）：对接真实 DOM；接口应 mock，避免依赖后端。
 * 运行前需 dev server：pnpm dev（client）或 BASE_URL 指向已部署实例。
 */
test.describe("编辑工作区", () => {
  test("首屏展示主导航并可进入工作区文案", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/");
    await expect(page.getByRole("tab", { name: "工作区" })).toBeVisible();
    await expect(page.getByText("工作区 · 动漫成片")).toBeVisible();
  });
});

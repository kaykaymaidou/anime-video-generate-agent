import { test, expect } from "@playwright/test";

test("generation flow skeleton (mocked)", async ({ page }) => {
  // 这里按规范：必须 mock 后端接口（仅给出骨架）
  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/Vite/);
});


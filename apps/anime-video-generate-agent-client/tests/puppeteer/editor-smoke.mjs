/**
 * Puppeteer（Chrome DevTools 协议）：与 Playwright 类似的浏览器端到端工具链，
 * Google 开源生态里常与 Playwright 对照使用。需本地已启动 Vite：`pnpm dev`。
 *
 * 运行：pnpm test:puppeteer
 * 自定义地址：BASE_URL=http://127.0.0.1:5173 pnpm test:puppeteer
 */

import puppeteer from "puppeteer";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:5173";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.goto(baseURL, { waitUntil: "networkidle2", timeout: 30_000 });
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  if (!body.includes("工作区")) {
    console.error("Puppeteer smoke: 页面未包含「工作区」文案");
    process.exitCode = 1;
  } else {
    console.log("Puppeteer smoke: OK");
  }
} catch (e) {
  console.error("Puppeteer smoke failed:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
}

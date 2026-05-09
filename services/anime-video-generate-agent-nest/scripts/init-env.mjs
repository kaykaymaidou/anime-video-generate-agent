/**
 * 从 .env.example 复制生成 .env（若 .env 已存在则跳过，避免覆盖本地密钥）。
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, "..");
const example = join(pkgRoot, ".env.example");
const target = join(pkgRoot, ".env");

if (!existsSync(example)) {
  console.error("[env:init] 找不到 .env.example，路径:", example);
  process.exit(1);
}

if (existsSync(target)) {
  console.log("[env:init] .env 已存在，跳过（避免覆盖）。若要重建请先删除 .env。");
  process.exit(0);
}

copyFileSync(example, target);
console.log("[env:init] 已从 .env.example 复制生成 .env");

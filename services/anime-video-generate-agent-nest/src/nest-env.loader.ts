import { parse as parseDotenv } from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

/** 非 production（含未设置 NODE_ENV）默认打出 .env 读取轨迹；生产静默，除非 AUTO_DRAMA_ENV_DEBUG=1 */
export function envLoadVerbose(): boolean {
  return process.env.AUTO_DRAMA_ENV_DEBUG === "1" || process.env.NODE_ENV !== "production";
}

/**
 * Windows 记事本「Unicode」常为 UTF-16 LE（含/不含 BOM）。用 utf8 直接读会得到夹杂 \\0 的字符串，dotenv.parse 结果为 {}。
 * 按 BOM / 简单启发式选用 UTF-8 或 UTF-16 LE 再交给 dotenv。
 */
export function readDotenvText(abs: string): { text: string; encoding: "utf8" | "utf16le" } {
  const buf = fs.readFileSync(path.resolve(abs));

  if (buf.length === 0) {
    return { text: "", encoding: "utf8" };
  }

  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString("utf8"), encoding: "utf8" };
  }

  // UTF-16 LE BOM
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.subarray(2).toString("utf16le").replace(/^\uFEFF/, ""), encoding: "utf16le" };
  }

  // UTF-16 BE BOM（少见）
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = buf.subarray(2);
    const swapped = Buffer.alloc(body.length);
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1];
      swapped[i + 1] = body[i];
    }
    return { text: swapped.toString("utf16le").replace(/^\uFEFF/, ""), encoding: "utf16le" };
  }

  const utf16LeAsciiPair = (offset: number): boolean => {
    if (offset + 1 >= buf.length) return false;
    const lo = buf[offset];
    const hi = buf[offset + 1];
    return hi === 0 && lo >= 0x09 && lo <= 0x7e;
  };

  // UTF-16 LE 无 BOM：形如 `43 00 4f 00 …`（CO…）
  if (buf.length >= 6 && utf16LeAsciiPair(0) && utf16LeAsciiPair(2) && utf16LeAsciiPair(4)) {
    return { text: buf.toString("utf16le").replace(/^\uFEFF/, ""), encoding: "utf16le" };
  }

  return { text: buf.toString("utf8").replace(/^\uFEFF/, ""), encoding: "utf8" };
}

/**
 * 从任意目录向上查找 Nest 包根（package.json name 为 anime-video-generate-agent-nest；兼容旧名 auto-drama-nest）。
 */
export function findAutoDramaNestRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 14; i += 1) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string };
        if (pkg.name === "anime-video-generate-agent-nest" || pkg.name === "auto-drama-nest") return dir;
      } catch {
        /* continue */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 仓库根下固定路径（pnpm dev 常见 cwd=repo root） */
export function tryMonorepoNestRoot(cwd: string): string | null {
  const p = path.join(path.resolve(cwd), "services", "anime-video-generate-agent-nest");
  if (fs.existsSync(path.join(p, "package.json"))) return p;
  return null;
}

export function resolveAutoDramaNestRoot(opts: { startDirs: string[]; cwd?: string }): string | null {
  const cwd = opts.cwd ?? process.cwd();
  for (const s of opts.startDirs) {
    const r = findAutoDramaNestRoot(s);
    if (r) return r;
  }
  return tryMonorepoNestRoot(cwd);
}

/**
 * Windows CRLF / BOM 下仍写入 process.env（后者覆盖前者）。
 * 非 production 会在控制台打印每个路径是否存在、合并了多少键（不含密钥内容）。
 */
export function applyEnvFile(abs: string, logChatKeys?: boolean): void {
  const absNorm = path.resolve(abs);
  const exists = fs.existsSync(absNorm);
  const verbose = envLoadVerbose();

  if (!exists) {
    if (verbose) {
      // eslint-disable-next-line no-console
      console.log(`[anime-video-generate-agent-nest env] skip (file missing): ${absNorm}`);
    }
    return;
  }

  const { text: raw0, encoding } = readDotenvText(absNorm);
  let raw = raw0;
  let parsed = parseDotenv(raw);

  // UTF-16 LE 无 BOM 且未命中上文启发式时：parse 为空且 buffer 呈「ASCII 后插 0x00」形态再试 utf16le
  if (Object.keys(parsed).length === 0 && raw.length > 0) {
    const buf = fs.readFileSync(absNorm);
    if (buf.length >= 8 && encoding === "utf8") {
      let hits = 0;
      const max = Math.min(buf.length, 512);
      for (let i = 1; i < max; i += 2) {
        const lo = buf[i - 1];
        if (buf[i] === 0 && lo >= 0x09 && lo <= 0x7f) hits += 1;
      }
      if (hits >= 4) {
        const as16 = buf.toString("utf16le").replace(/^\uFEFF/, "");
        const retry = parseDotenv(as16);
        if (Object.keys(retry).length > 0) {
          raw = as16;
          parsed = retry;
          if (verbose) {
            // eslint-disable-next-line no-console
            console.log(
              `[anime-video-generate-agent-nest env] ${absNorm}: parse empty as utf8; retried UTF-16 LE → ${Object.keys(parsed).length} keys`
            );
          }
        }
      }
    }
  } else if (verbose && encoding === "utf16le") {
    // eslint-disable-next-line no-console
    console.log(`[anime-video-generate-agent-nest env] ${absNorm}: decoded as UTF-16 LE (common for Windows Notepad "Unicode")`);
  }

  for (const [rawKey, rawVal] of Object.entries(parsed)) {
    const key = rawKey.replace(/\r/g, "").trim();
    if (!key) continue;
    process.env[key] = String(rawVal ?? "").replace(/\r/g, "").trim();
  }

  if (verbose) {
    // eslint-disable-next-line no-console
    console.log(`[anime-video-generate-agent-nest env] merged ${Object.keys(parsed).length} keys from ${absNorm}`);
  }

  if (logChatKeys && process.env.AUTO_DRAMA_ENV_DEBUG === "1") {
    const chatKeys = Object.keys(parsed).filter((k) => k.replace(/\r/g, "").includes("VOLC_CHAT"));
    // eslint-disable-next-line no-console
    console.log(`[anime-video-generate-agent-nest env-debug] ${absNorm} VOLC_CHAT keys: ${chatKeys.join(", ") || "(none)"}`);
  }
}

export type VolcEnvDiag = {
  nestRootResolved: string | null;
  nestDotEnvPath: string | null;
  nestDotEnvExists: boolean;
  VOLC_CHAT_MODEL_PRO_len: number;
  VOLC_CHAT_MODEL_LITE_len: number;
  VOLC_CHAT_MODEL_MINI_len: number;
  SEEDANCE_API_KEY_len: number;
  chatModelCascadeLen: number;
  cwd: string;
};

export function buildVolcEnvDiag(startDirForNestResolve: string): VolcEnvDiag {
  const cwd = process.cwd();
  const nestRootResolved = resolveAutoDramaNestRoot({
    startDirs: [startDirForNestResolve, __dirname, cwd],
    cwd,
  });
  const nestDotEnvPath = nestRootResolved ? path.join(nestRootResolved, ".env") : null;
  const pro = process.env.VOLC_CHAT_MODEL_PRO ?? "";
  const lite = process.env.VOLC_CHAT_MODEL_LITE ?? "";
  const mini = process.env.VOLC_CHAT_MODEL_MINI ?? "";
  const cascade = [pro, lite, mini].map((s) => s.trim()).filter(Boolean);
  return {
    nestRootResolved,
    nestDotEnvPath,
    nestDotEnvExists: nestDotEnvPath ? fs.existsSync(nestDotEnvPath) : false,
    VOLC_CHAT_MODEL_PRO_len: pro.trim().length,
    VOLC_CHAT_MODEL_LITE_len: lite.trim().length,
    VOLC_CHAT_MODEL_MINI_len: mini.trim().length,
    SEEDANCE_API_KEY_len: (process.env.SEEDANCE_API_KEY ?? "").trim().length,
    chatModelCascadeLen: new Set(cascade).size,
    cwd,
  };
}

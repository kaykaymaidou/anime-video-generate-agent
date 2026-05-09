import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import net from "node:net";

const repoRoot = path.resolve(process.cwd());
const nestPkgRoot = path.join(repoRoot, "services", "anime-video-generate-agent-nest");
const clientPkgRoot = path.join(repoRoot, "apps", "anime-video-generate-agent-client");
const serverPkgRoot = path.join(repoRoot, "apps", "anime-video-generate-agent-server");
const aiDir = path.join(repoRoot, "services", "anime-video-generate-agent-ai");
const venvDir = path.join(aiDir, ".venv");
const requirements = path.join(aiDir, "requirements.txt");
const depsStamp = path.join(venvDir, ".deps-installed");

const python = process.env.PYTHON_BIN || "python";
const isWin = process.platform === "win32";
const pip = isWin
  ? path.join(venvDir, "Scripts", "pip.exe")
  : path.join(venvDir, "bin", "pip");

const args = new Set(process.argv.slice(2));
const skipPy = args.has("--skip-py");
const skipGateway = args.has("--skip-gateway");
const debug =
  args.has("--debug") ||
  args.has("--verbose") ||
  args.has("--trace") ||
  args.has("--logs");
const fake =
  args.has("--fake") ||
  args.has("--mock") ||
  args.has("--no-volc");

/** 默认：Nest + Vite。旧栈（Python 网关 + Next + Vite）：pnpm dev -- --legacy */
const legacyStack = args.has("--legacy") || args.has("--full-stack");

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code=${code}`));
    });
    p.on("error", reject);
  });
}

function isDepsFresh() {
  if (!existsSync(depsStamp)) return false;
  if (!existsSync(requirements)) return true;
  try {
    const stampMtime = statSync(depsStamp).mtimeMs;
    const reqMtime = statSync(requirements).mtimeMs;
    return stampMtime >= reqMtime;
  } catch {
    return false;
  }
}

async function ensurePythonDeps() {
  if (!existsSync(aiDir)) return;

  if (!existsSync(venvDir)) {
    await run(python, ["-m", "venv", venvDir], { cwd: aiDir });
  }

  if (!isDepsFresh() && existsSync(requirements)) {
    await run(pip, ["install", "-r", requirements], { cwd: aiDir });
    try {
      writeFileSync(depsStamp, `ok ${new Date().toISOString()}\n`, "utf8");
    } catch {}
  }
}

function isPortOpen(port, host) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onDone = (ok) => {
      try {
        socket.destroy();
      } catch {}
      resolve(ok);
    };
    socket.setTimeout(800);
    socket.once("connect", () => onDone(true));
    socket.once("timeout", () => onDone(false));
    socket.once("error", () => onDone(false));
    socket.connect(port, host);
  });
}

async function waitForHttpOk(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(800, () => {
        try {
          req.destroy();
        } catch {}
        resolve(false);
      });
    });
    if (ok) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function waitForHealth({ port, timeoutMs = 20000 }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok =
      (await isPortOpen(port, "127.0.0.1")) ||
      (await isPortOpen(port, "localhost")) ||
      (await isPortOpen(port, "::1"));
    if (ok) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** @returns {string[]} 例如 `@nestjs/cli` → `@nestjs`,`cli` */
function npmPackageDirSegments(npmPackageName) {
  if (!npmPackageName.startsWith("@")) return [npmPackageName];
  const i = npmPackageName.indexOf("/", 1);
  if (i === -1) throw new Error(`[dev] invalid scoped package name: ${npmPackageName}`);
  return [npmPackageName.slice(0, i), npmPackageName.slice(i + 1)];
}

/**
 * 读取依赖包 package.json 的 bin 字段。
 * 使用 workspace 包目录与仓库根的 physical node_modules 路径，兼容 pnpm；
 * 避免 createRequire(package.json) 在子包未链接 node_modules 时 MODULE_NOT_FOUND。
 */
function resolvePackageBin(packageRoot, npmPackageName, binKey) {
  const segments = npmPackageDirSegments(npmPackageName);
  const roots = [packageRoot, repoRoot];
  const tried = [];
  for (const root of roots) {
    const pkgJsonPath = path.join(root, "node_modules", ...segments, "package.json");
    tried.push(pkgJsonPath);
    if (!existsSync(pkgJsonPath)) continue;
    const pkgDir = path.dirname(pkgJsonPath);
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    const bin = pkg.bin;
    const rel = typeof bin === "string" ? bin : bin?.[binKey];
    if (!rel || typeof rel !== "string") {
      throw new Error(`[dev] missing bin "${binKey}" in ${npmPackageName} (${pkgJsonPath})`);
    }
    return path.join(pkgDir, rel.replace(/^\.\//, ""));
  }
  throw new Error(
    `[dev] Cannot find "${npmPackageName}". Checked:\n  ${tried.join("\n  ")}\n` +
      `Run: cd "${repoRoot}" && pnpm install`,
  );
}

/**
 * 用 `node <cli.js> …` 拉起子进程（shell: false），避免：
 * - Windows 上 `cmd /c pnpm …` 多一层包装
 * - 部分工具链在 shell:true + argv 组合下触发 Node DEP0190
 */
function spawnNodeCli(cliModulePath, cliArgs, { cwd, env }) {
  return spawn(process.execPath, [cliModulePath, ...cliArgs], {
    cwd,
    stdio: "inherit",
    shell: false,
    env,
  });
}

function nestDevProc(env) {
  const cli = resolvePackageBin(nestPkgRoot, "@nestjs/cli", "nest");
  return spawnNodeCli(cli, ["start", "--watch"], { cwd: nestPkgRoot, env });
}

function viteDevProc(env) {
  const cli = resolvePackageBin(clientPkgRoot, "vite", "vite");
  return spawnNodeCli(cli, [], { cwd: clientPkgRoot, env });
}

function nextServerDevProc(env) {
  const cli = resolvePackageBin(serverPkgRoot, "tsx", "tsx");
  return spawnNodeCli(cli, ["server.ts"], { cwd: serverPkgRoot, env });
}

function attachShutdown(children) {
  const shutdown = () => {
    for (let i = children.length - 1; i >= 0; i -= 1) {
      try {
        children[i].kill("SIGTERM");
      } catch {}
    }
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
}

/**
 * 默认开发栈：anime-video-generate-agent-nest（HTTP + Socket.io + 火山 HTTP）+ Vite。
 * 前端 /api 与 Socket 均指向 Nest，不启动 Python、不启动 Next。
 */
async function runNestClientStack() {
  const isInUse = async (p) =>
    (await isPortOpen(p, "127.0.0.1")) ||
    (await isPortOpen(p, "localhost")) ||
    (await isPortOpen(p, "::1"));

  let nestPort = Number(process.env.NEST_PORT || 4010);
  if (!Number.isFinite(nestPort)) nestPort = 4010;
  const nestPortExplicit = process.env.NEST_PORT != null && String(process.env.NEST_PORT).trim() !== "";

  if (await isInUse(nestPort)) {
    if (nestPortExplicit) {
      throw new Error(`NEST_PORT ${nestPort} is already in use. Stop anime-video-generate-agent-nest or set NEST_PORT=<free>.`);
    }
    let picked = nestPort;
    for (let p = nestPort + 1; p <= nestPort + 40; p += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await isInUse(p))) {
        picked = p;
        break;
      }
    }
    if (await isInUse(picked)) {
      throw new Error(`No free Nest port in range ${nestPort}..${nestPort + 40}. Set NEST_PORT=<free>.`);
    }
    if (picked !== nestPort) {
      // eslint-disable-next-line no-console
      console.warn(`[dev] NEST_PORT ${nestPort} in use, auto-picked ${picked}`);
    }
    nestPort = picked;
  }

  const nestEnv = { ...process.env, NEST_PORT: String(nestPort) };
  if (debug) {
    nestEnv.AUTO_DRAMA_ENV_DEBUG = nestEnv.AUTO_DRAMA_ENV_DEBUG ?? "1";
  }
  const clientEnv = {
    ...process.env,
    VITE_GATEWAY_ORIGIN: `http://127.0.0.1:${nestPort}`,
  };

  if (debug) {
    clientEnv.VITE_SOCKET_DEBUG = clientEnv.VITE_SOCKET_DEBUG ?? "1";
    // eslint-disable-next-line no-console
    console.log("[dev] debug: VITE_SOCKET_DEBUG for client");
  }

  // eslint-disable-next-line no-console
  console.log(
    "[dev] stack=Nest+Vite（Nest 直连火山 REST；密钥可读 services/anime-video-generate-agent-ai/.env）。旧栈: pnpm dev -- --legacy"
  );

  const children = [];

  const nest = nestDevProc(nestEnv);
  nest.on("exit", (code) => {
    if (code && code !== 0) console.error(`[dev] anime-video-generate-agent-nest exited code=${code}`);
  });
  children.push(nest);

  const nestOk = await waitForHttpOk(`http://127.0.0.1:${nestPort}/health`, 30000);
  if (!nestOk) {
    // eslint-disable-next-line no-console
    console.warn(`[dev] Nest /health did not respond in time; client may error until Nest is ready`);
  }

  const client = viteDevProc(clientEnv);
  client.on("exit", (code) => {
    if (code && code !== 0) console.error(`[dev] client exited code=${code}`);
  });
  children.push(client);

  attachShutdown(children);
}

/** 旧栈：Python 网关 + Next + Vite（可选 VIDEO_TASK_BACKEND=nest 再起 Nest 代理） */
async function runLegacyStack() {
  if (!skipPy) {
    await ensurePythonDeps();
  }

  const portFromEnv = process.env.PORT ? Number(process.env.PORT) : NaN;
  const basePort = Number.isFinite(portFromEnv) ? portFromEnv : 3999;
  const isExplicit = process.env.PORT != null && String(process.env.PORT).trim() !== "";

  const isInUse = async (p) =>
    (await isPortOpen(p, "127.0.0.1")) ||
    (await isPortOpen(p, "localhost")) ||
    (await isPortOpen(p, "::1"));

  let port = basePort;
  if (await isInUse(port)) {
    if (isExplicit) {
      throw new Error(`PORT ${port} is already in use. Please stop the old server or set PORT=<free port>.`);
    }
    for (let p = basePort + 1; p <= basePort + 50; p += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await isInUse(p))) {
        port = p;
        break;
      }
    }
    if (await isInUse(port)) {
      throw new Error(`No free port found in range ${basePort}..${basePort + 50}. Set PORT=<free port>.`);
    }
    // eslint-disable-next-line no-console
    console.warn(`[dev] port ${basePort} in use, auto-picked ${port}`);
  }

  let gatewayPort = Number(process.env.PY_GATEWAY_PORT || 8799);
  if (!Number.isFinite(gatewayPort)) gatewayPort = 8799;
  const gatewayPortExplicit = process.env.PY_GATEWAY_PORT != null && String(process.env.PY_GATEWAY_PORT).trim() !== "";
  if (!skipPy && !skipGateway && !fake) {
    if (await isInUse(gatewayPort)) {
      if (gatewayPortExplicit) {
        throw new Error(
          `PY_GATEWAY_PORT ${gatewayPort} is already in use. Stop the old gateway or unset PY_GATEWAY_PORT.`
        );
      }
      let picked = gatewayPort;
      for (let p = gatewayPort + 1; p <= gatewayPort + 40; p += 1) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await isInUse(p))) {
          picked = p;
          break;
        }
      }
      if (await isInUse(picked)) {
        throw new Error(`No free gateway port in range ${gatewayPort}..${gatewayPort + 40}. Set PY_GATEWAY_PORT=<free>.`);
      }
      if (picked !== gatewayPort) {
        // eslint-disable-next-line no-console
        console.warn(`[dev] gateway port ${gatewayPort} in use, auto-picked ${picked}`);
      }
      gatewayPort = picked;
    }
  }

  const serverEnv = { ...process.env, PORT: String(port) };
  const clientEnv = { ...process.env, VITE_GATEWAY_ORIGIN: `http://localhost:${port}` };

  const videoBackendRaw = String(process.env.VIDEO_TASK_BACKEND || "").trim().toLowerCase();
  const wantNestBridge = videoBackendRaw === "nest" || videoBackendRaw === "nestjs";

  if (debug) {
    serverEnv.PIPELINE_DEBUG = serverEnv.PIPELINE_DEBUG ?? "1";
    serverEnv.PY_BRIDGE_DEBUG = serverEnv.PY_BRIDGE_DEBUG ?? "off";
    serverEnv.SOCKET_DEBUG = serverEnv.SOCKET_DEBUG ?? "1";
    serverEnv.PROGRESS_DEBUG = serverEnv.PROGRESS_DEBUG ?? "1";
    clientEnv.VITE_SOCKET_DEBUG = clientEnv.VITE_SOCKET_DEBUG ?? "1";
    // eslint-disable-next-line no-console
    console.log("[dev] debug logs enabled (PIPELINE_DEBUG/PY_BRIDGE_DEBUG/SOCKET_DEBUG)");
  }

  if (fake) {
    serverEnv.AUTO_DRAMA_FAKE = serverEnv.AUTO_DRAMA_FAKE ?? "1";
    // eslint-disable-next-line no-console
    console.log("[dev] FAKE mode enabled (AUTO_DRAMA_FAKE=1): bypass volcengine, emit simulated progress/result");
  }

  const children = [];

  if (!skipPy && !skipGateway && !fake && existsSync(aiDir)) {
    const pyExe = isWin
      ? path.join(venvDir, "Scripts", "python.exe")
      : path.join(venvDir, "bin", "python");
    const pyRun = existsSync(pyExe) ? pyExe : python;
    const gatewayEnv = {
      ...process.env,
      PY_GATEWAY_HOST: process.env.PY_GATEWAY_HOST || "127.0.0.1",
      PY_GATEWAY_PORT: String(gatewayPort),
    };
    const gw = spawn(
      pyRun,
      ["-m", "uvicorn", "http_gateway:app", "--app-dir", "./src", "--host", "127.0.0.1", "--port", String(gatewayPort)],
      { cwd: aiDir, stdio: "inherit", shell: false, env: gatewayEnv }
    );
    gw.on("exit", (code) => {
      if (code && code !== 0) console.error(`[dev] python-gateway exited code=${code}`);
    });
    children.push(gw);
    const gwUrl = `http://127.0.0.1:${gatewayPort}`;
    serverEnv.PY_GATEWAY_URL = gwUrl;
    // eslint-disable-next-line no-console
    console.log(`[dev] starting Python gateway ${gwUrl} (health /health)`);
    const gwOk = await waitForHttpOk(`${gwUrl}/health`, 25000);
    if (!gwOk) {
      // eslint-disable-next-line no-console
      console.warn(`[dev] gateway did not respond on ${gwUrl}/health in time; Next may fall back or fail PY_GATEWAY requests`);
    }
  } else if (skipGateway && !fake) {
    // eslint-disable-next-line no-console
    console.log("[dev] --skip-gateway: Next will use stdin Python worker (no HTTP gateway)");
  }

  if (wantNestBridge && !fake) {
    if (!serverEnv.PY_GATEWAY_URL && !process.env.NEST_PY_GATEWAY_UPSTREAM?.trim()) {
      // eslint-disable-next-line no-console
      console.warn(
        "[dev] VIDEO_TASK_BACKEND=nest but no Python gateway URL (start gateway or set NEST_PY_GATEWAY_UPSTREAM)"
      );
    }
    let nestPort = Number(process.env.NEST_PORT || 4010);
    if (!Number.isFinite(nestPort)) nestPort = 4010;
    const nestPortExplicit = process.env.NEST_PORT != null && String(process.env.NEST_PORT).trim() !== "";
    if (await isInUse(nestPort)) {
      if (nestPortExplicit) {
        throw new Error(`NEST_PORT ${nestPort} is already in use. Stop anime-video-generate-agent-nest or set NEST_PORT=<free>.`);
      }
      let picked = nestPort;
      for (let p = nestPort + 1; p <= nestPort + 40; p += 1) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await isInUse(p))) {
          picked = p;
          break;
        }
      }
      if (await isInUse(picked)) {
        throw new Error(`No free Nest port in range ${nestPort}..${nestPort + 40}. Set NEST_PORT=<free>.`);
      }
      if (picked !== nestPort) {
        // eslint-disable-next-line no-console
        console.warn(`[dev] NEST_PORT ${nestPort} in use, auto-picked ${picked}`);
      }
      nestPort = picked;
    }

    const nestEnv = {
      ...process.env,
      NEST_PORT: String(nestPort),
      NEST_PY_GATEWAY_UPSTREAM: serverEnv.PY_GATEWAY_URL || process.env.NEST_PY_GATEWAY_UPSTREAM || "",
    };
    if (debug) {
      nestEnv.AUTO_DRAMA_ENV_DEBUG = nestEnv.AUTO_DRAMA_ENV_DEBUG ?? "1";
    }
    const nest = nestDevProc(nestEnv);
    nest.on("exit", (code) => {
      if (code && code !== 0) console.error(`[dev] anime-video-generate-agent-nest exited code=${code}`);
    });
    children.push(nest);
    serverEnv.VIDEO_TASK_BACKEND = serverEnv.VIDEO_TASK_BACKEND || "nest";
    serverEnv.NEST_API_URL = `http://127.0.0.1:${nestPort}`;
    // eslint-disable-next-line no-console
    console.log(`[dev] VIDEO_TASK_BACKEND=nest → anime-video-generate-agent-nest http://127.0.0.1:${nestPort}`);
    const nestOk = await waitForHttpOk(`http://127.0.0.1:${nestPort}/health`, 25000);
    if (!nestOk) {
      // eslint-disable-next-line no-console
      console.warn(`[dev] anime-video-generate-agent-nest /health did not respond in time; task submit may fail`);
    }
  }

  const server = nextServerDevProc(serverEnv);
  server.on("exit", (code) => {
    if (code && code !== 0) console.error(`[dev] server exited code=${code}`);
  });

  const ready = await waitForHealth({ port });
  if (!ready) {
    // eslint-disable-next-line no-console
    console.warn(`[dev] server did not open port ${port} within timeout; starting client anyway`);
  }
  const client = viteDevProc(clientEnv);
  client.on("exit", (code) => {
    if (code && code !== 0) console.error(`[dev] client exited code=${code}`);
  });

  children.push(server, client);

  attachShutdown(children);
}

async function main() {
  if (legacyStack) {
    return runLegacyStack();
  }
  return runNestClientStack();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

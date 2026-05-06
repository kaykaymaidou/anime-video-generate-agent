import { spawn } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import net from "node:net";

const repoRoot = path.resolve(process.cwd());
const aiDir = path.join(repoRoot, "services", "auto-drama-ai");
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

function start(label, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, stdio: "inherit", shell: false, env: process.env });
  p.on("exit", (code) => {
    if (code && code !== 0) {
      // eslint-disable-next-line no-console
      console.error(`[dev] ${label} exited code=${code}`);
    }
  });
  return p;
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

async function main() {
  if (!skipPy) {
    await ensurePythonDeps();
  }

  const portFromEnv = process.env.PORT ? Number(process.env.PORT) : NaN;
  const basePort = Number.isFinite(portFromEnv) ? portFromEnv : 3999;
  const isExplicit = process.env.PORT != null && String(process.env.PORT).trim() !== "";

  const isInUse = async (p) =>
    (await isPortOpen(p, "127.0.0.1")) || (await isPortOpen(p, "localhost")) || (await isPortOpen(p, "::1"));

  let port = basePort;
  if (await isInUse(port)) {
    if (isExplicit) {
      throw new Error(`PORT ${port} is already in use. Please stop the old server or set PORT=<free port>.`);
    }
    // 自动探测可用端口
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

  /** Python FastAPI 网关（POST/GET 任务）；FAKE/skip-py 时不启动，Next 仍走 stdin worker */
  let gatewayPort = Number(process.env.PY_GATEWAY_PORT || 8799);
  if (!Number.isFinite(gatewayPort)) gatewayPort = 8799;
  const gatewayPortExplicit = process.env.PY_GATEWAY_PORT != null && String(process.env.PY_GATEWAY_PORT).trim() !== "";
  if (!skipPy && !skipGateway && !fake) {
    if (await isInUse(gatewayPort)) {
      if (gatewayPortExplicit) {
        throw new Error(`PY_GATEWAY_PORT ${gatewayPort} is already in use. Stop the old gateway or unset PY_GATEWAY_PORT.`);
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

  if (debug) {
    // 一键打开全链路终端日志（Next/Socket/Python）
    serverEnv.PIPELINE_DEBUG = serverEnv.PIPELINE_DEBUG ?? "1";
    // 只看 Next 链路：默认关闭 PythonBridge 终端输出（需要时再手动设置 PY_BRIDGE_DEBUG=event/raw）
    serverEnv.PY_BRIDGE_DEBUG = serverEnv.PY_BRIDGE_DEBUG ?? "off";
    serverEnv.SOCKET_DEBUG = serverEnv.SOCKET_DEBUG ?? "1";
    serverEnv.PROGRESS_DEBUG = serverEnv.PROGRESS_DEBUG ?? "1";
    // 前端可选：打开浏览器控制台 socket debug
    clientEnv.VITE_SOCKET_DEBUG = clientEnv.VITE_SOCKET_DEBUG ?? "1";
    // eslint-disable-next-line no-console
    console.log("[dev] debug logs enabled (PIPELINE_DEBUG/PY_BRIDGE_DEBUG/SOCKET_DEBUG)");
  }

  if (fake) {
    serverEnv.AUTO_DRAMA_FAKE = serverEnv.AUTO_DRAMA_FAKE ?? "1";
    // eslint-disable-next-line no-console
    console.log("[dev] FAKE mode enabled (AUTO_DRAMA_FAKE=1): bypass volcengine, emit simulated progress/result");
  }

  const spawnPnpm = (args, env) => {
    if (process.platform === "win32") {
      // 在 Windows 上 pnpm 是 .cmd 脚本，需通过 cmd.exe 执行，且保持 shell:false
      return spawn("cmd.exe", ["/d", "/s", "/c", "pnpm", ...args], {
        cwd: repoRoot,
        stdio: "inherit",
        shell: false,
        env
      });
    }
    return spawn("pnpm", args, { cwd: repoRoot, stdio: "inherit", shell: false, env });
  };

  const children = [];

  if (!skipPy && !skipGateway && !fake && existsSync(aiDir)) {
    const pyExe = isWin
      ? path.join(venvDir, "Scripts", "python.exe")
      : path.join(venvDir, "bin", "python");
    const pyRun = existsSync(pyExe) ? pyExe : python;
    const gatewayEnv = {
      ...process.env,
      PY_GATEWAY_HOST: process.env.PY_GATEWAY_HOST || "127.0.0.1",
      PY_GATEWAY_PORT: String(gatewayPort)
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

  const server = spawnPnpm(["-C", "apps/auto-drama-server", "dev"], serverEnv);
  server.on("exit", (code) => {
    if (code && code !== 0) console.error(`[dev] server exited code=${code}`);
  });

  const ready = await waitForHealth({ port });
  if (!ready) {
    // eslint-disable-next-line no-console
    console.warn(`[dev] server did not open port ${port} within timeout; starting client anyway`);
  }
  const client = spawnPnpm(["-C", "apps/auto-drama-client", "dev"], clientEnv);
  client.on("exit", (code) => {
    if (code && code !== 0) console.error(`[dev] client exited code=${code}`);
  });

  children.push(server, client);

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

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


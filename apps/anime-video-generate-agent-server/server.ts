import http from "node:http";
import path from "node:path";
import process from "node:process";
import { parse } from "node:url";
import { fileURLToPath } from "node:url";

import next from "next";
import { Server as SocketIOServer } from "socket.io";

import { setIo } from "./src/lib/io-registry";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3999);
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN ||
  "http://localhost:5173";

const allowedOrigins = CLIENT_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

// eslint-disable-next-line no-console
console.log("[anime-video-generate-agent-server] preparing Next.js app...", {
  dev,
  dir: __dirname,
  port: PORT,
});

const prepareStarted = Date.now();
const prepareWarnTimer = setTimeout(() => {
  // eslint-disable-next-line no-console
  console.warn("[anime-video-generate-agent-server] Next.js prepare() taking >10s (possible hang).");
}, 10_000);

void app
  .prepare()
  .then(() => {
    clearTimeout(prepareWarnTimer);
    // eslint-disable-next-line no-console
    console.log("[anime-video-generate-agent-server] Next.js prepared", { ms: Date.now() - prepareStarted });
  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl);
  });

  const pingInterval = Number(process.env.SOCKET_PING_INTERVAL_MS || 25000);
  const pingTimeout = Number(process.env.SOCKET_PING_TIMEOUT_MS || 20000);
  const socketDebug = String(process.env.SOCKET_DEBUG || "0").toLowerCase() === "1" ||
    String(process.env.SOCKET_DEBUG || "0").toLowerCase() === "true";

  const io = new SocketIOServer(server, {
    cors: { origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins, credentials: true },
    // engine.io 心跳（协议层），用于断线检测
    pingInterval: Number.isFinite(pingInterval) ? pingInterval : 25000,
    pingTimeout: Number.isFinite(pingTimeout) ? pingTimeout : 20000
  });

  io.on("connection", (socket) => {
    if (socketDebug) {
      // eslint-disable-next-line no-console
      console.log("[socket] connected", { id: socket.id, transport: socket.conn.transport.name });
    }
    socket.emit("progress-update", { event: "hello", message: "socket connected" });
    socket.on("client-hello", (payload: any) => {
      socket.emit("progress-update", { event: "hello-ack", clientId: payload?.clientId, ts: Date.now() });
    });
    socket.on("client-ping", (payload: any) => {
      if (socketDebug) {
        // eslint-disable-next-line no-console
        console.log("[socket] client-ping", { clientId: payload?.clientId, seq: payload?.seq, clientTs: payload?.ts });
      }
      // 应用层心跳：用于 UI 可观测性（带明确标识）
      socket.emit("progress-update", {
        event: "heartbeat",
        kind: "app",
        clientId: payload?.clientId,
        seq: payload?.seq,
        ts: Date.now(),
        clientTs: payload?.ts
      });
    });

    socket.on("subscribe-task", (payload: any, ack?: (res: any) => void) => {
      const taskId = typeof payload?.taskId === "string" ? payload.taskId : "";
      if (!taskId) {
        ack?.({ ok: false, error: "missing taskId" });
        return;
      }
      const room = `task:${taskId}`;
      // 幂等：已在房间则不重复回 subscribed
      if (socket.rooms.has(room)) {
        ack?.({ ok: true, taskId, room, already: true });
        return;
      }
      void socket.join(room);
      if (socketDebug) {
        // eslint-disable-next-line no-console
        console.log("[socket] join room", { id: socket.id, room });
      }
      // 默认也打印一次 room 映射，方便肉眼核对（不输出 payload，避免刷屏）
      // eslint-disable-next-line no-console
      console.log("[socket] subscribed", { socketId: socket.id, room, taskId });
      socket.emit("progress-update", { event: "subscribed", taskId, ts: Date.now() });
      ack?.({ ok: true, taskId, room });
    });

    socket.on("unsubscribe-task", (payload: any, ack?: (res: any) => void) => {
      const taskId = typeof payload?.taskId === "string" ? payload.taskId : "";
      if (!taskId) {
        ack?.({ ok: false, error: "missing taskId" });
        return;
      }
      void socket.leave(`task:${taskId}`);
      if (socketDebug) {
        // eslint-disable-next-line no-console
        console.log("[socket] leave room", { id: socket.id, room: `task:${taskId}` });
      }
      socket.emit("progress-update", { event: "unsubscribed", taskId, ts: Date.now() });
      ack?.({ ok: true, taskId, room: `task:${taskId}` });
    });
  });

  setIo(io);

  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[anime-video-generate-agent-server] Next + Socket.io on http://localhost:${PORT}`);
  });
  })
  .catch((e) => {
    clearTimeout(prepareWarnTimer);
    // eslint-disable-next-line no-console
    console.error("[anime-video-generate-agent-server] Next.js prepare failed", e);
    process.exit(1);
  });

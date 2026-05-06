import { io, type Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";

type SocketPoolState = {
  socket: Socket | null;
  refCount: number;
  clientId: string;
  connected: boolean;
  lastHelloAt: number;
  heartbeatTimer: number | null;
  heartbeatSeq: number;
};

const g = globalThis as any;
const state: SocketPoolState =
  g.__AUTO_DRAMA_SOCKET_POOL__ ??
  (g.__AUTO_DRAMA_SOCKET_POOL__ = {
    socket: null,
    refCount: 0,
    clientId: uuidv4(),
    connected: false,
    lastHelloAt: 0,
    heartbeatTimer: null,
    heartbeatSeq: 0,
  });

/**
 * Socket 连接策略：
 * - 开发环境：直连网关（优先用 `VITE_GATEWAY_ORIGIN`），避免 Vite ws proxy 刷 ECONNREFUSED
 * - 生产环境：同源
 */
export function acquireSocketClient(): { socket: Socket; release: () => void; clientId: string } {
  const origin =
    typeof window !== "undefined"
      ? (import.meta.env.DEV ? (import.meta.env.VITE_GATEWAY_ORIGIN || "http://localhost:3999") : window.location.origin)
      : typeof import.meta.env.VITE_DEV_ORIGIN === "string"
        ? import.meta.env.VITE_DEV_ORIGIN
        : "http://localhost:3999";

  if (!state.socket) {
    const debug = String(import.meta.env.VITE_SOCKET_DEBUG || "0").toLowerCase() === "1" ||
      String(import.meta.env.VITE_SOCKET_DEBUG || "0").toLowerCase() === "true";

    const s = io(origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      autoConnect: false,
      withCredentials: true,
      auth: { clientId: state.clientId },
    });

    s.on("connect", () => {
      state.connected = true;
      if (debug) console.debug("[socket] connected", { id: s.id, origin, clientId: state.clientId });
      s.emit("client-hello", { clientId: state.clientId, ts: Date.now() });
      state.lastHelloAt = Date.now();
    });
    s.on("disconnect", () => {
      state.connected = false;
      if (debug) console.debug("[socket] disconnected");
    });

    // 仅在 debug 模式下监听协议层 packet（你看到的 2/3 就在这里）
    if (debug) {
      try {
        s.io.engine.on("packet", (pkt: any) => {
          // engine.io packet: ping/pong/message 等（在 network frames 里常见 2/3/42…）
          console.debug("[eio] packet", pkt);
        });
      } catch {
        // ignore
      }
      s.on("progress-update", (evt: any) => {
        const ev = evt?.event;
        if (ev === "heartbeat" || ev === "pipeline-init" || ev === "progress" || ev === "result" || ev === "error") {
          console.debug("[socket] progress-update", evt);
        }
      });
    }

    // 应用层心跳（Socket.IO 自带 ping/pong，但这里用于“业务握手稳定性”可观测）
    const tick = () => {
      if (!s.connected) return;
      state.heartbeatSeq += 1;
      const payload = { ts: Date.now(), clientId: state.clientId, seq: state.heartbeatSeq };
      if (debug) console.debug("[socket] client-ping", payload);
      s.emit("client-ping", payload);
    };
    // 设为 0 可禁用（默认禁用，避免重复“心跳”概念；需要排障再打开）
    const msEnv = import.meta.env.VITE_SOCKET_APP_HEARTBEAT_MS ?? import.meta.env.VITE_SOCKET_HEARTBEAT_MS ?? 0;
    const msRaw = Number(msEnv);
    const ms = Number.isFinite(msRaw) ? msRaw : 0;
    if (ms > 0) {
      state.heartbeatTimer = window.setInterval(tick, Math.max(3000, ms));
    }

    state.socket = s;
  }

  state.refCount += 1;
  const release = () => {
    state.refCount -= 1;
    if (state.refCount <= 0 && state.socket) {
      try {
        state.socket.disconnect();
      } catch {}
      state.socket = null;
      state.refCount = 0;
      if (state.heartbeatTimer) {
        window.clearInterval(state.heartbeatTimer);
        state.heartbeatTimer = null;
      }
    }
  };

  return { socket: state.socket, release, clientId: state.clientId };
}

// 兼容旧调用
export function createSocketClient(): Socket {
  return acquireSocketClient().socket;
}

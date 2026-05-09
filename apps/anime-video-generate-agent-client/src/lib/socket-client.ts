import { io, type Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";

import {
  type SocketConnectionPhase,
  transitionSocketPhase,
} from "@/lib/socket-connection.machine";

type SocketPoolState = {
  socket: Socket | null;
  refCount: number;
  clientId: string;
  connected: boolean;
  connectionPhase: SocketConnectionPhase;
  lastHelloAt: number;
  heartbeatTimer: number | null;
  heartbeatSeq: number;
};

const g = globalThis as any;
const state: SocketPoolState =
  g.__ANIME_VIDEO_GENERATE_AGENT_SOCKET_POOL__ ??
  (g.__ANIME_VIDEO_GENERATE_AGENT_SOCKET_POOL__ = {
    socket: null,
    refCount: 0,
    clientId: uuidv4(),
    connected: false,
    connectionPhase: "idle",
    lastHelloAt: 0,
    heartbeatTimer: null,
    heartbeatSeq: 0,
  });

function setPhase(next: SocketConnectionPhase) {
  state.connectionPhase = next;
}

/** 供调试或 UI；与 socket.connected 互补（含重连中间态）。 */
export function getSocketConnectionPhase(): SocketConnectionPhase {
  return state.connectionPhase;
}

export function acquireSocketClient(): { socket: Socket; release: () => void; clientId: string } {
  const origin =
    typeof window !== "undefined"
      ? (import.meta.env.DEV
          ? (import.meta.env.VITE_GATEWAY_ORIGIN || "http://127.0.0.1:4010")
          : window.location.origin)
      : typeof import.meta.env.VITE_DEV_ORIGIN === "string"
        ? import.meta.env.VITE_DEV_ORIGIN
        : "http://127.0.0.1:4010";

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

    const rawConnect = s.connect.bind(s);
    s.connect = (...args: Parameters<Socket["connect"]>) => {
      setPhase(transitionSocketPhase(state.connectionPhase, { type: "connect_called" }));
      return rawConnect(...args);
    };

    s.on("connect", () => {
      state.connected = true;
      setPhase(transitionSocketPhase(state.connectionPhase, { type: "socket_connected" }));
      if (debug) console.debug("[socket] connected", { id: s.id, origin, clientId: state.clientId });
      s.emit("client-hello", { clientId: state.clientId, ts: Date.now() });
      state.lastHelloAt = Date.now();
    });
    s.on("disconnect", () => {
      state.connected = false;
      setPhase(transitionSocketPhase(state.connectionPhase, { type: "socket_disconnected" }));
      if (debug) console.debug("[socket] disconnected");
    });
    s.on("connect_error", (err: Error & { message?: string }) => {
      setPhase(transitionSocketPhase(state.connectionPhase, { type: "connect_error", message: err?.message }));
      if (debug) console.debug("[socket] connect_error", err?.message);
    });
    s.io.on("reconnect_attempt", () => {
      setPhase(transitionSocketPhase(state.connectionPhase, { type: "reconnect_attempt" }));
    });
    s.io.on("reconnect", () => {
      setPhase(transitionSocketPhase(state.connectionPhase, { type: "reconnect" }));
      state.connected = true;
    });

    if (debug) {
      try {
        s.io.engine.on("packet", (pkt: any) => {
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

    const tick = () => {
      if (!s.connected) return;
      state.heartbeatSeq += 1;
      const payload = { ts: Date.now(), clientId: state.clientId, seq: state.heartbeatSeq };
      if (debug) console.debug("[socket] client-ping", payload);
      s.emit("client-ping", payload);
    };
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
      state.connected = false;
      setPhase(transitionSocketPhase(state.connectionPhase, { type: "socket_destroyed" }));
      if (state.heartbeatTimer) {
        window.clearInterval(state.heartbeatTimer);
        state.heartbeatTimer = null;
      }
    }
  };

  return { socket: state.socket, release, clientId: state.clientId };
}

/**
 * @deprecated 每次调用会增加引用计数且永不释放，易导致泄漏。请使用 `acquireSocketClient()` 并在 effect cleanup 中 `release()`。
 */
export function createSocketClient(): Socket {
  return acquireSocketClient().socket;
}


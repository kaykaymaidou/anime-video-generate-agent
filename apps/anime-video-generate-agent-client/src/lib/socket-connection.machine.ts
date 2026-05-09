/**
 * Socket.io 连接的可观测阶段（显式状态机，便于排查重连与订阅竞态）。
 * 不绑定 React；由 socket-client 在引擎事件上驱动迁移。
 */

export type SocketConnectionPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type SocketConnectionDriverEvent =
  | { type: "connect_called" }
  | { type: "socket_connected" }
  | { type: "socket_disconnected"; reason?: string }
  | { type: "reconnect_attempt" }
  | { type: "reconnect" }
  | { type: "connect_error"; message?: string }
  | { type: "socket_destroyed" };

export function transitionSocketPhase(
  phase: SocketConnectionPhase,
  evt: SocketConnectionDriverEvent,
): SocketConnectionPhase {
  switch (evt.type) {
    case "connect_called":
      if (phase === "connected") return phase;
      return "connecting";
    case "socket_connected":
      return "connected";
    case "socket_disconnected":
      return "disconnected";
    case "reconnect_attempt":
      return phase === "connected" ? "reconnecting" : phase;
    case "reconnect":
      return "connected";
    case "connect_error":
      return "error";
    case "socket_destroyed":
      return "idle";
    default:
      return phase;
  }
}

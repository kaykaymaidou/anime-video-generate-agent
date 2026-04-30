export type SocketEvent =
  | "pipeline-init"
  | "shot-progress"
  | "shot-result"
  | "cost-update"
  | "task-complete"
  | "error";

/**
 * 这里先放占位：后续接入 socket.io-client 时，把 connect()/on()/off() 统一封装在这里，
 * 页面与 store 不直接依赖 socket 实现细节。
 */
export function createSocketClient() {
  return {
    connected: false,
    on(_event: SocketEvent, _cb: (payload: unknown) => void) {},
    off(_event: SocketEvent, _cb: (payload: unknown) => void) {},
    emit(_event: string, _payload: unknown) {},
    disconnect() {},
  };
}


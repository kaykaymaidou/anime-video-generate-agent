import { useEffect, useMemo, useState } from "react";

import { createSocketClient, type SocketEvent } from "@/lib/socket-client";

export type TaskProgressEvent = {
  event: SocketEvent;
  payload: unknown;
};

/**
 * 任务进度 Hook（前端边界：只负责订阅事件与聚合状态，不直接耦合 socket.io 实现）。
 * 当前是占位实现：后续在 `lib/socket-client.ts` 接入 socket.io-client 后自然生效。
 */
export function useTaskProgress(taskId?: string) {
  const socket = useMemo(() => createSocketClient(), []);
  const [events, setEvents] = useState<TaskProgressEvent[]>([]);

  useEffect(() => {
    if (!taskId) return;

    const onAny = (event: SocketEvent) => (payload: unknown) => {
      setEvents((prev) => [...prev, { event, payload }].slice(-2000));
    };

    const handlers: Array<[SocketEvent, (p: unknown) => void]> = [
      ["pipeline-init", onAny("pipeline-init")],
      ["shot-progress", onAny("shot-progress")],
      ["shot-result", onAny("shot-result")],
      ["cost-update", onAny("cost-update")],
      ["task-complete", onAny("task-complete")],
      ["error", onAny("error")],
    ];

    handlers.forEach(([e, h]) => socket.on(e, h));
    return () => handlers.forEach(([e, h]) => socket.off(e, h));
  }, [socket, taskId]);

  return { events };
}


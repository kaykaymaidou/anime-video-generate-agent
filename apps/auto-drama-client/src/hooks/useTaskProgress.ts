import { useEffect, useMemo, useState } from "react";

import { createSocketClient } from "@/lib/socket-client";

export type TaskProgressEvent = {
  /** 服务端 JSON 行里的 `event` 字段（如 pipeline-init / progress / result） */
  event: string;
  payload: unknown;
};

/**
 * 订阅网关 `progress-update` 通道（与 Python stdout JSON 事件对齐）。
 */
export function useTaskProgress(taskId?: string) {
  const socket = useMemo(() => createSocketClient(), []);
  const [events, setEvents] = useState<TaskProgressEvent[]>([]);

  useEffect(() => {
    if (!taskId) return;

    const handler = (payload: unknown) => {
      const p = payload as Record<string, unknown>;
      const ev = typeof p?.event === "string" ? p.event : "unknown";
      setEvents((prev) => [...prev, { event: ev, payload }].slice(-2000));
    };

    socket.connect();
    socket.on("progress-update", handler);
    return () => {
      socket.off("progress-update", handler);
    };
  }, [socket, taskId]);

  return { events };
}

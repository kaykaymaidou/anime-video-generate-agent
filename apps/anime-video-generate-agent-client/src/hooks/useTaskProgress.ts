import { useEffect, useRef, useState } from "react";

import { acquireSocketClient } from "@/lib/socket-client";

export type TaskProgressEvent = {
  /** 服务端 JSON 行里的 `event` 字段（如 pipeline-init / progress / result） */
  event: string;
  payload: unknown;
};

/**
 * 订阅网关 `progress-update`（Observer）。
 * - 引用计数：`acquireSocketClient` / `release`，避免泄漏。
 * - 竞态：`taskId` 切换时用代数丢弃过期回调结果。
 */
export function useTaskProgress(taskId?: string) {
  const [events, setEvents] = useState<TaskProgressEvent[]>([]);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!taskId) return;

    generationRef.current += 1;
    const generation = generationRef.current;
    const { socket, release } = acquireSocketClient();

    const handler = (payload: unknown) => {
      if (generation !== generationRef.current) return;
      const p = payload as Record<string, unknown>;
      const tid = typeof p?.taskId === "string" ? p.taskId : null;
      if (tid != null && tid !== taskId) return;

      const ev = typeof p?.event === "string" ? p.event : "unknown";
      setEvents((prev) => [...prev, { event: ev, payload }].slice(-2000));
    };

    socket.connect();
    socket.on("progress-update", handler);
    return () => {
      socket.off("progress-update", handler);
      release();
    };
  }, [taskId]);

  return { events };
}

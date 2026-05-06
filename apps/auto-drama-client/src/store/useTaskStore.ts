import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TaskStatus = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type TaskEvent = {
  ts: number;
  event?: string;
  message?: string;
  taskId?: string;
  shotId?: string;
  progress?: number;
  raw: Record<string, unknown>;
};

interface TaskState {
  taskId: string | null;
  status: TaskStatus;
  selectedShotId: string | null;
  activeVideoUrl: string | null;
  progress: number | null;
  progressMessage: string | null;
  events: TaskEvent[];
  setTaskId: (taskId: string | null) => void;
  setStatus: (status: TaskStatus) => void;
  selectShot: (shotId: string | null) => void;
  setActiveVideoUrl: (url: string | null) => void;
  appendEvent: (evt: Record<string, unknown>) => void;
  clearEvents: () => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      taskId: null,
      status: "idle",
      selectedShotId: null,
      activeVideoUrl: null,
      progress: null,
      progressMessage: null,
      events: [],
      setTaskId: (taskId) => set({ taskId }),
      setStatus: (status) => set({ status }),
      selectShot: (selectedShotId) => set({ selectedShotId }),
      setActiveVideoUrl: (activeVideoUrl) => set({ activeVideoUrl }),
      appendEvent: (raw) =>
        set((s) => {
          const ev = typeof raw?.event === "string" ? raw.event : undefined;
          const message = typeof raw?.message === "string" ? raw.message : undefined;
          const taskId = typeof raw?.taskId === "string" ? raw.taskId : undefined;
          const shotId = typeof raw?.shotId === "string" ? raw.shotId : undefined;
          const progress = typeof raw?.progress === "number" ? raw.progress : undefined;
          const item: TaskEvent = {
            ts: Date.now(),
            event: ev,
            message,
            taskId,
            shotId,
            progress,
            raw,
          };
          const next = [...s.events, item];
          const progressFromEvent =
            typeof progress === "number"
              ? Math.max(0, Math.min(100, Math.round(progress)))
              : ev === "pipeline-init"
                ? 1
                : null;
          const progressMessageFromEvent =
            message ||
            (ev === "pipeline-init"
              ? "任务已进入队列"
              : ev === "result"
                ? "已生成完成"
                : ev === "error"
                  ? "生成失败"
                  : null);

          return {
            events: next.length > 80 ? next.slice(next.length - 80) : next,
            progress: progressFromEvent ?? s.progress,
            progressMessage: progressMessageFromEvent ?? s.progressMessage
          };
        }),
      clearEvents: () => set({ events: [], progress: null, progressMessage: null }),
    }),
    { name: "auto-drama-task" }
  )
);


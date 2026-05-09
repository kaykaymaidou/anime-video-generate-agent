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
  generationPendingShotIds: string[];
  generationHadBatchError: boolean;
  activeProgressTaskId: string | null;
  /** 每轮 begin / abort / 整批结束 +1，用于丢弃跨波次的迟到 Socket 包 */
  progressIngressGeneration: number;
  progress: number | null;
  progressMessage: string | null;
  events: TaskEvent[];
  setTaskId: (taskId: string | null) => void;
  setStatus: (status: TaskStatus) => void;
  selectShot: (shotId: string | null) => void;
  setActiveVideoUrl: (url: string | null) => void;
  beginShotGeneration: (taskId: string, shotIds: string[]) => void;
  resolveShotGeneration: (shotId: string, outcome?: "ok" | "error") => void;
  abortShotGeneration: () => void;
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
      generationPendingShotIds: [],
      generationHadBatchError: false,
      activeProgressTaskId: null,
      progressIngressGeneration: 0,
      progress: null,
      progressMessage: null,
      events: [],
      setTaskId: (taskId) => set({ taskId }),
      setStatus: (status) => set({ status }),
      selectShot: (selectedShotId) => set({ selectedShotId }),
      setActiveVideoUrl: (activeVideoUrl) => set({ activeVideoUrl }),
      beginShotGeneration: (taskId, shotIds) =>
        set((s) => ({
          progressIngressGeneration: s.progressIngressGeneration + 1,
          activeProgressTaskId: taskId,
          generationPendingShotIds: [...shotIds],
          generationHadBatchError: false,
          status: "queued",
        })),
      resolveShotGeneration: (shotId, outcome = "ok") =>
        set((s) => {
          const pending = s.generationPendingShotIds.filter((id) => id !== shotId);
          const doneAll = pending.length === 0;
          const hadErr = s.generationHadBatchError || outcome === "error";
          return {
            generationPendingShotIds: pending,
            generationHadBatchError: hadErr,
            status: doneAll ? (hadErr ? "failed" : "succeeded") : "running",
            ...(doneAll
              ? {
                  activeProgressTaskId: null,
                  progressIngressGeneration: s.progressIngressGeneration + 1,
                }
              : {}),
          };
        }),
      abortShotGeneration: () =>
        set((s) => ({
          progressIngressGeneration: s.progressIngressGeneration + 1,
          generationPendingShotIds: [],
          generationHadBatchError: false,
          activeProgressTaskId: null,
        })),
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
    {
      name: "anime-video-generate-agent-task",
      partialize: (s) => ({
        taskId: s.taskId,
        status: s.status,
        selectedShotId: s.selectedShotId,
        activeVideoUrl: s.activeVideoUrl,
      }),
    }
  )
);


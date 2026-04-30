import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TaskStatus = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

interface TaskState {
  taskId: string | null;
  status: TaskStatus;
  selectedShotId: string | null;
  activeVideoUrl: string | null;
  setTaskId: (taskId: string | null) => void;
  setStatus: (status: TaskStatus) => void;
  selectShot: (shotId: string | null) => void;
  setActiveVideoUrl: (url: string | null) => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      taskId: null,
      status: "idle",
      selectedShotId: null,
      activeVideoUrl: null,
      setTaskId: (taskId) => set({ taskId }),
      setStatus: (status) => set({ status }),
      selectShot: (selectedShotId) => set({ selectedShotId }),
      setActiveVideoUrl: (activeVideoUrl) => set({ activeVideoUrl }),
    }),
    { name: "auto-drama-task" }
  )
);


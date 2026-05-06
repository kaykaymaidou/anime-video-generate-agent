import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Shot, ModelType } from "@/types";

interface StoryboardState {
  shots: Shot[];
  setShots: (shots: Shot[]) => void;
  reorder: (activeId: string, overId: string) => void;
  updateShot: (id: string, patch: Partial<Shot>) => void;
  setModelType: (id: string, modelType: ModelType) => void;
}

export const useStoryboardStore = create<StoryboardState>()(
  persist(
    (set, get) => ({
      shots: [],
      setShots: (shots) => set({ shots }),
      reorder: (activeId, overId) =>
        set((state) => {
          if (!activeId || !overId || activeId === overId) return {};
          const next = [...state.shots];
          const from = next.findIndex((s) => s.id === activeId);
          const to = next.findIndex((s) => s.id === overId);
          if (from === -1 || to === -1) return {};
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return { shots: next.map((s, i) => ({ ...s, order: i + 1 })) };
        }),
      updateShot: (id, patch) =>
        set((state) => ({
          shots: state.shots.map((s) => (s.id === id ? { ...s, ...patch } : s))
        })),
      setModelType: (id, modelType) => get().updateShot(id, { modelType })
    }),
    {
      name: "auto-drama-storyboard",
      version: 2,
      migrate: (persisted: any) => {
        const shots = Array.isArray(persisted?.shots) ? persisted.shots : [];
        return {
          ...persisted,
          shots: shots.map((s: any) => ({
            ...s,
            // 强制把旧版本残留的 seedance2.0/fast/lite 迁移到 1.5pro
            modelType: "seedance1.5pro",
          })),
        };
      },
    }
  )
);


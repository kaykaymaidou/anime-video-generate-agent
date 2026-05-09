import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Shot, ModelType } from "@/types";

const MAX_ANIME_SNAPSHOTS = 14;

function newStoryboardContextCacheKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function newSnapshotId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `snap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type AnimeProjectSnapshot = {
  id: string;
  createdAt: number;
  label: string;
  shots: Shot[];
  referenceLibraryUrls: string[];
  script: string;
  consistencyNotes: string;
  knowledgeContext: string;
};

interface StoryboardState {
  shots: Shot[];
  /** 项目级参考图 URL（人设/场景），供各镜头引用 */
  referenceLibraryUrls: string[];
  /** 命名快照：剧本 + 分镜 + 侧栏设定，仅动漫项目 */
  animeProjectSnapshots: AnimeProjectSnapshot[];
  /** 服务端方舟上下文缓存会话键（持久化）；换新项目可 resetContextCacheKey */
  contextCacheKey: string | null;
  getOrCreateContextCacheKey: () => string;
  resetContextCacheKey: () => void;
  setShots: (shots: Shot[]) => void;
  reorder: (activeId: string, overId: string) => void;
  updateShot: (id: string, patch: Partial<Shot>) => void;
  setModelType: (id: string, modelType: ModelType) => void;
  /** 同镜多成片里选定稿（导出 / 拼接 / 预览以此为准） */
  selectVideoTake: (shotId: string, url: string) => void;
  addReferenceLibraryUrl: (url: string) => void;
  removeReferenceLibraryUrl: (url: string) => void;
  saveAnimeProjectSnapshot: (label: string, bundle: Omit<AnimeProjectSnapshot, "id" | "createdAt" | "label">) => string;
  restoreAnimeProjectSnapshot: (id: string) => AnimeProjectSnapshot | null;
  deleteAnimeProjectSnapshot: (id: string) => void;
}

export const useStoryboardStore = create<StoryboardState>()(
  persist(
    (set, get) => ({
      shots: [],
      referenceLibraryUrls: [],
      animeProjectSnapshots: [],
      contextCacheKey: null,
      getOrCreateContextCacheKey: () => {
        const cur = get().contextCacheKey;
        if (cur) return cur;
        const id = newStoryboardContextCacheKey();
        set({ contextCacheKey: id });
        return id;
      },
      resetContextCacheKey: () => set({ contextCacheKey: newStoryboardContextCacheKey() }),
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
      setModelType: (id, modelType) => get().updateShot(id, { modelType }),
      selectVideoTake: (shotId, url) =>
        set((state) => ({
          shots: state.shots.map((s) => {
            if (s.id !== shotId) return s;
            const u = url.trim();
            if (!u) return s;
            const pool = new Set([...(s.videoTakeUrls ?? []), s.videoUrl ?? ""].filter(Boolean));
            if (!pool.has(u)) return s;
            return { ...s, videoUrl: u };
          }),
        })),
      saveAnimeProjectSnapshot: (label, bundle) => {
        const id = newSnapshotId();
        const snap: AnimeProjectSnapshot = {
          id,
          createdAt: Date.now(),
          label: label.trim() || `快照 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
          shots: JSON.parse(JSON.stringify(bundle.shots)) as Shot[],
          referenceLibraryUrls: [...bundle.referenceLibraryUrls],
          script: bundle.script,
          consistencyNotes: bundle.consistencyNotes,
          knowledgeContext: bundle.knowledgeContext,
        };
        set((s) => ({
          animeProjectSnapshots: [snap, ...s.animeProjectSnapshots].slice(0, MAX_ANIME_SNAPSHOTS),
        }));
        return id;
      },
      restoreAnimeProjectSnapshot: (id) => {
        const snap = get().animeProjectSnapshots.find((x) => x.id === id);
        if (!snap) return null;
        set({
          shots: JSON.parse(JSON.stringify(snap.shots)) as Shot[],
          referenceLibraryUrls: [...snap.referenceLibraryUrls],
        });
        return snap;
      },
      deleteAnimeProjectSnapshot: (id) =>
        set((s) => ({
          animeProjectSnapshots: s.animeProjectSnapshots.filter((x) => x.id !== id),
        })),
      addReferenceLibraryUrl: (url) => {
        const u = url.trim();
        if (!u) return;
        set((s) =>
          s.referenceLibraryUrls.includes(u)
            ? {}
            : { referenceLibraryUrls: [...s.referenceLibraryUrls, u].slice(0, 24) }
        );
      },
      removeReferenceLibraryUrl: (url) =>
        set((s) => ({
          referenceLibraryUrls: s.referenceLibraryUrls.filter((x) => x !== url),
        })),
    }),
    {
      name: "anime-video-generate-agent-storyboard",
      version: 5,
      migrate: (persisted: any, version: number) => {
        const shots = Array.isArray(persisted?.shots) ? persisted.shots : [];
        const referenceLibraryUrls = Array.isArray(persisted?.referenceLibraryUrls)
          ? persisted.referenceLibraryUrls
          : [];
        const contextCacheKey =
          typeof persisted?.contextCacheKey === "string" && persisted.contextCacheKey.trim()
            ? persisted.contextCacheKey.trim()
            : null;
        const animeProjectSnapshots = Array.isArray(persisted?.animeProjectSnapshots)
          ? persisted.animeProjectSnapshots.slice(0, MAX_ANIME_SNAPSHOTS)
          : [];
        const normalizedShots = shots.map((s: any) => ({
          ...s,
          modelType: s?.modelType ?? "seedance1.5pro",
          videoTakeUrls: Array.isArray(s?.videoTakeUrls) ? s.videoTakeUrls : undefined,
        }));
        if ((version ?? 0) < 5) {
          for (const s of normalizedShots) {
            const vu = typeof s.videoUrl === "string" ? s.videoUrl.trim() : "";
            if (vu && (!Array.isArray(s.videoTakeUrls) || s.videoTakeUrls.length === 0)) {
              s.videoTakeUrls = [vu];
            }
          }
        }
        return {
          ...persisted,
          shots: normalizedShots,
          referenceLibraryUrls,
          animeProjectSnapshots,
          contextCacheKey,
        };
      },
    }
  )
);


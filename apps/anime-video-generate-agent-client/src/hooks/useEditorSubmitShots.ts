import type { MutableRefObject } from "react";
import { v4 as uuidv4 } from "uuid";

import type { AnimeStylePresetId, SubmitAgentPayload } from "@/api/agent";
import { clampClientStoryboardMaxShots } from "@/lib/storyboard-limits";
import { useStoryboardStore } from "@/store/storyboardStore";
import type { TaskStatus } from "@/store/useTaskStore";
import { useTaskStore } from "@/store/useTaskStore";
import type { Socket } from "socket.io-client";

type SubmitMutate = {
  mutateAsync: (payload: SubmitAgentPayload) => Promise<{ taskId?: string | null }>;
};

export function useEditorSubmitShots(opts: {
  socketRef: MutableRefObject<Socket | null>;
  submitAgent: SubmitMutate;
  shots: ReturnType<typeof useStoryboardStore.getState>["shots"];
  taskId: string | null;
  script: string;
  consistencyNotes: string;
  knowledgeContext: string;
  animeStylePreset: string;
  animeMangaBoost: boolean;
  animeCrossShot: boolean;
  storyboardMaxShots: number;
  setTaskId: (id: string | null) => void;
  clearEvents: () => void;
  updateShot: ReturnType<typeof useStoryboardStore.getState>["updateShot"];
  setSubmitting: (b: boolean) => void;
  setIntentBanner: (s: string | null) => void;
  setErrorText: (s: string | null) => void;
  setErrorHint: (s: string | null) => void;
  setErrorCode: (s: string | null) => void;
  setErrorCodeN: (s: string | null) => void;
  setErrorDocUrl: (s: string | null) => void;
  setStatus: (s: TaskStatus) => void;
}) {
  const ensureSocketConnected = async () => {
    const socket = opts.socketRef.current;
    if (!socket) throw new Error("socket not ready");
    if (socket.connected) return socket;
    socket.connect();
    await new Promise<void>((resolve) => {
      socket.once("connect", () => resolve());
    });
    return socket;
  };

  const submitShots = async (shotIds?: string[]) => {
    const list = opts.shots
      .filter((s) => (shotIds ? shotIds.includes(s.id) : true))
      .map((s, idx) => ({
        id: s.id || uuidv4(),
        order: s.order ?? idx + 1,
        description: s.description ?? "",
        prompt: s.prompt,
        modelType: s.modelType,
        duration: s.duration,
        resolution: s.resolution,
        ratio: s.ratio,
        fps: s.fps,
        seed: s.seed,
        watermark: s.watermark,
        camera_fixed: s.camera_fixed,
        referenceImage: s.referenceImage ?? undefined,
        firstFrame: s.firstFrame ?? undefined,
        lastFrame: s.lastFrame ?? undefined,
      }));

    if (list.length === 0) return;

    const nextTaskId = opts.taskId || uuidv4();
    if (!opts.taskId) opts.setTaskId(nextTaskId);
    opts.clearEvents();
    opts.setIntentBanner(null);

    const subscribePromise = (async () => {
      try {
        const socket = await ensureSocketConnected();
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error("subscribe-task timeout")), 2800);
          socket.emit("subscribe-task", { taskId: nextTaskId }, (res: { ok?: boolean; error?: string }) => {
            window.clearTimeout(timer);
            if (res?.ok) resolve();
            else reject(new Error(res?.error || "subscribe-task failed"));
          });
        });
      } catch {
        /* 进度仍可能由全员广播收到 */
      }
    })();

    opts.setSubmitting(true);
    opts.setErrorText(null);
    opts.setErrorHint(null);
    opts.setErrorCode(null);
    opts.setErrorCodeN(null);
    opts.setErrorDocUrl(null);

    const submittedIds = list.map((s) => s.id);
    submittedIds.forEach((id) => opts.updateShot(id, { status: "generating" }));
    useTaskStore.getState().beginShotGeneration(nextTaskId, submittedIds);

    try {
      const notes = opts.consistencyNotes.trim();
      const kb = opts.knowledgeContext.trim();
      const presetRaw = opts.animeStylePreset.trim();
      const presets: AnimeStylePresetId[] = ["cel_jp", "guoman_paint", "ink_manga", "chibi"];
      const presetOk = presets.includes(presetRaw as AnimeStylePresetId)
        ? (presetRaw as AnimeStylePresetId)
        : undefined;

      const res = await opts.submitAgent.mutateAsync({
        taskId: nextTaskId,
        script: opts.script,
        contextCacheKey: useStoryboardStore.getState().getOrCreateContextCacheKey(),
        ...(notes ? { consistencyNotes: notes } : {}),
        ...(kb ? { knowledgeContext: kb } : {}),
        ...(presetOk ? { animeStylePreset: presetOk } : {}),
        animePromptBoost: opts.animeMangaBoost ? "manga_storyboard" : "none",
        inheritCrossShotStyle: opts.animeCrossShot,
        storyboardMaxShots: clampClientStoryboardMaxShots(opts.storyboardMaxShots),
        shots: list,
      });
      if (res.taskId) opts.setTaskId(res.taskId);
      await subscribePromise.catch(() => {});
    } catch (e) {
      useTaskStore.getState().abortShotGeneration();
      submittedIds.forEach((id) => opts.updateShot(id, { status: "pending" }));
      const raw = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error(e);
      const parts = raw
        .split(/\n\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      opts.setErrorText(parts[0] ?? raw);
      opts.setErrorHint(parts[1] ?? null);
      opts.setErrorCode(parts.find((p) => p.startsWith("错误码："))?.replace(/^错误码：\s*/, "").trim() ?? null);
      opts.setErrorCodeN(parts.find((p) => p.startsWith("CodeN："))?.replace(/^CodeN：\s*/, "").trim() ?? null);
      opts.setErrorDocUrl(parts.find((p) => p.startsWith("说明："))?.replace(/^说明：\s*/, "").trim() ?? null);
      opts.setSubmitting(false);
      opts.setStatus("failed");
      await subscribePromise.catch(() => {});
    }
  };

  return { submitShots };
}

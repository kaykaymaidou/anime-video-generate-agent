import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { EditorWorkspaceSettingsSheet } from "@/components/features/editor/EditorWorkspaceSettingsSheet";
import { ScriptEditor } from "@/components/features/script/ScriptEditor";
import { VideoPreview } from "@/components/features/video/VideoPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AnimeStylePresetId } from "@/api/agent";
import { buildAnimeTimelineExport, downloadJson } from "@/lib/export-timeline";
import { importAnimeTimelineJson } from "@/lib/import-anime-timeline";
import { useSubmitAgentMutation } from "@/hooks/useAgentMutations";
import { useTimelineConcatMutation } from "@/hooks/useTimelineMutation";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { acquireSocketClient } from "@/lib/socket-client";
import { shouldAcceptAgentProgressEvent } from "@/lib/socket-progress-guards";
import { useAnimeCharacterStore } from "@/store/animeCharacterStore";
import { useStoryboardStore } from "@/store/storyboardStore";
import { useTaskStore } from "@/store/useTaskStore";
import { v4 as uuidv4 } from "uuid";
import type { Socket } from "socket.io-client";

export function EditorPage() {
  const queryClient = useQueryClient();
  const submitAgent = useSubmitAgentMutation();
  const concatTimeline = useTimelineConcatMutation();
  const setStatus = useTaskStore((s) => s.setStatus);
  const setActiveVideoUrl = useTaskStore((s) => s.setActiveVideoUrl);
  const appendEvent = useTaskStore((s) => s.appendEvent);
  const clearEvents = useTaskStore((s) => s.clearEvents);
  const taskId = useTaskStore((s) => s.taskId);
  const setTaskId = useTaskStore((s) => s.setTaskId);
  const selectShot = useTaskStore((s) => s.selectShot);
  const shots = useStoryboardStore((s) => s.shots);
  const updateShot = useStoryboardStore((s) => s.updateShot);
  const setShots = useStoryboardStore((s) => s.setShots);
  const referenceLibraryUrls = useStoryboardStore((s) => s.referenceLibraryUrls);
  const addReferenceLibraryUrl = useStoryboardStore((s) => s.addReferenceLibraryUrl);
  const removeReferenceLibraryUrl = useStoryboardStore((s) => s.removeReferenceLibraryUrl);
  const animeProjectSnapshots = useStoryboardStore((s) => s.animeProjectSnapshots);
  const saveAnimeProjectSnapshot = useStoryboardStore((s) => s.saveAnimeProjectSnapshot);
  const restoreAnimeProjectSnapshot = useStoryboardStore((s) => s.restoreAnimeProjectSnapshot);
  const deleteAnimeProjectSnapshot = useStoryboardStore((s) => s.deleteAnimeProjectSnapshot);
  const [consistencyNotes, setConsistencyNotes] = useLocalStorageState<string>(
    "anime-video-generate-agent-consistency-notes",
    ""
  );
  const [knowledgeContext, setKnowledgeContext] = useLocalStorageState<string>(
    "anime-video-generate-agent-knowledge-context",
    ""
  );
  const [animeStylePreset, setAnimeStylePreset] = useLocalStorageState<string>(
    "anime-video-generate-agent-anime-style-preset",
    ""
  );
  const [animeMangaBoost, setAnimeMangaBoost] = useLocalStorageState<boolean>(
    "anime-video-generate-agent-anime-manga-boost",
    false
  );
  const [animeCrossShot, setAnimeCrossShot] = useLocalStorageState<boolean>(
    "anime-video-generate-agent-anime-cross-shot",
    false
  );
  const [concatTransition, setConcatTransition] = useLocalStorageState<string>(
    "anime-video-generate-agent-concat-transition",
    "none"
  );
  const animeCharacters = useAnimeCharacterStore((s) => s.characters);
  const addAnimeCharacter = useAnimeCharacterStore((s) => s.addCharacter);
  const removeAnimeCharacter = useAnimeCharacterStore((s) => s.removeCharacter);
  const buildAnimeCharacterSnippet = useAnimeCharacterStore((s) => s.buildConsistencySnippet);
  const [charNameDraft, setCharNameDraft] = useState("");
  const [charSheetDraft, setCharSheetDraft] = useState("");
  const [charNotesDraft, setCharNotesDraft] = useState("");
  const [refUrlDraft, setRefUrlDraft] = useState("");
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const [masterVideoUrl, setMasterVideoUrl] = useState<string | null>(null);
  const [intentBanner, setIntentBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [script, setScript] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorCodeN, setErrorCodeN] = useState<string | null>(null);
  const [errorDocUrl, setErrorDocUrl] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const timelineImportRef = useRef<HTMLInputElement>(null);
  const [snapshotLabelDraft, setSnapshotLabelDraft] = useState("");
  const [workspaceSheetOpen, setWorkspaceSheetOpen] = useState(false);
  const [workspaceSheetTab, setWorkspaceSheetTab] = useState("strategy");

  const workspaceSettingsFilledCount = useMemo(() => {
    let n = 0;
    if (knowledgeContext.trim()) n += 1;
    if (consistencyNotes.trim()) n += 1;
    if (referenceLibraryUrls.length) n += 1;
    if (animeStylePreset.trim()) n += 1;
    if (animeMangaBoost) n += 1;
    if (animeCrossShot) n += 1;
    if (animeCharacters.length) n += 1;
    if (animeProjectSnapshots.length) n += 1;
    return n;
  }, [
    knowledgeContext,
    consistencyNotes,
    referenceLibraryUrls.length,
    animeStylePreset,
    animeMangaBoost,
    animeCrossShot,
    animeCharacters.length,
    animeProjectSnapshots.length,
  ]);

  const concatClips = useMemo(
    () =>
      shots
        .filter((s) => s.videoUrl?.trim())
        .map((s) => ({ order: s.order, url: s.videoUrl!.trim() }))
        .sort((a, b) => a.order - b.order),
    [shots]
  );

  const ensureSocketConnected = async () => {
    const socket = socketRef.current;
    if (!socket) throw new Error("socket not ready");
    if (socket.connected) return socket;
    socket.connect();
    await new Promise<void>((resolve) => {
      socket.once("connect", () => resolve());
    });
    return socket;
  };

  const submitShots = async (shotIds?: string[]) => {
    const list = shots
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
        lastFrame: s.lastFrame ?? undefined
      }));

    if (list.length === 0) return;

    const nextTaskId = taskId || uuidv4();
    if (!taskId) setTaskId(nextTaskId);
    clearEvents();
    setIntentBanner(null);

    /** 与 POST 并行订阅 room，避免 HTTP 卡在 Socket ack；极端情况下可能漏掉极早的推送 */
    const subscribePromise = (async () => {
      try {
        const socket = await ensureSocketConnected();
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error("subscribe-task timeout")), 2800);
          socket.emit("subscribe-task", { taskId: nextTaskId }, (res: any) => {
            window.clearTimeout(timer);
            if (res?.ok) resolve();
            else reject(new Error(res?.error || "subscribe-task failed"));
          });
        });
      } catch {
        /* 忽略：进度仍可能由全员广播收到，且不因 Socket 阻塞生成请求 */
      }
    })();

    setSubmitting(true);
    setErrorText(null);
    setErrorHint(null);
    setErrorCode(null);
    setErrorCodeN(null);
    setErrorDocUrl(null);

    const submittedIds = list.map((s) => s.id);
    submittedIds.forEach((id) => updateShot(id, { status: "generating" }));
    useTaskStore.getState().beginShotGeneration(nextTaskId, submittedIds);

    try {
      const notes = consistencyNotes.trim();
      const kb = knowledgeContext.trim();
      const presetRaw = animeStylePreset.trim();
      const presets: AnimeStylePresetId[] = ["cel_jp", "guoman_paint", "ink_manga", "chibi"];
      const presetOk = presets.includes(presetRaw as AnimeStylePresetId)
        ? (presetRaw as AnimeStylePresetId)
        : undefined;

      const res = await submitAgent.mutateAsync({
        taskId: nextTaskId,
        script,
        contextCacheKey: useStoryboardStore.getState().getOrCreateContextCacheKey(),
        ...(notes ? { consistencyNotes: notes } : {}),
        ...(kb ? { knowledgeContext: kb } : {}),
        ...(presetOk ? { animeStylePreset: presetOk } : {}),
        animePromptBoost: animeMangaBoost ? "manga_storyboard" : "none",
        inheritCrossShotStyle: animeCrossShot,
        shots: list,
      });
      if (res.taskId) setTaskId(res.taskId);
      await subscribePromise.catch(() => {});
    } catch (e) {
      useTaskStore.getState().abortShotGeneration();
      submittedIds.forEach((id) => updateShot(id, { status: "pending" }));
      const raw = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error(e);
      const parts = raw
        .split(/\n\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      setErrorText(parts[0] ?? raw);
      setErrorHint(parts[1] ?? null);
      setErrorCode(parts.find((p) => p.startsWith("错误码："))?.replace(/^错误码：\s*/, "").trim() ?? null);
      setErrorCodeN(parts.find((p) => p.startsWith("CodeN："))?.replace(/^CodeN：\s*/, "").trim() ?? null);
      setErrorDocUrl(parts.find((p) => p.startsWith("说明："))?.replace(/^说明：\s*/, "").trim() ?? null);
      setSubmitting(false);
      setStatus("failed");
      await subscribePromise.catch(() => {});
    }
  };

  useEffect(() => {
    const { socket, release } = acquireSocketClient();
    socketRef.current = socket;
    socket.connect();

    socket.on("progress-update", (evt: Record<string, unknown>) => {
      const st0 = useTaskStore.getState();
      const snap = {
        activeProgressTaskId: st0.activeProgressTaskId,
        progressIngressGeneration: st0.progressIngressGeneration,
      };
      const gate = shouldAcceptAgentProgressEvent(evt, snap);
      if (!gate.accept) {
        const debug =
          String(import.meta.env.VITE_SOCKET_DEBUG || "0").toLowerCase() === "1" ||
          String(import.meta.env.VITE_SOCKET_DEBUG || "0").toLowerCase() === "true";
        if (debug) console.debug("[Editor/socket] dropped progress-update", gate.reason, evt);
        return;
      }

      appendEvent(evt);
      const ev = evt?.event;
      if (ev === "agent-intent" && typeof evt.message === "string" && evt.message.trim()) {
        setIntentBanner(evt.message.trim());
      }
      if (ev === "pipeline-init") setStatus("running");
      if (ev === "progress") setStatus("running");
      if (ev === "result" && typeof evt.video_url === "string") {
        const shotId = typeof evt.shotId === "string" ? evt.shotId : null;
        const url = evt.video_url;
        if (shotId) {
          const cur = useStoryboardStore.getState().shots.find((s) => s.id === shotId);
          const prevUrl = cur?.videoUrl?.trim() ?? "";
          const takes = [...(cur?.videoTakeUrls ?? [])];
          if (prevUrl && prevUrl !== url && !takes.includes(prevUrl)) takes.push(prevUrl);
          if (!takes.includes(url)) takes.push(url);
          updateShot(shotId, { status: "success", videoUrl: url, videoTakeUrls: takes });
        }
        const sel = useTaskStore.getState().selectedShotId;
        if (!sel || sel === shotId) setActiveVideoUrl(url);
        if (shotId) useTaskStore.getState().resolveShotGeneration(shotId, "ok");
        if (useTaskStore.getState().generationPendingShotIds.length === 0) setSubmitting(false);
        void queryClient.invalidateQueries({ queryKey: ["usage"] });
      }
      if (ev === "error") {
        const shotId = typeof evt.shotId === "string" ? evt.shotId : null;
        if (shotId) {
          updateShot(shotId, { status: "error" });
          useTaskStore.getState().resolveShotGeneration(shotId, "error");
        } else {
          useTaskStore.getState().abortShotGeneration();
        }
        if (typeof evt.message === "string" && evt.message.trim()) {
          setErrorText(evt.message.trim());
        } else {
          setErrorText("生成失败（未返回错误信息）");
        }
        setErrorHint(typeof evt.hint === "string" && evt.hint.trim() ? evt.hint.trim() : null);
        setErrorCode(typeof evt.ark_code === "string" && evt.ark_code.trim() ? evt.ark_code.trim() : null);
        const cn = evt.volc_code_n;
        setErrorCodeN(typeof cn === "number" ? String(cn) : null);
        setErrorDocUrl(typeof evt.doc_url === "string" && evt.doc_url.trim() ? evt.doc_url.trim() : null);
        if (useTaskStore.getState().generationPendingShotIds.length === 0) setSubmitting(false);
      }
      if (ev === "done") {
        if (useTaskStore.getState().generationPendingShotIds.length === 0) setSubmitting(false);
      }
    });

    return () => {
      release();
      socketRef.current = null;
    };
    // 有意只在挂载时绑定一次；处理器内通过 getState() 读取最新选中镜头与 pending
    // eslint-disable-next-line react-hooks/exhaustive-deps -- socket listener registered once
  }, [appendEvent, queryClient, setActiveVideoUrl, setStatus, updateShot]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!taskId) return;
    // 订阅由 submitShots 负责提前完成；这里不再重复订阅，避免双 subscribed
    return;
  }, [taskId]);

  const runConcatMaster = () => {
    setMasterVideoUrl(null);
    void (async () => {
      try {
        const res = await concatTimeline.mutateAsync({
          clips: concatClips,
          transition: concatTransition === "fade" ? "fade" : "none",
        });
        setMasterVideoUrl(res.videoUrl);
      } catch {
        /* mutation onError optional */
      }
    })();
  };

  return (
    <div className="h-[calc(100svh-3.5rem)]">
      <EditorWorkspaceSettingsSheet
        open={workspaceSheetOpen}
        onOpenChange={setWorkspaceSheetOpen}
        tab={workspaceSheetTab}
        onTabChange={setWorkspaceSheetTab}
        shots={shots}
        script={script}
        referenceLibraryUrls={referenceLibraryUrls}
        consistencyNotes={consistencyNotes}
        setConsistencyNotes={setConsistencyNotes}
        knowledgeContext={knowledgeContext}
        setKnowledgeContext={setKnowledgeContext}
        animeStylePreset={animeStylePreset}
        setAnimeStylePreset={setAnimeStylePreset}
        animeMangaBoost={animeMangaBoost}
        setAnimeMangaBoost={setAnimeMangaBoost}
        animeCrossShot={animeCrossShot}
        setAnimeCrossShot={setAnimeCrossShot}
        concatTransition={concatTransition}
        setConcatTransition={setConcatTransition}
        concatClips={concatClips}
        concatTimelinePending={concatTimeline.isPending}
        concatTimelineError={concatTimeline.error}
        submitting={submitting}
        masterVideoUrl={masterVideoUrl}
        onConcatSubmit={runConcatMaster}
        animeProjectSnapshots={animeProjectSnapshots}
        snapshotLabelDraft={snapshotLabelDraft}
        setSnapshotLabelDraft={setSnapshotLabelDraft}
        saveAnimeProjectSnapshot={saveAnimeProjectSnapshot}
        restoreAnimeProjectSnapshot={restoreAnimeProjectSnapshot}
        deleteAnimeProjectSnapshot={deleteAnimeProjectSnapshot}
        selectShot={selectShot}
        setScript={setScript}
        animeCharacters={animeCharacters}
        charNameDraft={charNameDraft}
        setCharNameDraft={setCharNameDraft}
        charSheetDraft={charSheetDraft}
        setCharSheetDraft={setCharSheetDraft}
        charNotesDraft={charNotesDraft}
        setCharNotesDraft={setCharNotesDraft}
        addAnimeCharacter={addAnimeCharacter}
        removeAnimeCharacter={removeAnimeCharacter}
        buildAnimeCharacterSnippet={buildAnimeCharacterSnippet}
        refUrlDraft={refUrlDraft}
        setRefUrlDraft={setRefUrlDraft}
        addReferenceLibraryUrl={addReferenceLibraryUrl}
        removeReferenceLibraryUrl={removeReferenceLibraryUrl}
        refFileInputRef={refFileInputRef}
      />
      <div className="flex h-full">
        <aside className="flex h-full w-[34%] min-w-[320px] flex-col border-r border-white/10 bg-slate-950 lg:min-w-[360px]">
          <div className="shrink-0 space-y-2 border-b border-white/10 bg-slate-950 px-3 py-2.5">
            <div>
              <div className="text-sm font-semibold text-slate-50">工作区 · 动漫成片</div>
              <p className="mt-0.5 text-[10px] leading-snug text-indigo-300/90">
                仅二维/三维动漫；侧栏专注剧本与分镜，资源与策略请点「详细设置」从右侧抽屉打开。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => timelineImportRef.current?.click()}
              >
                导入时间线
              </Button>
              <input
                ref={timelineImportRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      const raw = JSON.parse(String(reader.result));
                      const res = importAnimeTimelineJson(raw);
                      if (res.ok === false) {
                        window.alert(res.reason);
                        return;
                      }
                      if (
                        !window.confirm(`导入 ${res.shots.length} 个动漫镜头？将替换当前分镜列表。`)
                      ) {
                        return;
                      }
                      setShots(res.shots);
                      const first = res.shots[0];
                      if (first?.id) selectShot(first.id);
                    } catch {
                      window.alert("JSON 无法解析");
                    }
                  };
                  reader.readAsText(f, "utf-8");
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  const doc = buildAnimeTimelineExport(shots);
                  downloadJson(`anime-video-generate-agent-timeline-${doc.generatedAt}.json`, doc);
                }}
              >
                导出 JSON
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => {
                  setWorkspaceSheetTab("strategy");
                  setWorkspaceSheetOpen(true);
                }}
              >
                详细设置
                {workspaceSettingsFilledCount > 0 ? (
                  <Badge variant="outline" className="border-indigo-400/40 px-1.5 py-0 text-[10px] text-indigo-200">
                    {workspaceSettingsFilledCount}
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-slate-400 hover:text-slate-100"
                onClick={() => {
                  setWorkspaceSheetTab("concat");
                  setWorkspaceSheetOpen(true);
                }}
              >
                成片合成…
              </Button>
              <span className="text-[11px] text-slate-500">
                {submitting ? "生成中" : "就绪"}
              </span>
            </div>
            {(masterVideoUrl || concatTimeline.error) && (
              <div className="flex flex-wrap gap-2 text-[10px]">
                {concatTimeline.error ? (
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-100">
                    合成失败 — 打开「成片合成」抽屉查看详情
                  </span>
                ) : null}
                {masterVideoUrl ? (
                  <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-100">
                    已有 master 链接 —{" "}
                    <button
                      type="button"
                      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                      onClick={() => {
                        setWorkspaceSheetTab("concat");
                        setWorkspaceSheetOpen(true);
                      }}
                    >
                      在抽屉中打开
                    </button>
                  </span>
                ) : null}
              </div>
            )}
            {errorText && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                <div className="font-medium text-rose-100">{errorText}</div>
                {errorHint && <div className="mt-1.5 leading-relaxed text-rose-200/90">{errorHint}</div>}
                {(errorCode || errorCodeN) && (
                  <div className="mt-1 font-mono text-[10px] text-rose-300/80">
                    {errorCode && <span>错误码：{errorCode}</span>}
                    {errorCode && errorCodeN && <span className="mx-1 text-rose-400/50">·</span>}
                    {errorCodeN && <span>CodeN：{errorCodeN}</span>}
                  </div>
                )}
                {errorDocUrl && (
                  <a
                    href={errorDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex text-sky-400 underline decoration-sky-400/50 underline-offset-2 hover:text-sky-300"
                  >
                    查看方舟推理错误码说明
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ScriptEditor
              script={script}
              onScriptChange={setScript}
              storyboardKnowledgeContext={knowledgeContext}
              storyboardConsistencyNotes={consistencyNotes}
              previewAnimeStylePreset={animeStylePreset}
              previewAnimeMangaBoost={animeMangaBoost}
              previewAnimeCrossShot={animeCrossShot}
              onGenerateAll={() => void submitShots()}
              onGenerateShot={(shotId) => {
                selectShot(shotId);
                void submitShots([shotId]);
              }}
            />
          </div>
        </aside>
        <div className="relative h-full flex-1 overflow-hidden bg-black">
          <VideoPreview masterVideoUrl={masterVideoUrl} intentHint={intentBanner} />
        </div>
      </div>
    </div>
  );
}

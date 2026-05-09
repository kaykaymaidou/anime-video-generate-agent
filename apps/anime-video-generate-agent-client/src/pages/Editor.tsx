import { useQueryClient } from "@tanstack/react-query";
import { HelpCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ScriptEditor } from "@/components/features/script/ScriptEditor";
import { VideoPreview } from "@/components/features/video/VideoPreview";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AnimeStylePresetId } from "@/api/agent";
import { buildAnimeTimelineExport, downloadJson } from "@/lib/export-timeline";
import { importAnimeTimelineJson } from "@/lib/import-anime-timeline";
import { useSubmitAgentMutation } from "@/hooks/useAgentMutations";
import { useTimelineConcatMutation } from "@/hooks/useTimelineMutation";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { acquireSocketClient } from "@/lib/socket-client";
import {
  mergeCharacterSnippetIntoNotes,
  useAnimeCharacterStore,
} from "@/store/animeCharacterStore";
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
      const activeTask = useTaskStore.getState().activeProgressTaskId;
      const tid = typeof evt.taskId === "string" ? evt.taskId : null;
      if (activeTask != null && tid !== activeTask) return;

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

  return (
    <div className="h-[calc(100svh-3.5rem)]">
      <div className="flex h-full">
        <aside className="flex h-full w-[38%] min-w-[380px] flex-col border-r border-white/10 bg-slate-950">
          <div className="border-b border-white/10 bg-slate-950 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-50">工作区 · 动漫成片</div>
                <div className="mt-0.5 text-[10px] text-indigo-300/90">
                  仅二维/三维动漫；导出与导入均带 <span className="font-mono">anime_only</span>，不作真人实拍成片。
                </div>
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
                  导出时间线 JSON
                </Button>
                <select
                  value={concatTransition}
                  onChange={(e) => setConcatTransition(e.target.value)}
                  className="h-8 rounded-md border border-white/15 bg-slate-900 px-2 text-[11px] text-slate-200"
                  title="淡入淡出会统一转 720p 并重编码，较慢且无音轨"
                  aria-label="拼接转场"
                >
                  <option value="none">硬切拼接</option>
                  <option value="fade">淡入淡出</option>
                </select>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="text-xs"
                  disabled={concatClips.length < 2 || concatTimeline.isPending || submitting}
                  title="服务端 FFmpeg；淡入淡出需重编码，成片无音轨"
                  onClick={() => {
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
                  }}
                >
                  {concatTimeline.isPending ? "合成中…" : "FFmpeg 合成成片"}
                </Button>
                <div className="text-xs text-slate-400">状态：{submitting ? "generating" : "ready"}</div>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-slate-900/40 p-2">
              <div className="text-[11px] font-medium text-slate-400">动漫项目快照（剧本 + 分镜 + 侧栏）</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  value={snapshotLabelDraft}
                  onChange={(e) => setSnapshotLabelDraft(e.target.value)}
                  placeholder="快照名称…"
                  className="min-w-[140px] flex-1 border-white/10 bg-slate-900/80 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    saveAnimeProjectSnapshot(snapshotLabelDraft, {
                      shots,
                      referenceLibraryUrls,
                      script,
                      consistencyNotes,
                      knowledgeContext,
                    });
                    setSnapshotLabelDraft("");
                  }}
                >
                  保存快照
                </Button>
              </div>
              {animeProjectSnapshots.length > 0 && (
                <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                  {animeProjectSnapshots.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/5 bg-black/20 px-2 py-1">
                      <span className="min-w-0 truncate font-medium text-slate-300" title={s.label}>
                        {s.label}
                      </span>
                      <span className="shrink-0 text-slate-600">
                        {new Date(s.createdAt).toLocaleString("zh-CN", { hour12: false })}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="text-sky-400 hover:text-sky-300"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `恢复快照「${s.label}」？未另存的分镜与剧本会被覆盖。`
                              )
                            ) {
                              return;
                            }
                            const snap = restoreAnimeProjectSnapshot(s.id);
                            if (!snap) return;
                            setScript(snap.script);
                            setConsistencyNotes(snap.consistencyNotes);
                            setKnowledgeContext(snap.knowledgeContext);
                            const first = snap.shots[0];
                            if (first?.id) selectShot(first.id);
                          }}
                        >
                          恢复
                        </button>
                        <button
                          type="button"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => {
                            if (!window.confirm(`删除快照「${s.label}」？`)) return;
                            deleteAnimeProjectSnapshot(s.id);
                          }}
                        >
                          删除
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {concatTimeline.error && (
              <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                合成失败：{concatTimeline.error instanceof Error ? concatTimeline.error.message : String(concatTimeline.error)}
              </div>
            )}
            {masterVideoUrl && (
              <div className="mt-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
                <div className="font-medium text-emerald-50">已生成 master（{concatClips.length} 段拼接）</div>
                <a
                  href={masterVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all text-sky-400 underline underline-offset-2 hover:text-sky-300"
                >
                  {masterVideoUrl}
                </a>
              </div>
            )}
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <span>知识库片段（可选）</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                      aria-label="知识库说明"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[280px]">
                    会带进拆镜（导演、意图）和 Seedance 提交，并与进程里的 AUTO_DRAMA_KB_SNIPPET 合并。目前是手动粘贴。
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={knowledgeContext}
                onChange={(e) => setKnowledgeContext(e.target.value)}
                placeholder="世界观、人设原文…"
                className="min-h-[64px] resize-y border-white/10 bg-slate-900/80 text-xs text-slate-100 placeholder:text-slate-600"
              />
            </div>
            <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-2">
              <div className="text-[11px] font-medium text-slate-400">项目参考图库（URL / 本地图）</div>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={refUrlDraft}
                  onChange={(e) => setRefUrlDraft(e.target.value)}
                  placeholder="https://… 图片地址"
                  className="min-w-[160px] flex-1 border-white/10 bg-slate-900/80 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    addReferenceLibraryUrl(refUrlDraft);
                    setRefUrlDraft("");
                  }}
                >
                  添加 URL
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => refFileInputRef.current?.click()}
                >
                  上传图片
                </Button>
                <input
                  ref={refFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (f.size > 2_500_000) {
                      window.alert("图片过大（建议小于 2.5MB），请压缩或使用外链 URL。");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") addReferenceLibraryUrl(reader.result);
                    };
                    reader.readAsDataURL(f);
                  }}
                />
              </div>
              {referenceLibraryUrls.length > 0 && (
                <ul className="max-h-24 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                  {referenceLibraryUrls.map((u) => (
                    <li key={u} className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono" title={u}>
                        {u.slice(0, 48)}
                        {u.length > 48 ? "…" : ""}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-rose-400 hover:text-rose-300"
                        onClick={() => removeReferenceLibraryUrl(u)}
                      >
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <span>角色与画风一致（可选）</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                      aria-label="一致性说明"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[280px]">
                    提交生成时，服务端会把以上内容附加到每个镜头的 Seedance 提示词末尾，减轻角色漂移；关键镜头仍建议使用 reference 参考图。
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={consistencyNotes}
                onChange={(e) => setConsistencyNotes(e.target.value)}
                placeholder="人设与画风关键词…"
                className="min-h-[72px] resize-y border-white/10 bg-slate-900/80 text-xs text-slate-100 placeholder:text-slate-600"
              />
            </div>

            <div className="mt-3 space-y-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-2">
              <div className="text-[11px] font-medium text-indigo-200/90">
                Seedance 动漫生成策略（仅方舟 Seedance，用户自备 Key）
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="text-slate-500">画风预设</span>
                  <select
                    value={animeStylePreset}
                    onChange={(e) => setAnimeStylePreset(e.target.value)}
                    className="h-8 rounded-md border border-white/15 bg-slate-900 px-2 text-[11px] text-slate-200"
                  >
                    <option value="">默认（负面词 + 平台锁）</option>
                    <option value="cel_jp">日系赛璐璐</option>
                    <option value="guoman_paint">国漫厚涂</option>
                    <option value="ink_manga">古风水墨漫</option>
                    <option value="chibi">Q 版</option>
                  </select>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={animeMangaBoost}
                    onChange={(e) => setAnimeMangaBoost(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900"
                  />
                  漫画分镜语法
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={animeCrossShot}
                    onChange={(e) => setAnimeCrossShot(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900"
                  />
                  跨镜继承连贯
                </label>
              </div>
              <p className="text-[10px] leading-snug text-slate-500">
                服务端会在每条 prompt 注入画风锁定、漫画构图（可选）、崩脸/多肢等反向约束，再加平台动漫锁；不接第三方视频模型。
              </p>
            </div>

            <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-slate-400">动漫角色素材库</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7"
                  disabled={animeCharacters.length === 0}
                  onClick={() => {
                    const s = buildAnimeCharacterSnippet();
                    if (!s.trim()) return;
                    setConsistencyNotes((prev) => mergeCharacterSnippetIntoNotes(prev, s));
                  }}
                >
                  写入一致性文案
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={charNameDraft}
                  onChange={(e) => setCharNameDraft(e.target.value)}
                  placeholder="角色名"
                  className="min-w-[100px] flex-1 border-white/10 bg-slate-900/80 text-xs"
                />
                <Input
                  value={charSheetDraft}
                  onChange={(e) => setCharSheetDraft(e.target.value)}
                  placeholder="立绘 URL（可选）"
                  className="min-w-[140px] flex-[2] border-white/10 bg-slate-900/80 text-xs font-mono"
                />
              </div>
              <Textarea
                value={charNotesDraft}
                onChange={(e) => setCharNotesDraft(e.target.value)}
                placeholder="发色块、瞳色、服饰关键词…"
                className="min-h-[48px] resize-y border-white/10 bg-slate-900/80 text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => {
                  addAnimeCharacter({
                    name: charNameDraft,
                    sheetUrl: charSheetDraft,
                    notes: charNotesDraft,
                  });
                  setCharNameDraft("");
                  setCharSheetDraft("");
                  setCharNotesDraft("");
                }}
              >
                添加角色
              </Button>
              {animeCharacters.length > 0 && (
                <ul className="max-h-24 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                  {animeCharacters.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-2 rounded border border-white/5 bg-black/20 px-2 py-1">
                      <span className="min-w-0">
                        <span className="font-medium text-slate-300">{c.name}</span>
                        {c.sheetUrl ? (
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-600" title={c.sheetUrl}>
                            {c.sheetUrl.slice(0, 40)}…
                          </span>
                        ) : null}
                        {c.notes ? <span className="mt-0.5 block text-slate-500">{c.notes}</span> : null}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-rose-400 hover:text-rose-300"
                        onClick={() => removeAnimeCharacter(c.id)}
                      >
                        删
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {errorText && (
              <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
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

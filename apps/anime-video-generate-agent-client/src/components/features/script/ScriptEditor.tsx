import { Clapperboard, HelpCircle, Lightbulb, Loader2, Pencil, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { acquireSocketClient } from "@/lib/socket-client";
import { STORYBOARD_MAX_SHOT_CHOICES } from "@/lib/storyboard-limits";
import { cn } from "@/lib/utils";
import { ragStoryboardFromScript } from "@/lib/rag-storyboard";
import { webllmStoryboardFromScript } from "@/lib/webllm-storyboard";
import type { Shot } from "@/types";
import { useScriptReviewMutation, useStoryboardPreviewMutation } from "@/hooks/useAgentMutations";
import { useStoryboardPreviewProgressBar } from "@/hooks/useStoryboardPreviewProgressBar";
import { useStoryboardStore } from "@/store/storyboardStore";
import { useTaskStore } from "@/store/useTaskStore";

import type { AnimeStylePresetId, StoryboardPreviewShot } from "@/api/agent";

const PRESET_IDS: AnimeStylePresetId[] = ["cel_jp", "guoman_paint", "ink_manga", "chibi"];
import { ShotDetailModal } from "./ShotDetailModal";

async function ensureSocketConnected(socket: Socket): Promise<void> {
  if (socket.connected) return;
  await new Promise<void>((resolve, reject) => {
    const onOk = () => {
      socket.off("connect_error", onErr);
      resolve();
    };
    const onErr = (err: Error) => {
      socket.off("connect", onOk);
      reject(err);
    };
    socket.once("connect", onOk);
    socket.once("connect_error", onErr);
    socket.connect();
  });
}

async function subscribeProgressTask(
  socket: Socket,
  taskId: string,
  timeoutMs = 12_000
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("订阅拆镜进度超时")), timeoutMs);
    socket.emit(
      "subscribe-task",
      { taskId },
      (ack: { ok?: boolean; error?: string } | undefined) => {
        window.clearTimeout(t);
        if (ack?.ok) resolve();
        else reject(new Error(ack?.error || "无法订阅拆镜进度"));
      }
    );
  });
}

function previewRowsToShots(rows: StoryboardPreviewShot[]): Shot[] {
  const sorted = [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted.map((r, i) => ({
    id: uuidv4(),
    order: typeof r.order === "number" ? r.order : i + 1,
    description: r.description ?? "",
    prompt: r.prompt ?? "",
    status: "pending" as const,
    modelType: "seedance1.5pro",
    duration: typeof r.duration === "number" ? r.duration : 5,
    resolution:
      r.resolution === "480p" || r.resolution === "720p" || r.resolution === "1080p"
        ? r.resolution
        : "720p",
    ratio: r.ratio ?? "16:9",
    fps: typeof r.fps === "number" ? r.fps : 24,
  }));
}

export function ScriptEditor({
  onGenerateAll,
  onGenerateShot,
  script,
  onScriptChange,
  storyboardKnowledgeContext,
  storyboardConsistencyNotes,
  previewAnimeStylePreset,
  previewAnimeMangaBoost,
  previewAnimeCrossShot,
  storyboardMaxShots = 12,
  onStoryboardMaxShotsChange,
}: {
  onGenerateAll?: () => void;
  onGenerateShot?: (shotId: string) => void;
  script?: string;
  onScriptChange?: (v: string) => void;
  /** 拆镜可选附录（手动） */
  storyboardKnowledgeContext?: string;
  /** 与侧栏「角色与画风一致」同步，拆镜预览走同一 compose 层 */
  storyboardConsistencyNotes?: string;
  previewAnimeStylePreset?: string;
  previewAnimeMangaBoost?: boolean;
  previewAnimeCrossShot?: boolean;
  /** 服务端拆镜 Schema 最大镜头条数（与生成提交共用） */
  storyboardMaxShots?: number;
  onStoryboardMaxShotsChange?: (n: number) => void;
}) {
  const [localScript, setLocalScript] = useState<string>("");
  const text = script ?? localScript;
  const [detailShotId, setDetailShotId] = useState<string | null>(null);

  const setShots = useStoryboardStore((s) => s.setShots);
  const getOrCreateContextCacheKey = useStoryboardStore((s) => s.getOrCreateContextCacheKey);
  const selectShot = useTaskStore((s) => s.selectShot);
  const referenceLibraryUrls = useStoryboardStore((s) => s.referenceLibraryUrls);
  const reviewMutation = useScriptReviewMutation();
  const previewMutation = useStoryboardPreviewMutation({
    onSuccess: (data) => {
      const next = previewRowsToShots(data.shots);
      setShots(next);
      const first = next[0];
      if (first?.id) selectShot(first.id);
    },
  });

  const [splitPreviewProgress, setSplitPreviewProgress] = useState<number | null>(null);
  const [splitPreviewMessage, setSplitPreviewMessage] = useState<string | null>(null);
  const [previewChannelError, setPreviewChannelError] = useState<string | null>(null);

  const [webllmLoading, setWebllmLoading] = useState(false);

  const shots = useStoryboardStore((s) => s.shots);
  const selectedShotId = useTaskStore((s) => s.selectedShotId);
  const taskStatus = useTaskStore((s) => s.status);
  const taskProgress = useTaskStore((s) => s.progress);
  const taskProgressMessage = useTaskStore((s) => s.progressMessage);
  const isGenerating = taskStatus === "queued" || taskStatus === "running";

  const shotItems = useMemo(() => shots.slice().sort((a, b) => a.order - b.order), [shots]);
  const doneCount = useMemo(() => shotItems.filter((s) => s.videoUrl).length, [shotItems]);

  const reviewData = reviewMutation.data;
  const splittingShots = previewMutation.isPending;
  const smoothPreviewPct = useStoryboardPreviewProgressBar(splitPreviewProgress, splittingShots);
  const panelBusy = reviewMutation.isPending || previewMutation.isPending;
  const panelError = reviewMutation.error ?? previewMutation.error;

  const kb = storyboardKnowledgeContext?.trim();

  const runStoryboardPreview = async () => {
    setPreviewChannelError(null);
    setSplitPreviewProgress(null);
    setSplitPreviewMessage(null);
    const progressTaskId = uuidv4();
    const { socket, release } = acquireSocketClient();

    const handler = (evt: Record<string, unknown>) => {
      if (evt.taskId !== progressTaskId) return;
      if (evt.event === "storyboard-preview-stage") {
        if (typeof evt.progress === "number") setSplitPreviewProgress(evt.progress);
        if (typeof evt.message === "string") setSplitPreviewMessage(evt.message);
      } else if (evt.event === "storyboard-preview-error") {
        if (typeof evt.message === "string") setSplitPreviewMessage(evt.message);
      }
    };

    let subscribed = false;
    socket.on("progress-update", handler);

    const setupSocket = async () => {
      try {
        await ensureSocketConnected(socket);
        await subscribeProgressTask(socket, progressTaskId, 2800);
        subscribed = true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setPreviewChannelError(`进度订阅失败（${msg}），前几段进度可能看不到。`);
      }
    };

    const setupPromise = setupSocket();
    try {
      const cn = storyboardConsistencyNotes?.trim();
      const ps = previewAnimeStylePreset?.trim() ?? "";
      const presetOk = PRESET_IDS.includes(ps as AnimeStylePresetId)
        ? (ps as AnimeStylePresetId)
        : undefined;

      await previewMutation.mutateAsync({
        script: text,
        contextCacheKey: getOrCreateContextCacheKey(),
        ...(kb ? { knowledgeContext: kb } : {}),
        ...(cn ? { consistencyNotes: cn } : {}),
        ...(presetOk ? { animeStylePreset: presetOk } : {}),
        animePromptBoost: previewAnimeMangaBoost ? "manga_storyboard" : "none",
        inheritCrossShotStyle: previewAnimeCrossShot === true,
        storyboardMaxShots,
        progressTaskId,
      });
    } finally {
      await setupPromise.catch(() => {});
      socket.off("progress-update", handler);
      if (subscribed) {
        socket.emit("unsubscribe-task", { taskId: progressTaskId });
      }
      release();
      setSplitPreviewProgress(null);
      setSplitPreviewMessage(null);
    }
  };

  return (
    <section className="relative flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
      <ShotDetailModal
        shotId={detailShotId}
        open={detailShotId != null}
        onClose={() => setDetailShotId(null)}
        referenceLibraryUrls={referenceLibraryUrls}
        onGenerateShot={onGenerateShot}
        generatingDisabled={isGenerating || splittingShots}
      />

      {splittingShots && (
        <div
          className="pointer-events-auto absolute inset-0 z-[100] flex flex-col items-center gap-4 bg-slate-950/75 px-4 pt-[min(18vh,8rem)] backdrop-blur-[2px]"
          role="alert"
          aria-live="polite"
        >
          <Loader2 className="h-10 w-10 shrink-0 animate-spin text-indigo-400" aria-hidden />
          <div className="max-w-md text-center">
            <p className="text-sm font-medium text-slate-100">拆镜中</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">可能要几十秒到几分钟，别关页。</p>
          </div>
          <div className="relative h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-800/90 shadow-inner">
            <div
              className="h-full max-w-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 shadow-[0_0_14px_rgba(99,102,241,0.45)]"
              style={{
                width: `${Math.min(100, Math.max(1.5, smoothPreviewPct))}%`,
              }}
            />
          </div>
          <p className="max-w-md text-center text-[11px] text-slate-500">
            {`${Math.round(smoothPreviewPct)}%`}
            {splitPreviewMessage ? ` · ${splitPreviewMessage}` : ""}
            <span className="mt-1 block text-[10px] text-slate-600">阶段估算 + 本地平滑，不是视频生成的实时进度。</span>
          </p>
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-50">
            <span>剧本（动漫介质）</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-slate-500 hover:bg-white/5 hover:text-slate-300"
                  aria-label="剧本区说明"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-[min(92vw,320px)]">
                动漫二维/三维为主。可先「优化建议」再「拆分镜头」。列表点选镜头，「详情」里改 prompt、参考图、首尾帧。
              </TooltipContent>
            </Tooltip>
          </div>
          {isGenerating && (
            <div className="mt-1 text-xs text-slate-300">
              生成中：{taskProgress != null ? `${taskProgress}%` : "—"}{" "}
              {taskProgressMessage ? `· ${taskProgressMessage}` : ""}
            </div>
          )}
        </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="whitespace-nowrap text-slate-500">拆镜上限</span>
              <select
                value={storyboardMaxShots}
                disabled={panelBusy || splittingShots}
                onChange={(e) => onStoryboardMaxShotsChange?.(Number(e.target.value))}
                className="h-8 rounded-md border border-white/15 bg-slate-900 px-2 text-[11px] text-slate-200 disabled:opacity-50"
                title="单次结构化拆镜最多生成几条镜头"
              >
                {STORYBOARD_MAX_SHOT_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n} 条
                  </option>
                ))}
              </select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-slate-600 hover:bg-white/5 hover:text-slate-400"
                    aria-label="拆镜上限说明"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="max-w-[min(92vw,340px)] text-[11px] leading-relaxed">
                  数值越高，模型越能把剧情拆成更细的衔接镜（例如穿鞋→站起→开门→出门→沿路走→到校门口），类似提高{" "}
                  <span className="font-mono">ARK_STORYBOARD_MAX_SHOTS</span>。镜头越多，方舟对话拆镜与 Seedance
                  成片次数通常越多，对话 token 与视频计费会明显上升，总耗时也更长。运维可用环境变量{" "}
                  <span className="font-mono">ARK_STORYBOARD_ABS_MAX_SHOTS</span> 封顶单次上限。
                </TooltipContent>
              </Tooltip>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!text.trim() || panelBusy || splittingShots}
              onClick={() => reviewMutation.mutate(text)}
              className="gap-1.5"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              {reviewMutation.isPending ? "分析中…" : "优化建议"}
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={!text.trim() || panelBusy || splittingShots}
              onClick={() => void runStoryboardPreview()}
              className="gap-1.5"
            >
              <Clapperboard className="h-3.5 w-3.5" />
              {previewMutation.isPending ? "拆分中…" : "拆分镜头"}
            </Button>
          </div>
          <div className="flex max-w-[320px] items-start gap-1 text-[10px] leading-snug text-slate-500">
            <span className="min-w-0 flex-1">
              拆镜上限 {storyboardMaxShots} 条：越多越容易拆出过渡镜，但 Ark 与 Seedance 消耗更大。服务端{" "}
              <span className="font-mono">VOLC_AGENT_PIPELINE</span>
              ，与侧栏知识、环境 KB 合并。
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-full p-0.5 text-slate-600 hover:bg-white/5 hover:text-slate-400"
                  aria-label="拆镜说明"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[280px]">
                拆镜接口和 Socket 订阅并行，进度走 Socket。
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <Textarea
        value={text}
        readOnly={splittingShots}
        onChange={(e) => {
          const v = e.target.value;
          onScriptChange?.(v);
          setLocalScript(v);
        }}
        placeholder="写清楚场次、谁在干什么、节奏和情绪，分镜会稳一些。"
        className={cn("min-h-[180px] shrink-0 resize-y", splittingShots && "cursor-wait opacity-80")}
      />
      {!kb && (
        <p className="text-[11px] leading-relaxed text-slate-500">
          侧栏知识片段、参考图、画风开关会带进拆镜和生成；有 URL 比空口令靠谱。
        </p>
      )}

      {(previewChannelError || panelError) && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {previewChannelError ??
            (panelError instanceof Error ? panelError.message : String(panelError ?? ""))}
        </div>
      )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-0.5">
        <div className="flex flex-col gap-4 pb-2">
      {reviewData && (
        <div className="space-y-3 rounded-lg border border-indigo-500/20 bg-slate-900/80 p-4">
          {reviewData.summary?.trim() && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-indigo-300/90">概览</div>
              <p className="mt-1 text-sm leading-relaxed text-slate-100">{reviewData.summary}</p>
            </div>
          )}
          {reviewData.missing_visual_elements?.length ? (
            <div>
              <div className="text-xs font-medium text-amber-200/90">建议补充的画面信息</div>
              <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-slate-200">
                {reviewData.missing_visual_elements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {reviewData.format_notes?.length ? (
            <div>
              <div className="text-xs font-medium text-slate-400">格式 / 结构</div>
              <ul className="mt-1.5 space-y-1 text-sm text-slate-300">
                {reviewData.format_notes.map((s, i) => (
                  <li key={i} className="leading-relaxed">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {reviewData.suggestions?.length ? (
            <div>
              <div className="text-xs font-medium text-emerald-200/90">改写建议</div>
              <ul className="mt-1.5 space-y-1 text-sm text-slate-200">
                {reviewData.suggestions.map((s, i) => (
                  <li key={i} className="leading-relaxed">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <details className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
        <summary className="cursor-pointer select-none text-slate-300">本机拆镜（不走服务端）</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!text.trim() || splittingShots}
            onClick={() => setShots(ragStoryboardFromScript(text))}
            className="gap-1"
          >
            <Sparkles className="h-3.5 w-3.5" />
            RAG 拆镜
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!text.trim() || webllmLoading || splittingShots}
            onClick={async () => {
              setWebllmLoading(true);
              try {
                const next = await webllmStoryboardFromScript(text);
                setShots(next);
              } finally {
                setWebllmLoading(false);
              }
            }}
          >
            {webllmLoading ? "本地模型加载中…" : "WebGPU 拆镜"}
          </Button>
        </div>
      </details>

      <div className="mt-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-50">分镜总览</div>
            <div className="mt-0.5 text-xs text-slate-400">
              已生成视频 {doneCount}/{shotItems.length} · 列表轻量预览，点「详情」集中编辑
            </div>
          </div>
          {onGenerateAll && (
            <Button
              variant="secondary"
              size="sm"
              disabled={shotItems.length === 0 || isGenerating || splittingShots}
              onClick={onGenerateAll}
            >
              {isGenerating ? "生成中…" : "一键生成全部"}
            </Button>
          )}
        </div>

        <div className="mt-3 space-y-3">
          {shotItems.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-400">
              暂无镜头。先点「拆分镜头」，或用上面本机拆镜。
            </div>
          )}
          {shotItems.map((s) => (
            <div
              key={s.id}
              className={cn(
                "rounded-lg border border-white/10 bg-slate-900 p-3 transition-colors",
                selectedShotId === s.id && "ring-2 ring-indigo-500/80 shadow-[0_0_20px_-4px_rgba(99,102,241,0.45)]"
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-left text-sm font-semibold text-slate-50 hover:text-indigo-200 disabled:pointer-events-none disabled:opacity-50"
                  disabled={splittingShots}
                  onClick={() => selectShot(s.id)}
                >
                  镜头 {s.order}
                  <span className="ml-2 font-normal text-xs text-slate-500">选中 · 右侧预览</span>
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">{s.videoUrl ? "已有成片" : s.status}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={splittingShots}
                    onClick={() => {
                      selectShot(s.id);
                      setDetailShotId(s.id);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    详情
                  </Button>
                  {onGenerateShot && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isGenerating || splittingShots || !s.prompt?.trim()}
                      onClick={() => {
                        selectShot(s.id);
                        onGenerateShot(s.id);
                      }}
                    >
                      生成此镜
                    </Button>
                  )}
                </div>
              </div>

              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
                {s.description?.trim() || s.prompt.trim().slice(0, 160) || "（无摘要）"}
              </p>
            </div>
          ))}
        </div>
      </div>
        </div>
      </div>
    </section>
  );
}

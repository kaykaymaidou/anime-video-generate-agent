import { Download, Film } from "lucide-react";
import { useMemo } from "react";

import { AnimeVideoPlayer } from "@/components/features/video/AnimeVideoPlayer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStoryboardStore } from "@/store/storyboardStore";
import { useTaskStore } from "@/store/useTaskStore";

export type VideoPreviewProps = {
  /** FFmpeg 拼接后的 master，可在预览区播放与下载 */
  masterVideoUrl?: string | null;
  /** 服务端 agent-intent 摘要 */
  intentHint?: string | null;
};

export function VideoPreview({ masterVideoUrl, intentHint }: VideoPreviewProps) {
  const status = useTaskStore((s) => s.status);
  const activeVideoUrl = useTaskStore((s) => s.activeVideoUrl);
  const selectedShotId = useTaskStore((s) => s.selectedShotId);
  const selectShot = useTaskStore((s) => s.selectShot);
  const generationPendingShotIds = useTaskStore((s) => s.generationPendingShotIds);
  const progress = useTaskStore((s) => s.progress);
  const progressMessage = useTaskStore((s) => s.progressMessage);
  const shots = useStoryboardStore((s) => s.shots);
  const selectVideoTake = useStoryboardStore((s) => s.selectVideoTake);

  const sortedShots = useMemo(() => [...shots].sort((a, b) => a.order - b.order), [shots]);

  const selectedShot = useMemo(
    () => (selectedShotId ? shots.find((s) => s.id === selectedShotId) : undefined),
    [shots, selectedShotId]
  );

  const displayUrl = useMemo(() => {
    const fromShot = selectedShot?.videoUrl?.trim();
    if (fromShot) return fromShot;
    if (!selectedShotId) return activeVideoUrl?.trim() || null;
    return null;
  }, [activeVideoUrl, selectedShot, selectedShotId]);

  const isGlobalGenerating = status === "queued" || status === "running";
  const shotBusy =
    !!selectedShotId &&
    generationPendingShotIds.includes(selectedShotId) &&
    isGlobalGenerating;
  const durationSec = selectedShot?.duration ?? 5;

  const takeUrls = useMemo(() => {
    if (!selectedShot) return [];
    const pool = [...(selectedShot.videoTakeUrls ?? [])];
    const cur = selectedShot.videoUrl?.trim();
    if (cur && !pool.includes(cur)) pool.push(cur);
    return pool.filter(Boolean);
  }, [selectedShot]);

  return (
    <section className="relative flex h-full w-full flex-col overflow-hidden bg-black">
      <div className="shrink-0 space-y-2 border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur">
        {intentHint?.trim() && (
          <div className="rounded-md border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-[11px] leading-relaxed text-indigo-100">
            {intentHint}
          </div>
        )}

        {sortedShots.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]">
            {sortedShots.map((s) => {
              const sel = s.id === selectedShotId;
              const url = s.videoUrl?.trim();
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectShot(s.id)}
                  className={cn(
                    "relative flex w-[104px] shrink-0 flex-col overflow-hidden rounded-lg border bg-slate-950 text-left transition-colors",
                    sel ? "border-indigo-400 ring-2 ring-indigo-500/50" : "border-white/10 hover:border-white/25"
                  )}
                >
                  <div className="relative aspect-video w-full bg-black">
                    {url ? (
                      <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-900 text-[10px] text-slate-500">
                        镜 {s.order}
                      </div>
                    )}
                    {generationPendingShotIds.includes(s.id) && isGlobalGenerating && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-medium text-amber-200">
                        生成中
                      </div>
                    )}
                  </div>
                  <div className="truncate px-1.5 py-1 text-[10px] text-slate-400">
                    #{s.order}{" "}
                    <span className="text-slate-600">
                      {url ? "已就绪" : s.status === "generating" ? "…" : "待生成"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300">
            {selectedShot ? (
              <>
                <span className="font-semibold text-slate-50">镜头 {selectedShot.order}</span>
                <span className="mx-2 text-slate-600">·</span>
                <span>Seedance · 仅动漫</span>
                <span className="mx-2 text-slate-600">·</span>
                <span>单镜约 {durationSec}s</span>
                {displayUrl ? (
                  <span className="ml-2 text-emerald-400/90">已就绪</span>
                ) : shotBusy ? (
                  <span className="ml-2 text-amber-300/90">生成中…</span>
                ) : (
                  <span className="ml-2 text-slate-500">暂无成片</span>
                )}
              </>
            ) : (
              <span className="text-slate-400">点击上方缩略图选中镜头 · 右侧为主播放器</span>
            )}
          </div>
          <div className="text-xs text-slate-500 sm:ml-auto">任务：{status}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          {masterVideoUrl?.trim() && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                  <Film className="h-4 w-4" />
                  合成成片（FFmpeg）
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 border-emerald-500/30 text-emerald-100" asChild>
                  <a href={masterVideoUrl} download target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5" />
                    下载
                  </a>
                </Button>
              </div>
              <AnimeVideoPlayer src={masterVideoUrl.trim()} title="合成成片" />
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-medium text-slate-400">当前镜头</div>
            {displayUrl ? (
              <div className="space-y-3">
                <AnimeVideoPlayer src={displayUrl} title={`镜头 ${selectedShot?.order ?? ""}`} />
                {takeUrls.length > 1 && selectedShot && (
                  <div className="rounded-lg border border-white/10 bg-slate-950/80 p-3">
                    <div className="mb-2 text-[11px] font-medium text-slate-400">
                      同镜多版（{takeUrls.length}）· 点击切换定稿
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {takeUrls.map((u, i) => (
                        <Button
                          key={`${u}-${i}`}
                          type="button"
                          variant={selectedShot.videoUrl?.trim() === u ? "default" : "outline"}
                          size="sm"
                          className="text-xs"
                          title={u}
                          onClick={() => selectVideoTake(selectedShot.id, u)}
                        >
                          版本 {i + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/40 p-10 text-center">
                <div className="text-sm font-semibold text-slate-50">主播放器</div>
                <div className="mt-2 text-xs leading-relaxed text-slate-400">
                  {selectedShot
                    ? shotBusy
                      ? "该镜头正在排队或生成中，完成后会自动出现在此处。"
                      : "该镜头还没有成片。可在左侧编辑 Prompt 后点击「生成此镜」，或使用「一键生成全部」。"
                    : "请先在上方选中一个镜头；每段成片可再在左侧点击「FFmpeg 合成成片」拼接下载。"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {shotBusy && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 p-6">
          <div className="pointer-events-none w-full max-w-md rounded-lg border border-white/10 bg-slate-950/85 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-50">
                正在为镜头 {selectedShot?.order ?? "—"} 生成视频…
              </div>
              <div className="text-xs text-slate-400">{progress != null ? `${progress}%` : "—"}</div>
            </div>
            <div className="mt-2 text-xs text-slate-300">
              {progressMessage ?? "已提交任务，等待火山引擎返回结果"}
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-indigo-500 transition-[width] duration-500"
                style={{ width: `${progress ?? 12}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

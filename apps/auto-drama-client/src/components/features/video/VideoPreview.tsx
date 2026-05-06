import { Play, Square } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/store/useTaskStore";

export function VideoPreview() {
  const status = useTaskStore((s) => s.status);
  const url = useTaskStore((s) => s.activeVideoUrl);
  const events = useTaskStore((s) => s.events);
  const progress = useTaskStore((s) => s.progress);
  const progressMessage = useTaskStore((s) => s.progressMessage);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isGenerating = status === "queued" || status === "running";

  return (
    <section className="relative h-full w-full overflow-hidden bg-black">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className={cn(status === "running" && "shadow-glow")}
          onClick={() => void videoRef.current?.play()}
        >
          <Play />
          播放
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            v.pause();
            v.currentTime = 0;
          }}
        >
          <Square />
          停止
        </Button>
        <div className="ml-2 text-xs text-slate-400">状态：{status}</div>
      </div>

      <div className="flex h-full w-full items-center justify-center p-6">
        {url ? (
          <video
            ref={videoRef}
            className="max-h-full w-full max-w-4xl rounded-lg border border-white/10 bg-black shadow-sm"
            src={url}
            controls
          />
        ) : (
          <div className="w-full max-w-4xl rounded-lg border border-white/10 bg-black/40 p-10 text-center">
            <div className="text-sm font-semibold text-slate-50">影院预览区</div>
            <div className="mt-2 text-xs text-slate-400">
              选择一个镜头或等待生成完成后，在此显示视频预览。
            </div>
          </div>
        )}
      </div>

      {isGenerating && !url && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-none w-full max-w-4xl rounded-lg border border-white/10 bg-slate-950/60 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-50">正在生成视频…</div>
              <div className="text-xs text-slate-400">{progress != null ? `${progress}%` : "—"}</div>
            </div>
            <div className="mt-2 text-xs text-slate-300">{progressMessage ?? "已提交任务，等待火山引擎返回结果"}</div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-indigo-500 transition-[width] duration-500"
                style={{ width: `${progress ?? 12}%` }}
              />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="h-24 animate-pulse rounded-md bg-white/5" />
              <div className="h-24 animate-pulse rounded-md bg-white/5" />
              <div className="h-24 animate-pulse rounded-md bg-white/5" />
            </div>
          </div>
        </div>
      )}

      <aside className="absolute bottom-4 right-4 z-10 w-[420px] max-w-[calc(100%-2rem)] rounded-lg border border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <div className="text-xs font-semibold text-slate-200">运行日志</div>
          <div className="text-[11px] text-slate-400">最近 {Math.min(events.length, 80)} 条</div>
        </div>
        <div className="max-h-[260px] overflow-auto px-3 py-2">
          {events.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">等待事件…</div>
          ) : (
            <div className="space-y-1">
              {events.slice(-80).map((e, i) => {
                const head = [e.event, e.progress != null ? `${e.progress}%` : null, e.shotId ? `shot=${e.shotId}` : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={`${e.ts}-${i}`} className="rounded-md bg-white/5 px-2 py-1">
                    <div className="text-[11px] text-slate-300">{head || "event"}</div>
                    {e.message && <div className="text-[11px] text-slate-400">{e.message}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}


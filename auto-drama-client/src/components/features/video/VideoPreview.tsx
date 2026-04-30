import { Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/store/useTaskStore";

export function VideoPreview() {
  const status = useTaskStore((s) => s.status);
  const url = useTaskStore((s) => s.activeVideoUrl);

  return (
    <section className="relative h-full w-full overflow-hidden bg-black">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <Button variant="secondary" size="sm" className={cn(status === "running" && "shadow-glow")}>
          <Play />
          播放
        </Button>
        <Button variant="outline" size="sm">
          <Square />
          停止
        </Button>
        <div className="ml-2 text-xs text-slate-400">状态：{status}</div>
      </div>

      <div className="flex h-full w-full items-center justify-center p-6">
        {url ? (
          <video
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
    </section>
  );
}


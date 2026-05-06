import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ModelType } from "@/types";

type Resolution = "480p" | "720p" | "1080p";

export interface TextToVideoPanelProps {
  className?: string;
  submitting?: boolean;
  onSubmit: (payload: {
    prompt: string;
    modelType: ModelType;
    duration: number;
    resolution: Resolution;
    ratio: string;
    fps: number;
    seed?: number;
    watermark: boolean;
    camera_fixed: boolean;
  }) => void;
}

export function TextToVideoPanel({ className, submitting, onSubmit }: TextToVideoPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [modelType] = useState<ModelType>("seedance1.5pro");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [ratio, setRatio] = useState("16:9");
  const [fps, setFps] = useState(24);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [watermark, setWatermark] = useState(false);
  const [cameraFixed, setCameraFixed] = useState(false);

  const disabledReason = useMemo(() => {
    if (!prompt.trim()) return "请输入画面描述";
    return null;
  }, [prompt]);

  return (
    <section className={cn("flex flex-col gap-4 p-4", className)}>
      <div>
        <h2 className="text-lg font-semibold text-slate-50">文生视频</h2>
        <p className="mt-1 text-xs text-slate-400">将提示词交给后端智能体编排，并调用火山 Seedance 生成视频。</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-300">提示词</label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={12}
          placeholder="示例：黄昏天台，女主角回望镜头，电影感光晕，缓慢推进..."
          className="resize-none bg-black/30 text-sm text-slate-100 placeholder:text-slate-600"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-400">模型</label>
          <div className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-100">
            Seedance 1.5 Pro
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">时长（秒）</label>
          <select
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-100"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6, 8, 10, 12].map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">分辨率</label>
          <select
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-100"
            value={resolution}
            onChange={(e) => setResolution(e.target.value as Resolution)}
          >
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">画幅</label>
          <select
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-100"
            value={ratio}
            onChange={(e) => setRatio(e.target.value)}
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">FPS</label>
          <select
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-100"
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
          >
            {[12, 16, 24, 30].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Seed（可选）</label>
          <input
            className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-100"
            value={seed ?? ""}
            inputMode="numeric"
            placeholder="留空=随机"
            onChange={(e) => {
              const v = e.target.value.trim();
              if (!v) return setSeed(undefined);
              const n = Number(v);
              if (Number.isFinite(n)) setSeed(n);
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
          水印
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={cameraFixed} onChange={(e) => setCameraFixed(e.target.checked)} />
          运镜锁定
        </label>
      </div>

      <Button
        type="button"
        className="w-full"
        disabled={!!disabledReason || submitting}
        onClick={() =>
          onSubmit({
            prompt: prompt.trim(),
            modelType,
            duration,
            resolution,
            ratio,
            fps,
            seed,
            watermark,
            camera_fixed: cameraFixed
          })
        }
      >
        {submitting ? "生成中…" : disabledReason ?? "生成视频"}
      </Button>
    </section>
  );
}


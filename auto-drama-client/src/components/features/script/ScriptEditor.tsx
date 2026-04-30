import { Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useScriptOptimization } from "@/hooks/useScriptOptimization";
import { useStoryboardStore } from "@/store/storyboardStore";
import { useTaskStore } from "@/store/useTaskStore";

export function ScriptEditor() {
  const [script, setScript] = useState<string>("");
  const { loading, result, optimize } = useScriptOptimization();

  const shots = useStoryboardStore((s) => s.shots);
  const selectShot = useTaskStore((s) => s.selectShot);
  const selectedShotId = useTaskStore((s) => s.selectedShotId);

  const shotItems = useMemo(() => shots.slice().sort((a, b) => a.order - b.order), [shots]);

  return (
    <section className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-50">剧本</div>
          <div className="text-xs text-slate-400">输入剧情与节奏，后续可用 Ark 进行优化与拆镜</div>
        </div>
        <Button
          variant="default"
          size="sm"
          disabled={loading}
          onClick={() => optimize(script)}
          className={cn(loading && "shadow-glow")}
        >
          <Wand2 />
          AI 优化
        </Button>
      </div>

      <Textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="在这里粘贴或撰写剧本。建议包含角色、场景、冲突、节奏提示…"
        className="min-h-[220px]"
      />

      {result && (
        <div className="rounded-lg border border-white/10 bg-slate-900 p-4">
          <div className="text-xs font-medium text-slate-400">优化建议</div>
          <ul className="mt-2 space-y-1 text-sm text-slate-200">
            {result.suggestions.map((s, i) => (
              <li key={i} className="leading-relaxed">
                - {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-50">分镜列表</div>
          <div className="text-xs text-slate-400">{shotItems.length} 个镜头</div>
        </div>
        <div className="mt-2 space-y-2">
          {shotItems.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-400">
              暂无分镜。可先进入“分镜编辑”页创建镜头，或后续接入剧本拆镜自动生成。
            </div>
          )}
          {shotItems.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectShot(s.id)}
              className={cn(
                "w-full rounded-lg border border-white/10 bg-slate-900 p-3 text-left transition-colors",
                "hover:border-indigo-500/50",
                selectedShotId === s.id && "ring-2 ring-indigo-500 shadow-glow"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-50">
                  {s.order}. {s.id}
                </div>
                <div className="text-xs text-slate-400">{s.status}</div>
              </div>
              <div className="mt-2 line-clamp-2 text-xs text-slate-400">{s.prompt || "（未填写 Prompt）"}</div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}


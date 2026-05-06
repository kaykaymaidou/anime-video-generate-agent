import { Cpu, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ragStoryboardFromScript } from "@/lib/rag-storyboard";
import { webllmStoryboardFromScript } from "@/lib/webllm-storyboard";
import { useScriptOptimization } from "@/hooks/useScriptOptimization";
import { useStoryboardStore } from "@/store/storyboardStore";
import { useTaskStore } from "@/store/useTaskStore";

export function ScriptEditor({
  onGenerateAll,
  onGenerateShot,
  script,
  onScriptChange,
}: {
  onGenerateAll?: () => void;
  onGenerateShot?: (shotId: string) => void;
  script?: string;
  onScriptChange?: (v: string) => void;
}) {
  const [localScript, setLocalScript] = useState<string>("");
  const text = script ?? localScript;
  const { loading, result, optimize } = useScriptOptimization();
  const [webllmLoading, setWebllmLoading] = useState(false);

  const shots = useStoryboardStore((s) => s.shots);
  const setShots = useStoryboardStore((s) => s.setShots);
  const selectShot = useTaskStore((s) => s.selectShot);
  const selectedShotId = useTaskStore((s) => s.selectedShotId);
  const taskStatus = useTaskStore((s) => s.status);
  const taskProgress = useTaskStore((s) => s.progress);
  const taskProgressMessage = useTaskStore((s) => s.progressMessage);
  const isGenerating = taskStatus === "queued" || taskStatus === "running";

  const shotItems = useMemo(() => shots.slice().sort((a, b) => a.order - b.order), [shots]);
  const doneCount = useMemo(() => shotItems.filter((s) => s.videoUrl).length, [shotItems]);

  return (
    <section className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-50">剧本</div>
          <div className="text-xs text-slate-400">输入剧情与节奏，后续可用 Ark 进行优化与拆镜</div>
          {isGenerating && (
            <div className="mt-1 text-xs text-slate-300">
              生成中：{taskProgress != null ? `${taskProgress}%` : "—"} {taskProgressMessage ? `· ${taskProgressMessage}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!text.trim()}
            onClick={() => {
              const next = ragStoryboardFromScript(text);
              setShots(next);
            }}
          >
            <Sparkles />
            RAG 拆镜
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!text.trim() || webllmLoading}
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
            <Cpu />
            {webllmLoading ? "本地模型加载中…" : "本地模型拆镜"}
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={loading}
            onClick={() => optimize(text)}
            className={cn(loading && "shadow-glow")}
          >
            <Wand2 />
            AI 优化
          </Button>
        </div>
      </div>

      <Textarea
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          onScriptChange?.(v);
          setLocalScript(v);
        }}
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
          <div>
            <div className="text-sm font-semibold text-slate-50">分镜总览</div>
            <div className="mt-0.5 text-xs text-slate-400">
              已生成 {doneCount}/{shotItems.length} 镜头
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">{shotItems.length} 个镜头</div>
            {onGenerateAll && (
              <Button
                variant="secondary"
                size="sm"
                disabled={shotItems.length === 0 || isGenerating}
                onClick={onGenerateAll}
              >
                {isGenerating ? "生成中…" : "一键生成"}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 space-y-2">
          {shotItems.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-400">
              暂无分镜。可先进入“分镜编辑”页创建镜头，或后续接入剧本拆镜自动生成。
            </div>
          )}
          {shotItems.map((s) => (
            <div
              key={s.id}
              onClick={() => selectShot(s.id)}
              className={cn(
                "w-full rounded-lg border border-white/10 bg-slate-900 p-3 text-left transition-colors",
                "hover:border-indigo-500/50",
                selectedShotId === s.id && "ring-2 ring-indigo-500 shadow-glow"
              )}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") selectShot(s.id);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-50">
                  镜头 {s.order}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-400">{s.videoUrl ? "已生成" : s.status}</div>
                  {onGenerateShot && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onGenerateShot(s.id);
                      }}
                    >
                      生成
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-2 line-clamp-2 text-xs text-slate-400">{s.prompt || "（未填写 Prompt）"}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


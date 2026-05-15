import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEditorWorkspace } from "@/contexts/editor-workspace-context";

/** 侧栏顶栏：仅依赖工作区上下文，不向页面索要长 props 列表。 */
export function EditorAsideToolbar() {
  const w = useEditorWorkspace();
  const ti = w.timelineImport;
  const err = w.errors;

  return (
    <div className="shrink-0 space-y-2 border-b border-white/10 bg-slate-950 px-3 py-2.5">
      <div>
        <div className="text-sm font-semibold text-slate-50">工作区 · 动漫成片</div>
        <p className="mt-0.5 text-[10px] leading-snug text-indigo-300/90">
          仅二维/三维动漫；侧栏专注剧本与分镜，资源与策略请点「详细设置」从右侧抽屉打开。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => ti.inputRef.current?.click()}>
          导入时间线
        </Button>
        <input
          ref={ti.inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={ti.onFileChange}
        />
        <Button type="button" variant="outline" size="sm" className="text-xs" onClick={ti.exportTimelineJson}>
          导出 JSON
        </Button>
        <Button type="button" variant="secondary" size="sm" className="text-xs gap-1.5" onClick={w.sheet.openStrategy}>
          详细设置
          {w.workspaceBadgeCount > 0 ? (
            <Badge variant="outline" className="border-indigo-400/40 px-1.5 py-0 text-[10px] text-indigo-200">
              {w.workspaceBadgeCount}
            </Badge>
          ) : null}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-slate-400 hover:text-slate-100"
          onClick={w.sheet.openConcat}
        >
          成片合成…
        </Button>
        <span className="text-[11px] text-slate-500">{w.generation.submitting ? "生成中" : "就绪"}</span>
      </div>
      {(w.preview.masterVideoUrl || w.concat.timelineError) && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          {w.concat.timelineError ? (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-100">
              合成失败 — 打开「成片合成」抽屉查看详情
            </span>
          ) : null}
          {w.preview.masterVideoUrl ? (
            <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-100">
              已有 master 链接 —{" "}
              <button
                type="button"
                className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                onClick={w.sheet.openConcat}
              >
                在抽屉中打开
              </button>
            </span>
          ) : null}
        </div>
      )}
      {err.text && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <div className="font-medium text-rose-100">{err.text}</div>
          {err.hint && <div className="mt-1.5 leading-relaxed text-rose-200/90">{err.hint}</div>}
          {(err.code || err.codeN) && (
            <div className="mt-1 font-mono text-[10px] text-rose-300/80">
              {err.code && <span>错误码：{err.code}</span>}
              {err.code && err.codeN && <span className="mx-1 text-rose-400/50">·</span>}
              {err.codeN && <span>CodeN：{err.codeN}</span>}
            </div>
          )}
          {err.docUrl && (
            <a
              href={err.docUrl}
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
  );
}

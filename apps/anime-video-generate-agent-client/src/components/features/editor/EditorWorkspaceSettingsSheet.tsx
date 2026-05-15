import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEditorWorkspace } from "@/contexts/editor-workspace-context";
import { mergeCharacterSnippetIntoNotes } from "@/store/animeCharacterStore";

/** 创作抽屉：通过 EditorWorkspaceProvider 取数据，页面不再传递数十个 props。 */
export function EditorWorkspaceSettingsSheet() {
  const w = useEditorWorkspace();
  const sh = w.sheet;
  const sb = w.storyboard;
  const fm = w.form;
  const cc = w.concat;
  const gen = w.generation;
  const snap = w.snapshotUi;
  const ch = w.charactersUi;
  const rf = w.refsUi;
  const tk = w.task;

  return (
    <Sheet open={sh.open} onOpenChange={sh.setOpen}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="shrink-0 space-y-1">
          <SheetTitle>创作资源与生成设置</SheetTitle>
          <SheetDescription>
            快照、知识库、参考图、Seedance 策略与角色库；成片合成在最后一栏。关闭抽屉后设置仍会保留。
          </SheetDescription>
        </SheetHeader>

        <Tabs value={sh.tab} onValueChange={sh.setTab} className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-0">
          <TabsList className="h-auto shrink-0 flex-wrap justify-start gap-1 bg-slate-900/90 p-1">
            <TabsTrigger value="snapshot" className="text-xs">
              项目快照
            </TabsTrigger>
            <TabsTrigger value="context" className="text-xs">
              知识与人设
            </TabsTrigger>
            <TabsTrigger value="refs" className="text-xs">
              参考图库
            </TabsTrigger>
            <TabsTrigger value="strategy" className="text-xs">
              生成策略
            </TabsTrigger>
            <TabsTrigger value="characters" className="text-xs">
              角色库
            </TabsTrigger>
            <TabsTrigger value="concat" className="text-xs">
              成片合成
            </TabsTrigger>
          </TabsList>

          <TabsContent value="snapshot" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 outline-none">
            <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <div className="text-[11px] font-medium text-slate-400">动漫项目快照（剧本 + 分镜 + 侧栏文案）</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  value={snap.labelDraft}
                  onChange={(e) => snap.setLabelDraft(e.target.value)}
                  placeholder="快照名称…"
                  className="min-w-[140px] flex-1 border-white/10 bg-slate-900/80 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    sb.saveAnimeProjectSnapshot(snap.labelDraft, {
                      shots: sb.shots,
                      referenceLibraryUrls: sb.referenceLibraryUrls,
                      script: fm.script,
                      consistencyNotes: fm.consistencyNotes,
                      knowledgeContext: fm.knowledgeContext,
                    });
                    snap.setLabelDraft("");
                  }}
                >
                  保存快照
                </Button>
              </div>
              {sb.animeProjectSnapshots.length > 0 && (
                <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                  {sb.animeProjectSnapshots.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/5 bg-black/20 px-2 py-1.5"
                    >
                      <span className="min-w-0 truncate font-medium text-slate-300" title={s.label}>
                        {s.label}
                      </span>
                      <span className="shrink-0 text-slate-600">
                        {new Date(s.createdAt).toLocaleString("zh-CN", { hour12: false })}
                      </span>
                      <span className="flex w-full shrink-0 justify-end gap-2 sm:w-auto">
                        <button
                          type="button"
                          className="text-sky-400 hover:text-sky-300"
                          onClick={() => {
                            if (!window.confirm(`恢复快照「${s.label}」？未另存的分镜与剧本会被覆盖。`)) {
                              return;
                            }
                            const restored = sb.restoreAnimeProjectSnapshot(s.id);
                            if (!restored) return;
                            fm.setScript(restored.script);
                            fm.setConsistencyNotes(restored.consistencyNotes);
                            fm.setKnowledgeContext(restored.knowledgeContext);
                            const first = restored.shots[0];
                            if (first?.id) tk.selectShot(first.id);
                          }}
                        >
                          恢复
                        </button>
                        <button
                          type="button"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => {
                            if (!window.confirm(`删除快照「${s.label}」？`)) return;
                            sb.deleteAnimeProjectSnapshot(s.id);
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
          </TabsContent>

          <TabsContent value="context" className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 outline-none">
            <div className="space-y-1.5">
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
                    会带进拆镜（导演、意图）和 Seedance 提交，并与进程里的 AUTO_DRAMA_KB_SNIPPET 合并。
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={fm.knowledgeContext}
                onChange={(e) => fm.setKnowledgeContext(e.target.value)}
                placeholder="世界观、人设原文…"
                className="min-h-[100px] resize-y border-white/10 bg-slate-900/80 text-xs text-slate-100 placeholder:text-slate-600"
              />
            </div>
            <div className="space-y-1.5">
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
                    提交生成时附加到每条 Seedance 提示词末尾；关键镜头建议配合参考图。
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={fm.consistencyNotes}
                onChange={(e) => fm.setConsistencyNotes(e.target.value)}
                placeholder="人设与画风关键词…"
                className="min-h-[100px] resize-y border-white/10 bg-slate-900/80 text-xs text-slate-100 placeholder:text-slate-600"
              />
            </div>
          </TabsContent>

          <TabsContent value="refs" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 outline-none">
            <div className="space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <div className="text-[11px] font-medium text-slate-400">项目参考图库（URL / 本地图）</div>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={rf.urlDraft}
                  onChange={(e) => rf.setUrlDraft(e.target.value)}
                  placeholder="https://… 图片地址"
                  className="min-w-[160px] flex-1 border-white/10 bg-slate-900/80 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    sb.addReferenceLibraryUrl(rf.urlDraft);
                    rf.setUrlDraft("");
                  }}
                >
                  添加 URL
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => rf.fileInputRef.current?.click()}
                >
                  上传图片
                </Button>
                <input
                  ref={rf.fileInputRef}
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
                      if (typeof reader.result === "string") sb.addReferenceLibraryUrl(reader.result);
                    };
                    reader.readAsDataURL(f);
                  }}
                />
              </div>
              {sb.referenceLibraryUrls.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                  {sb.referenceLibraryUrls.map((u) => (
                    <li key={u} className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono" title={u}>
                        {u.slice(0, 56)}
                        {u.length > 56 ? "…" : ""}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-rose-400 hover:text-rose-300"
                        onClick={() => sb.removeReferenceLibraryUrl(u)}
                      >
                        移除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="strategy" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 outline-none">
            <div className="space-y-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
              <div className="text-[11px] font-medium text-indigo-200/90">
                Seedance 动漫生成策略（仅方舟 Seedance，用户自备 Key）
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="text-slate-500">画风预设</span>
                  <select
                    value={fm.animeStylePreset}
                    onChange={(e) => fm.setAnimeStylePreset(e.target.value)}
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
                    checked={fm.animeMangaBoost}
                    onChange={(e) => fm.setAnimeMangaBoost(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900"
                  />
                  漫画分镜语法
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={fm.animeCrossShot}
                    onChange={(e) => fm.setAnimeCrossShot(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900"
                  />
                  跨镜继承连贯
                </label>
              </div>
              <p className="text-[10px] leading-snug text-slate-500">
                服务端在每条 prompt 注入画风锁定、漫画构图（可选）、反向约束与平台动漫锁；不接第三方视频模型。
                需要更细的「动作衔接镜」（如穿鞋→开门→上路→到校）时，请到剧本区「拆分镜头」旁调高{" "}
                <span className="font-medium text-slate-400">拆镜上限</span>
                （档位数越大，方舟拆镜与 Seedance 调用越多，费用与耗时会显著增加）。
              </p>
            </div>
          </TabsContent>

          <TabsContent value="characters" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 outline-none">
            <div className="space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-slate-400">动漫角色素材库</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7"
                  disabled={ch.list.length === 0}
                  onClick={() => {
                    const s = ch.buildSnippet();
                    if (!s.trim()) return;
                    fm.setConsistencyNotes((prev) => mergeCharacterSnippetIntoNotes(prev, s));
                  }}
                >
                  写入一致性文案
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={ch.nameDraft}
                  onChange={(e) => ch.setNameDraft(e.target.value)}
                  placeholder="角色名"
                  className="min-w-[100px] flex-1 border-white/10 bg-slate-900/80 text-xs"
                />
                <Input
                  value={ch.sheetDraft}
                  onChange={(e) => ch.setSheetDraft(e.target.value)}
                  placeholder="立绘 URL（可选）"
                  className="min-w-[140px] flex-[2] border-white/10 bg-slate-900/80 text-xs font-mono"
                />
              </div>
              <Textarea
                value={ch.notesDraft}
                onChange={(e) => ch.setNotesDraft(e.target.value)}
                placeholder="发色块、瞳色、服饰关键词…"
                className="min-h-[56px] resize-y border-white/10 bg-slate-900/80 text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => {
                  ch.add({
                    name: ch.nameDraft,
                    sheetUrl: ch.sheetDraft,
                    notes: ch.notesDraft,
                  });
                  ch.setNameDraft("");
                  ch.setSheetDraft("");
                  ch.setNotesDraft("");
                }}
              >
                添加角色
              </Button>
              {ch.list.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                  {ch.list.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-2 rounded border border-white/5 bg-black/20 px-2 py-1"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-slate-300">{c.name}</span>
                        {c.sheetUrl ? (
                          <span
                            className="mt-0.5 block truncate font-mono text-[10px] text-slate-600"
                            title={c.sheetUrl}
                          >
                            {c.sheetUrl.slice(0, 40)}…
                          </span>
                        ) : null}
                        {c.notes ? <span className="mt-0.5 block text-slate-500">{c.notes}</span> : null}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-rose-400 hover:text-rose-300"
                        onClick={() => ch.remove(c.id)}
                      >
                        删
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="concat" className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 outline-none">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-500">转场</span>
              <select
                value={cc.transition}
                onChange={(e) => cc.setTransition(e.target.value)}
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
                disabled={cc.clips.length < 2 || cc.timelinePending || gen.submitting}
                title="服务端 FFmpeg；淡入淡出需重编码，成片无音轨"
                onClick={cc.runConcatMaster}
              >
                {cc.timelinePending ? "合成中…" : "FFmpeg 合成成片"}
              </Button>
              <span className="text-[11px] text-slate-500">已选 {cc.clips.length} 段有效成片 URL</span>
            </div>
            {cc.timelineError && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                合成失败：
                {cc.timelineError instanceof Error ? cc.timelineError.message : String(cc.timelineError)}
              </div>
            )}
            {cc.masterVideoUrl && (
              <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
                <div className="font-medium text-emerald-50">已生成 master（{cc.clips.length} 段拼接）</div>
                <a
                  href={cc.masterVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all text-sky-400 underline underline-offset-2 hover:text-sky-300"
                >
                  {cc.masterVideoUrl}
                </a>
              </div>
            )}
            <p className="text-[10px] leading-relaxed text-slate-500">
              依赖本机 / 服务端 FFmpeg；成片链接也会在右侧预览区可用。
            </p>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

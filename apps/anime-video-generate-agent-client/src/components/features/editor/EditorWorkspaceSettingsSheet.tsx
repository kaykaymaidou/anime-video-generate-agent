import type { RefObject } from "react";
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
import {
  mergeCharacterSnippetIntoNotes,
  type AnimeCharacterCard,
} from "@/store/animeCharacterStore";
import type { AnimeProjectSnapshot } from "@/store/storyboardStore";
import type { Shot } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: string;
  onTabChange: (tab: string) => void;
  shots: Shot[];
  script: string;
  referenceLibraryUrls: string[];
  consistencyNotes: string;
  setConsistencyNotes: (v: string | ((prev: string) => string)) => void;
  knowledgeContext: string;
  setKnowledgeContext: (v: string) => void;
  animeStylePreset: string;
  setAnimeStylePreset: (v: string) => void;
  animeMangaBoost: boolean;
  setAnimeMangaBoost: (v: boolean) => void;
  animeCrossShot: boolean;
  setAnimeCrossShot: (v: boolean) => void;
  concatTransition: string;
  setConcatTransition: (v: string) => void;
  concatClips: { order: number; url: string }[];
  concatTimelinePending: boolean;
  concatTimelineError: unknown;
  submitting: boolean;
  masterVideoUrl: string | null;
  onConcatSubmit: () => void;
  animeProjectSnapshots: AnimeProjectSnapshot[];
  snapshotLabelDraft: string;
  setSnapshotLabelDraft: (v: string) => void;
  saveAnimeProjectSnapshot: (
    label: string,
    payload: {
      shots: Shot[];
      referenceLibraryUrls: string[];
      script: string;
      consistencyNotes: string;
      knowledgeContext: string;
    },
  ) => void;
  restoreAnimeProjectSnapshot: (id: string) => AnimeProjectSnapshot | null;
  deleteAnimeProjectSnapshot: (id: string) => void;
  selectShot: (id: string | null) => void;
  setScript: (s: string) => void;
  animeCharacters: AnimeCharacterCard[];
  charNameDraft: string;
  setCharNameDraft: (v: string) => void;
  charSheetDraft: string;
  setCharSheetDraft: (v: string) => void;
  charNotesDraft: string;
  setCharNotesDraft: (v: string) => void;
  addAnimeCharacter: (c: Omit<AnimeCharacterCard, "id">) => void;
  removeAnimeCharacter: (id: string) => void;
  buildAnimeCharacterSnippet: () => string;
  refUrlDraft: string;
  setRefUrlDraft: (v: string) => void;
  addReferenceLibraryUrl: (u: string) => void;
  removeReferenceLibraryUrl: (u: string) => void;
  refFileInputRef: RefObject<HTMLInputElement | null>;
};

export function EditorWorkspaceSettingsSheet(p: Props) {
  return (
    <Sheet open={p.open} onOpenChange={p.onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="shrink-0 space-y-1">
          <SheetTitle>创作资源与生成设置</SheetTitle>
          <SheetDescription>
            快照、知识库、参考图、Seedance 策略与角色库；成片合成在最后一栏。关闭抽屉后设置仍会保留。
          </SheetDescription>
        </SheetHeader>

        <Tabs value={p.tab} onValueChange={p.onTabChange} className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-0">
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
                  value={p.snapshotLabelDraft}
                  onChange={(e) => p.setSnapshotLabelDraft(e.target.value)}
                  placeholder="快照名称…"
                  className="min-w-[140px] flex-1 border-white/10 bg-slate-900/80 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    p.saveAnimeProjectSnapshot(p.snapshotLabelDraft, {
                      shots: p.shots,
                      referenceLibraryUrls: p.referenceLibraryUrls,
                      script: p.script,
                      consistencyNotes: p.consistencyNotes,
                      knowledgeContext: p.knowledgeContext,
                    });
                    p.setSnapshotLabelDraft("");
                  }}
                >
                  保存快照
                </Button>
              </div>
              {p.animeProjectSnapshots.length > 0 && (
                <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                  {p.animeProjectSnapshots.map((s) => (
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
                            if (
                              !window.confirm(`恢复快照「${s.label}」？未另存的分镜与剧本会被覆盖。`)
                            ) {
                              return;
                            }
                            const snap = p.restoreAnimeProjectSnapshot(s.id);
                            if (!snap) return;
                            p.setScript(snap.script);
                            p.setConsistencyNotes(snap.consistencyNotes);
                            p.setKnowledgeContext(snap.knowledgeContext);
                            const first = snap.shots[0];
                            if (first?.id) p.selectShot(first.id);
                          }}
                        >
                          恢复
                        </button>
                        <button
                          type="button"
                          className="text-rose-400 hover:text-rose-300"
                          onClick={() => {
                            if (!window.confirm(`删除快照「${s.label}」？`)) return;
                            p.deleteAnimeProjectSnapshot(s.id);
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
                value={p.knowledgeContext}
                onChange={(e) => p.setKnowledgeContext(e.target.value)}
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
                value={p.consistencyNotes}
                onChange={(e) => p.setConsistencyNotes(e.target.value)}
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
                  value={p.refUrlDraft}
                  onChange={(e) => p.setRefUrlDraft(e.target.value)}
                  placeholder="https://… 图片地址"
                  className="min-w-[160px] flex-1 border-white/10 bg-slate-900/80 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    p.addReferenceLibraryUrl(p.refUrlDraft);
                    p.setRefUrlDraft("");
                  }}
                >
                  添加 URL
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => p.refFileInputRef.current?.click()}
                >
                  上传图片
                </Button>
                <input
                  ref={p.refFileInputRef}
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
                      if (typeof reader.result === "string") p.addReferenceLibraryUrl(reader.result);
                    };
                    reader.readAsDataURL(f);
                  }}
                />
              </div>
              {p.referenceLibraryUrls.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                  {p.referenceLibraryUrls.map((u) => (
                    <li key={u} className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono" title={u}>
                        {u.slice(0, 56)}
                        {u.length > 56 ? "…" : ""}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-rose-400 hover:text-rose-300"
                        onClick={() => p.removeReferenceLibraryUrl(u)}
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
                    value={p.animeStylePreset}
                    onChange={(e) => p.setAnimeStylePreset(e.target.value)}
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
                    checked={p.animeMangaBoost}
                    onChange={(e) => p.setAnimeMangaBoost(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900"
                  />
                  漫画分镜语法
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={p.animeCrossShot}
                    onChange={(e) => p.setAnimeCrossShot(e.target.checked)}
                    className="rounded border-white/20 bg-slate-900"
                  />
                  跨镜继承连贯
                </label>
              </div>
              <p className="text-[10px] leading-snug text-slate-500">
                服务端在每条 prompt 注入画风锁定、漫画构图（可选）、反向约束与平台动漫锁；不接第三方视频模型。
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
                  disabled={p.animeCharacters.length === 0}
                  onClick={() => {
                    const s = p.buildAnimeCharacterSnippet();
                    if (!s.trim()) return;
                    p.setConsistencyNotes((prev) => mergeCharacterSnippetIntoNotes(prev, s));
                  }}
                >
                  写入一致性文案
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={p.charNameDraft}
                  onChange={(e) => p.setCharNameDraft(e.target.value)}
                  placeholder="角色名"
                  className="min-w-[100px] flex-1 border-white/10 bg-slate-900/80 text-xs"
                />
                <Input
                  value={p.charSheetDraft}
                  onChange={(e) => p.setCharSheetDraft(e.target.value)}
                  placeholder="立绘 URL（可选）"
                  className="min-w-[140px] flex-[2] border-white/10 bg-slate-900/80 text-xs font-mono"
                />
              </div>
              <Textarea
                value={p.charNotesDraft}
                onChange={(e) => p.setCharNotesDraft(e.target.value)}
                placeholder="发色块、瞳色、服饰关键词…"
                className="min-h-[56px] resize-y border-white/10 bg-slate-900/80 text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => {
                  p.addAnimeCharacter({
                    name: p.charNameDraft,
                    sheetUrl: p.charSheetDraft,
                    notes: p.charNotesDraft,
                  });
                  p.setCharNameDraft("");
                  p.setCharSheetDraft("");
                  p.setCharNotesDraft("");
                }}
              >
                添加角色
              </Button>
              {p.animeCharacters.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px] text-slate-400">
                  {p.animeCharacters.map((c) => (
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
                        onClick={() => p.removeAnimeCharacter(c.id)}
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
                value={p.concatTransition}
                onChange={(e) => p.setConcatTransition(e.target.value)}
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
                disabled={p.concatClips.length < 2 || p.concatTimelinePending || p.submitting}
                title="服务端 FFmpeg；淡入淡出需重编码，成片无音轨"
                onClick={p.onConcatSubmit}
              >
                {p.concatTimelinePending ? "合成中…" : "FFmpeg 合成成片"}
              </Button>
              <span className="text-[11px] text-slate-500">
                已选 {p.concatClips.length} 段有效成片 URL
              </span>
            </div>
            {p.concatTimelineError && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                合成失败：
                {p.concatTimelineError instanceof Error
                  ? p.concatTimelineError.message
                  : String(p.concatTimelineError)}
              </div>
            )}
            {p.masterVideoUrl && (
              <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
                <div className="font-medium text-emerald-50">
                  已生成 master（{p.concatClips.length} 段拼接）
                </div>
                <a
                  href={p.masterVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all text-sky-400 underline underline-offset-2 hover:text-sky-300"
                >
                  {p.masterVideoUrl}
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

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ANIME_SHOT_TEMPLATES } from "@/lib/anime-shot-templates";
import { useStoryboardStore } from "@/store/storyboardStore";

type ShotDetailModalProps = {
  shotId: string | null;
  open: boolean;
  onClose: () => void;
  referenceLibraryUrls: string[];
  onGenerateShot?: (shotId: string) => void;
  generatingDisabled?: boolean;
};

export function ShotDetailModal({
  shotId,
  open,
  onClose,
  referenceLibraryUrls,
  onGenerateShot,
  generatingDisabled,
}: ShotDetailModalProps) {
  const shots = useStoryboardStore((s) => s.shots);
  const updateShot = useStoryboardStore((s) => s.updateShot);
  const selectVideoTake = useStoryboardStore((s) => s.selectVideoTake);
  const [shotTplId, setShotTplId] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFrameFileRef = useRef<HTMLInputElement | null>(null);
  const lastFrameFileRef = useRef<HTMLInputElement | null>(null);

  const MAX_LOCAL_IMAGE_BYTES = 2_500_000;

  const shot = useMemo(() => (shotId ? shots.find((x) => x.id === shotId) : undefined), [shotId, shots]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const focusable = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }, [open, shotId]);

  if (!open || !shotId) return null;

  if (!shot) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shot-detail-title"
          className="w-full max-w-md rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl"
        >
          <p id="shot-detail-title" className="text-sm text-slate-300">
            该镜头已不存在或已被替换，请关闭后重试。
          </p>
          <Button variant="secondary" className="mt-4" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    );
  }

  const seedStr = shot.seed != null ? String(shot.seed) : "";
  const prevShot = shots.find((x) => x.order === shot.order - 1);
  const prevLast = prevShot?.lastFrame?.trim();

  const applyLocalImageToField = (field: "firstFrame" | "lastFrame", file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOCAL_IMAGE_BYTES) {
      window.alert("图片过大（建议小于 2.5MB），请压缩或使用外链 URL。");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") updateShot(shot.id, { [field]: reader.result });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shot-detail-title"
        className={cn(
          "flex max-h-[min(92vh,880px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10",
          "bg-slate-950 shadow-2xl"
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 id="shot-detail-title" className="text-sm font-semibold text-slate-50">
              镜头 {shot.order} · 详情编辑
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              仅二维/三维动漫成片；多次生成会保留多版，可选定稿。保存即写入全局分镜。
            </p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-slate-400" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                剧情摘要
              </span>
              <Textarea
                value={shot.description}
                onChange={(e) => updateShot(shot.id, { description: e.target.value })}
                rows={3}
                className="text-xs"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Seedance 画面 Prompt
              </span>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <select
                  value={shotTplId}
                  onChange={(e) => setShotTplId(e.target.value)}
                  className="h-8 max-w-[min(100%,220px)] rounded-md border border-white/15 bg-slate-900 px-2 text-[11px] text-slate-200"
                  aria-label="动漫镜头模板"
                >
                  <option value="">镜头语气模板…</option>
                  {ANIME_SHOT_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px]"
                  disabled={!shotTplId}
                  onClick={() => {
                    const t = ANIME_SHOT_TEMPLATES.find((x) => x.id === shotTplId);
                    if (!t) return;
                    const cur = shot.prompt.trim();
                    updateShot(shot.id, { prompt: cur ? `${cur}\n${t.snippet}` : t.snippet });
                  }}
                >
                  插入模板
                </Button>
              </div>
              <Textarea
                value={shot.prompt}
                onChange={(e) => updateShot(shot.id, { prompt: e.target.value })}
                rows={12}
                className="font-mono text-xs leading-relaxed"
                placeholder="主体、场景、动作、景别与运动、光影色调；动漫材质表述…"
              />
            </label>

            <div className="space-y-3 rounded-lg border border-white/10 bg-slate-900/30 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                首尾帧与参考（火山 Seedance：first_frame / last_frame / reference）
              </div>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  首帧 URL（开场构图锚点）
                </span>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={shot.firstFrame ?? ""}
                    onChange={(e) =>
                      updateShot(shot.id, {
                        firstFrame: e.target.value.trim() || null,
                      })
                    }
                    className="min-w-0 flex-1 font-mono text-xs"
                    placeholder="https://… 或 data:image/…"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs"
                    onClick={() => firstFrameFileRef.current?.click()}
                  >
                    上传
                  </Button>
                </div>
                <input
                  ref={firstFrameFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    applyLocalImageToField("firstFrame", e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="text-[11px]"
                    disabled={!prevLast}
                    title={prevLast ? undefined : "上一镜未填写尾帧时不可用"}
                    onClick={() => {
                      if (prevLast) updateShot(shot.id, { firstFrame: prevLast });
                    }}
                  >
                    沿用上一镜尾帧为首帧
                  </Button>
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  尾帧 URL（衔接下一镜）
                </span>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={shot.lastFrame ?? ""}
                    onChange={(e) =>
                      updateShot(shot.id, {
                        lastFrame: e.target.value.trim() || null,
                      })
                    }
                    className="min-w-0 flex-1 font-mono text-xs"
                    placeholder="https://… 或 data:image/…"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs"
                    onClick={() => lastFrameFileRef.current?.click()}
                  >
                    上传
                  </Button>
                </div>
                <input
                  ref={lastFrameFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    applyLocalImageToField("lastFrame", e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  参考图 URL（reference）
                </span>
                <Input
                  value={shot.referenceImage ?? ""}
                  onChange={(e) =>
                    updateShot(shot.id, {
                      referenceImage: e.target.value.trim() || null,
                    })
                  }
                  className="font-mono text-xs"
                  placeholder="https://… 或 data:image/…"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  时长（秒）
                </span>
                <Input
                  type="number"
                  min={2}
                  max={12}
                  value={shot.duration ?? 5}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    updateShot(shot.id, { duration: Math.min(12, Math.max(2, Math.round(n))) });
                  }}
                  className="text-xs"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Seed（可选，辅助随机性收敛）
                </span>
                <Input
                  type="number"
                  value={seedStr}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    if (!v) {
                      updateShot(shot.id, { seed: undefined });
                      return;
                    }
                    const n = Number(v);
                    if (Number.isFinite(n)) updateShot(shot.id, { seed: Math.floor(n) });
                  }}
                  className="text-xs"
                  placeholder="留空则服务端随机"
                />
              </label>
            </div>

            {(() => {
              const takes = [
                ...new Set(
                  [...(shot.videoTakeUrls ?? []), shot.videoUrl ?? ""].filter(
                    (u): u is string => typeof u === "string" && u.trim().length > 0
                  )
                ),
              ];
              if (takes.length === 0) return null;
              const active = shot.videoUrl?.trim() ?? "";
              return (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90">
                    成片版本（Seedance · 选定稿）
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {takes.map((u, i) => (
                      <Button
                        key={`${u}-${i}`}
                        type="button"
                        variant={active === u ? "default" : "outline"}
                        size="sm"
                        className="max-w-full truncate text-[11px]"
                        title={u}
                        onClick={() => selectVideoTake(shot.id, u)}
                      >
                        版本 {i + 1}
                        {active === u ? " · 定稿" : ""}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {referenceLibraryUrls.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  从项目参考库填入 reference
                </div>
                <div className="flex flex-wrap gap-2">
                  {referenceLibraryUrls.map((u) => (
                    <Button
                      key={u}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-w-full truncate text-[11px]"
                      title={u}
                      onClick={() => updateShot(shot.id, { referenceImage: u })}
                    >
                      使用
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            完成
          </Button>
          {onGenerateShot && (
            <Button
              size="sm"
              disabled={generatingDisabled || !shot.prompt?.trim()}
              onClick={() => {
                onGenerateShot(shot.id);
                onClose();
              }}
            >
              保存并生成此镜
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

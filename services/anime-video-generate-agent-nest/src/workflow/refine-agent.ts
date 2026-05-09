import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import {
  buildAnimeParagraphPrompt,
  composeSeedancePrompt,
  defaultKnowledgeSnippetFromEnv,
  mergeKnowledgeLayers,
  type AnimeStylePreset,
} from "./prompt-policy";
import {
  buildEvolutionStageParagraph,
  evolutionShotDefaultDurationSec,
  inferEvolutionStages,
} from "./evolution-stages";

const ResolutionSchema = z.enum(["480p", "720p", "1080p"]);

const ShotInputSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().optional(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  modelType: z.string().optional(),
  duration: z.number().int().min(2).max(12).optional(),
  resolution: ResolutionSchema.optional(),
  ratio: z.string().optional(),
  fps: z.number().int().min(1).max(60).optional(),
  seed: z.number().int().optional(),
  watermark: z.boolean().optional(),
  camera_fixed: z.boolean().optional(),
  referenceImage: z.string().optional(),
  firstFrame: z.string().optional(),
  lastFrame: z.string().optional(),
});

const AgentRequestSchema = z.object({
  script: z.string().optional(),
  /** 附加到每个镜头 Seedance 提示词，用于约束角色外观与画风一致 */
  consistencyNotes: z.string().optional(),
  /**
   * 知识库 / 设定原文片段（客户端留口；后续可换向量检索）。
   * 会与进程环境 AUTO_DRAMA_KB_SNIPPET 合并后注入。
   */
  knowledgeContext: z.string().optional(),
  /** 服务端意图识别得到的进化链（优先于本地启发式拆幕） */
  intentStages: z.array(z.string()).optional(),
  intentSecondsPerShot: z.number().int().min(2).max(12).optional(),
  shots: z.array(ShotInputSchema).optional(),
  defaults: z
    .object({
      modelType: z.enum(["seedance1.5pro"]).optional(),
      duration: z.number().int().min(2).max(12).optional(),
      resolution: ResolutionSchema.optional(),
      ratio: z.string().optional(),
      fps: z.number().int().min(1).max(60).optional(),
      watermark: z.boolean().optional(),
      camera_fixed: z.boolean().optional(),
    })
    .optional(),
  /** 日系赛璐璐 / 国漫厚涂 / 水墨漫 / Q 版，服务端写入每条 Seedance prompt */
  animeStylePreset: z.enum(["cel_jp", "guoman_paint", "ink_manga", "chibi"]).optional(),
  /** manga_storyboard：追加漫画分镜构图语法；none 或不传：不加 */
  animePromptBoost: z.enum(["manga_storyboard", "none"]).optional(),
  /** 按镜序把上一镜基底 prompt 摘要并入人设一致层，减轻相邻镜头跳变 */
  inheritCrossShotStyle: z.boolean().optional(),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

export interface RefinedShot {
  id: string;
  order: number;
  description: string;
  prompt: string;
  modelType: string;
  duration: number;
  resolution: string;
  ratio: string;
  fps: number;
  seed?: number;
  watermark: boolean;
  camera_fixed: boolean;
  referenceImage?: string;
  firstFrame?: string;
  lastFrame?: string;
}

function splitParagraphs(script: string) {
  return script
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeRatio(r?: string) {
  const v = (r || "").trim();
  if (!v) return undefined;
  if (v === "16:9" || v === "9:16" || v === "1:1") return v;
  return v;
}

function genId() {
  return uuidv4();
}

export function refineAgentRequest(input: unknown):
  | { ok: true; data: { script: string; shots: RefinedShot[] } }
  | { ok: false; error: z.ZodError } {
  const parsed = AgentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error };
  }
  const req = parsed.data;
  const defaults = req.defaults ?? {};
  const consistencyNotes = (req.consistencyNotes ?? "").trim() || undefined;
  const mergedKnowledge = mergeKnowledgeLayers(defaultKnowledgeSnippetFromEnv(), req.knowledgeContext);

  let shots = req.shots ?? [];
  const script = (req.script ?? "").trim();

  if (shots.length === 0 && script) {
    const fromIntent = (req.intentStages ?? []).map((x) => x.trim()).filter(Boolean);
    const stages =
      fromIntent.length > 1 ? fromIntent.slice(0, 12) : inferEvolutionStages(script);
    if (stages && stages.length > 1) {
      let dur = evolutionShotDefaultDurationSec();
      const isp = req.intentSecondsPerShot;
      if (isp != null && isp >= 2 && isp <= 12) dur = isp;

      const ctxCap = (idx: number) => stages!.filter((_, j) => j !== idx).slice(0, 3);
      shots = stages.map((stage, i) => ({
        id: genId(),
        order: i + 1,
        description: stage,
        prompt: buildAnimeParagraphPrompt(buildEvolutionStageParagraph(stage, i, stages.length), ctxCap(i)),
        duration: dur,
      }));
    } else {
      const paras = splitParagraphs(script).slice(0, 12);
      shots = paras.map((p, i) => ({
        id: genId(),
        order: i + 1,
        description: "",
        prompt: buildAnimeParagraphPrompt(p, paras.filter((_, j) => j !== i).slice(0, 2)),
      }));
    }
  }

  const orderedShots = [...shots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const stylePreset = req.animeStylePreset as AnimeStylePreset | undefined;
  const useMangaGrammar = req.animePromptBoost === "manga_storyboard";
  const inheritCross = Boolean(req.inheritCrossShotStyle);

  const refined: RefinedShot[] = [];
  let prevBasePrompt = "";

  for (let idx = 0; idx < orderedShots.length; idx++) {
    const s = orderedShots[idx];
    const order = s.order ?? idx + 1;
    const id = (s.id || "").trim() || genId();
    const basePrompt =
      s.prompt && s.prompt.trim()
        ? s.prompt.trim()
        : script
          ? buildAnimeParagraphPrompt(script.slice(0, 1200), [])
          : "";

    let mergedConsistency = consistencyNotes;
    if (inheritCross && prevBasePrompt.trim()) {
      const tail = prevBasePrompt.trim().slice(-380);
      const bridge = `【跨镜连贯】同一角色脸型、发色、服饰主色块须与上一镜一致。上一镜画面要点：${tail}`;
      mergedConsistency = [consistencyNotes, bridge].filter(Boolean).join("\n") || bridge;
    }

    const prompt = composeSeedancePrompt(basePrompt, {
      knowledgeContext: mergedKnowledge,
      consistencyNotes: mergedConsistency,
      ...(stylePreset ? { stylePreset } : {}),
      useMangaStoryboardGrammar: useMangaGrammar,
    });

    if (prompt.length > 0) {
      refined.push({
        id,
        order,
        description: (s.description || "").trim(),
        prompt,
        modelType: "seedance1.5pro",
        duration: s.duration ?? defaults.duration ?? 5,
        resolution: s.resolution ?? defaults.resolution ?? "720p",
        ratio: normalizeRatio(s.ratio ?? defaults.ratio ?? "16:9") ?? "16:9",
        fps: s.fps ?? defaults.fps ?? 24,
        seed: s.seed,
        watermark: s.watermark ?? defaults.watermark ?? false,
        camera_fixed: s.camera_fixed ?? defaults.camera_fixed ?? false,
        referenceImage: s.referenceImage,
        firstFrame: s.firstFrame,
        lastFrame: s.lastFrame,
      });
      prevBasePrompt = basePrompt;
    }
  }

  refined.sort((a, b) => a.order - b.order);

  return { ok: true, data: { script, shots: refined } };
}

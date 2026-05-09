import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import {
  buildAnimeParagraphPrompt,
  composeSeedancePrompt,
  defaultKnowledgeSnippetFromEnv,
  mergeKnowledgeLayers,
  type AnimeStylePreset,
} from "./prompt-policy";

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
  consistencyNotes: z.string().optional(),
  knowledgeContext: z.string().optional(),
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
  animeStylePreset: z.enum(["cel_jp", "guoman_paint", "ink_manga", "chibi"]).optional(),
  animePromptBoost: z.enum(["manga_storyboard", "none"]).optional(),
  inheritCrossShotStyle: z.boolean().optional(),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

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

export function refineAgentRequest(input: unknown) {
  const parsed = AgentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error };
  }
  const req = parsed.data;
  const defaults = req.defaults ?? {};
  const consistencyNotes = (req.consistencyNotes ?? "").trim() || undefined;
  const mergedKnowledge = mergeKnowledgeLayers(defaultKnowledgeSnippetFromEnv(), req.knowledgeContext);

  let shots = req.shots ?? [];
  const script = (req.script ?? "").trim();

  if (shots.length === 0 && script) {
    const paras = splitParagraphs(script).slice(0, 12);
    shots = paras.map((p, i) => ({
      id: genId(),
      order: i + 1,
      description: "",
      prompt: buildAnimeParagraphPrompt(p, paras.filter((x) => x !== p).slice(0, 2)),
    }));
  }

  const orderedShots = [...shots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const stylePreset = req.animeStylePreset as AnimeStylePreset | undefined;
  const useMangaGrammar = req.animePromptBoost === "manga_storyboard";
  const inheritCross = Boolean(req.inheritCrossShotStyle);

  const refined: Array<{
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
  }> = [];

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

  return { ok: true as const, data: { script, shots: refined } };
}

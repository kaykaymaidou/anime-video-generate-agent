import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const ResolutionSchema = z.enum(["480p", "720p", "1080p"]);

const ShotInputSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().optional(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  // 容错：允许旧客户端/缓存带入其它值，最终会被强制归一化为 seedance1.5pro
  modelType: z.string().optional(),
  duration: z.number().int().min(2).max(12).optional(),
  resolution: ResolutionSchema.optional(),
  ratio: z.string().optional(),
  fps: z.number().int().min(1).max(60).optional(),
  seed: z.number().int().optional(),
  watermark: z.boolean().optional(),
  camera_fixed: z.boolean().optional(),
  referenceImage: z.string().optional(),
  lastFrame: z.string().optional(),
});

const AgentRequestSchema = z.object({
  script: z.string().optional(),
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
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

function splitParagraphs(script: string) {
  return script
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function buildPromptFromParagraph(p: string, ctx: string[]) {
  const parts = [
    "你是短剧分镜提示词编写助手。输出只含画面描述，不要解释。",
    "",
    "【当前镜头内容】",
    p,
    ctx.length ? "\n【上下文】\n" + ctx.join("\n---\n") : "",
    "",
    "【要求】",
    "- 明确主体/动作/场景/镜头语言/光影/风格（电影感）",
    "- 避免文字、字幕、logo",
  ].filter(Boolean);
  return parts.join("\n").trim();
}

function clampPrompt(s: string) {
  const t = (s || "").trim();
  if (t.length <= 3000) return t;
  return t.slice(0, 3000);
}

function normalizeRatio(r?: string) {
  const v = (r || "").trim();
  if (!v) return undefined;
  if (v === "16:9" || v === "9:16" || v === "1:1") return v;
  return v;
}

function genId(i: number) {
  // 采用 uuid，避免跨端冲突
  return uuidv4();
}

export function refineAgentRequest(input: unknown) {
  const parsed = AgentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error };
  }
  const req = parsed.data;
  const defaults = req.defaults ?? {};

  let shots = req.shots ?? [];
  const script = (req.script ?? "").trim();

  // 如果没有 shots 但有 script：做一次“可验证的默认拆镜”（后续可替换为 Ark 文本模型输出）
  if (shots.length === 0 && script) {
    const paras = splitParagraphs(script).slice(0, 12);
    shots = paras.map((p, i) => ({
      id: genId(i + 1),
      order: i + 1,
      description: "",
      prompt: buildPromptFromParagraph(p, paras.filter((x) => x !== p).slice(0, 2)),
    }));
  }

  // 统一校正：补全 id/order/prompt/默认参数
  const refined = shots
    .map((s, idx) => {
      const order = s.order ?? idx + 1;
      const id = (s.id || "").trim() || genId(order);
      const prompt = clampPrompt(
        s.prompt && s.prompt.trim()
          ? s.prompt
          : script
            ? buildPromptFromParagraph(script.slice(0, 1200), [])
            : ""
      );

      return {
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
        lastFrame: s.lastFrame,
      };
    })
    .filter((s) => s.prompt.length > 0)
    .sort((a, b) => a.order - b.order);

  return { ok: true as const, data: { script, shots: refined } };
}


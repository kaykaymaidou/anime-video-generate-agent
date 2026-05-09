import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

import type { IProgressBroadcaster } from "../realtime/progress-broadcaster.interface";
import { ProgressGateway } from "../realtime/progress.gateway";
import { VolcChatService } from "../volc/volc-chat.service";
import { parseJsonLoose } from "../volc/text.util";
import { AnimeAgentPipelineService } from "./anime-agent.pipeline.service";
import {
  composeSeedancePrompt,
  defaultKnowledgeSnippetFromEnv,
  mergeKnowledgeLayers,
  type AnimeStylePreset,
} from "./prompt-policy";

export type ScriptReviewResult = {
  summary: string;
  missing_visual_elements: string[];
  suggestions: string[];
  format_notes: string[];
};

@Injectable()
export class ScriptAssistService {
  private readonly progress: IProgressBroadcaster;

  constructor(
    private readonly chat: VolcChatService,
    private readonly pipeline: AnimeAgentPipelineService,
    progressGateway: ProgressGateway
  ) {
    this.progress = progressGateway;
  }

  async reviewScript(script: string): Promise<ScriptReviewResult> {
    const s = script.trim();
    if (!s) throw new BadRequestException("script required");
    this.chat.assertConfigured();

    const { content } = await this.chat.createChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "你是动漫短片剧本顾问；本平台仅产出动漫影像（二维或三维动漫渲染），面向 Seedance 动漫视频生成。" +
            "不要建议真人实拍、写实纪录片或新闻风格。只输出一个 JSON 对象，不要 markdown。" +
            "字段：summary（一句话概览）, missing_visual_elements（数组：还缺哪些画面信息，如主体外形与服饰色块、场景空间、光影基调、镜头节奏等）," +
            " suggestions（可执行的改写建议数组）, format_notes（结构/格式上的问题，如场次不明、镜头编号混乱等）。",
        },
        {
          role: "user",
          content: `剧本：\n${s.slice(0, 14_000)}`,
        },
      ],
      temperature: 0.35,
      response_format: { type: "json_object" },
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = parseJsonLoose<Record<string, unknown>>(content);
    } catch {
      throw new BadRequestException("script-review: model returned non-JSON");
    }

    const arr = (k: string) =>
      Array.isArray(parsed[k]) ? (parsed[k] as unknown[]).map((x) => String(x)) : [];

    return {
      summary: String(parsed.summary ?? ""),
      missing_visual_elements: arr("missing_visual_elements"),
      suggestions: arr("suggestions"),
      format_notes: arr("format_notes"),
    };
  }

  /** 拆镜预览：流水线产出的基底 prompt 再经与生成任务相同的 composeSeedancePrompt 封装（画风 / 漫画语法 / 负面词 / 跨镜可选）。 */
  async previewStoryboard(
    script: string,
    opts: {
      knowledgeContext?: string;
      contextCacheKey?: string;
      progressTaskId?: string;
      consistencyNotes?: string;
      animeStylePreset?: AnimeStylePreset;
      animePromptBoost?: "manga_storyboard" | "none";
      inheritCrossShotStyle?: boolean;
    } = {}
  ): Promise<{
    shots: Array<{
      order: number;
      description: string;
      prompt: string;
      duration?: number;
      resolution?: string;
      ratio?: string;
      fps?: number;
    }>;
  }> {
    const s = script.trim();
    if (!s) throw new BadRequestException("script required");
    if (!this.pipeline.isEnabled()) {
      throw new ServiceUnavailableException(
        "VOLC_AGENT_PIPELINE is off; enable it for storyboard preview or split locally"
      );
    }

    const kbMerged = mergeKnowledgeLayers(defaultKnowledgeSnippetFromEnv(), opts.knowledgeContext);
    const ck = opts.contextCacheKey?.trim();
    const ptid = opts.progressTaskId?.trim();
    const consistencyNotes = (opts.consistencyNotes ?? "").trim() || undefined;
    const stylePreset = opts.animeStylePreset;
    const useMangaGrammar = opts.animePromptBoost === "manga_storyboard";
    const inheritCross = Boolean(opts.inheritCrossShotStyle);

    const emitStage = (stage: string, progress: number, message: string) => {
      if (!ptid) return;
      this.progress.emitProgressToTask(ptid, {
        event: "storyboard-preview-stage",
        taskId: ptid,
        stage,
        progress,
        message,
      });
    };

    try {
      const { shots } = await this.pipeline.run({
        script: s,
        ...(kbMerged ? { ragContext: kbMerged } : {}),
        ...(ck ? { contextCacheKey: ck } : {}),
        ...(ptid
          ? {
              onStoryboardStage: ({ stage, progress, message }) =>
                emitStage(stage, progress, message),
            }
          : {}),
      });
      emitStage("compose", 96, "对齐生成侧提示词策略…");
      const ordered = [...shots].sort((a, b) => a.order - b.order);
      let prevBase = "";
      const composed = ordered.map((sh) => {
        const base = (sh.prompt ?? "").trim();
        let mergedConsistency = consistencyNotes;
        if (inheritCross && prevBase.trim()) {
          const tail = prevBase.trim().slice(-380);
          const bridge = `【跨镜连贯】同一角色脸型、发色、服饰主色块须与上一镜一致。上一镜画面要点：${tail}`;
          mergedConsistency = [consistencyNotes, bridge].filter(Boolean).join("\n") || bridge;
        }
        const prompt = composeSeedancePrompt(base, {
          knowledgeContext: kbMerged,
          consistencyNotes: mergedConsistency,
          ...(stylePreset ? { stylePreset } : {}),
          useMangaStoryboardGrammar: useMangaGrammar,
        });
        prevBase = base;
        return {
          order: sh.order,
          description: sh.description,
          prompt,
          duration: sh.duration,
          resolution: sh.resolution,
          ratio: sh.ratio,
          fps: sh.fps,
        };
      });
      emitStage("done", 100, "拆镜完成");
      return { shots: composed };
    } catch (e: unknown) {
      if (ptid) {
        const msg = e instanceof Error ? e.message : String(e);
        this.progress.emitProgressToTask(ptid, {
          event: "storyboard-preview-error",
          taskId: ptid,
          stage: "error",
          progress: 0,
          message: msg,
        });
      }
      throw e;
    }
  }
}

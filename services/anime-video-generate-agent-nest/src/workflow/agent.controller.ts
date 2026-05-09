import { Body, Controller, Post } from "@nestjs/common";

import type { AnimeStylePreset } from "./prompt-policy";
import { AgentService } from "./agent.service";
import { ScriptAssistService } from "./script-assist.service";

const STYLE_KEYS = new Set<string>(["cel_jp", "guoman_paint", "ink_manga", "chibi"]);

function parseAnimeStylePreset(v: unknown): AnimeStylePreset | undefined {
  return typeof v === "string" && STYLE_KEYS.has(v) ? (v as AnimeStylePreset) : undefined;
}

@Controller("api")
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly assist: ScriptAssistService
  ) {}

  @Post("agent")
  async postAgent(@Body() body: unknown) {
    return this.agent.handleAgent(body);
  }

  @Post("workflow/agent")
  async postWorkflowAgent(@Body() body: unknown) {
    return this.agent.handleAgent(body);
  }

  @Post("agent/script-review")
  async scriptReview(@Body() body: { script?: string }) {
    return this.assist.reviewScript(String(body?.script ?? ""));
  }

  @Post("agent/storyboard-preview")
  async storyboardPreview(
    @Body()
    body: {
      script?: string;
      knowledgeContext?: string;
      contextCacheKey?: string;
      progressTaskId?: string;
      consistencyNotes?: string;
      animeStylePreset?: string;
      animePromptBoost?: "manga_storyboard" | "none";
      inheritCrossShotStyle?: boolean;
    }
  ) {
    const ck =
      typeof body?.contextCacheKey === "string" && body.contextCacheKey.trim()
        ? body.contextCacheKey.trim()
        : undefined;
    const ptid =
      typeof body?.progressTaskId === "string" && body.progressTaskId.trim()
        ? body.progressTaskId.trim()
        : undefined;
    const boost =
      body?.animePromptBoost === "manga_storyboard" || body?.animePromptBoost === "none"
        ? body.animePromptBoost
        : undefined;
    return this.assist.previewStoryboard(String(body?.script ?? ""), {
      knowledgeContext: body?.knowledgeContext,
      contextCacheKey: ck,
      progressTaskId: ptid,
      consistencyNotes:
        typeof body?.consistencyNotes === "string" ? body.consistencyNotes : undefined,
      animeStylePreset: parseAnimeStylePreset(body?.animeStylePreset),
      animePromptBoost: boost,
      inheritCrossShotStyle: body?.inheritCrossShotStyle === true,
    });
  }
}

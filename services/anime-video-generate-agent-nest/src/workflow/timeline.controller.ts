import { Body, Controller, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  TimelineConcatService,
  type TimelineClipInput,
  type TimelineConcatTransition,
} from "./timeline-concat.service";

@Controller("api")
export class TimelineController {
  constructor(
    private readonly timelineConcat: TimelineConcatService,
    private readonly config: ConfigService
  ) {}

  /**
   * 纯 FFmpeg concat（stream copy），无 AI。
   * Body: { clips: [{ order, url }] } — url 为各镜成片 http(s) 地址。
   */
  @Post("timeline/concat")
  async concatTimeline(
    @Body()
    body: {
      clips?: TimelineClipInput[];
      /** none：无损拼接；fade：统一 720p 再 xfade（较慢，无音频轨） */
      transition?: TimelineConcatTransition;
    }
  ) {
    const clips = Array.isArray(body?.clips) ? body!.clips! : [];
    const transition: TimelineConcatTransition =
      body?.transition === "fade" ? "fade" : "none";
    const { filename, publicPath, clipCount } = await this.timelineConcat.concatToExports(clips, {
      transition,
    });

    const base = String(this.config.get("PUBLIC_HTTP_BASE") ?? "").replace(/\/+$/, "");
    const videoUrl = base ? `${base}${publicPath}` : publicPath;

    return {
      ok: true,
      filename,
      videoUrl,
      clipCount,
      path: publicPath,
    };
  }
}

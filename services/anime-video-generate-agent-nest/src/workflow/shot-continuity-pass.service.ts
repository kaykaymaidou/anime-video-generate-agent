import { Injectable, Logger } from "@nestjs/common";

import { parseJsonLoose } from "../volc/text.util";
import { VolcChatService } from "../volc/volc-chat.service";
import { clampPrompt } from "./prompt-policy";
import type { RefinedShot } from "./refine-agent";

const MAX_PROMPT = 3600;

/**
 * PR-A 第二阶段：相邻镜仍无 `firstFrame`（无可视锚点）时，调用方舟对话模型做一次 **全局** 衔接润色，
 * 为需衔接的镜头 prompt 前缀追加短句（纯文本，不替代首尾帧优先级）。
 */
@Injectable()
export class ShotContinuityPassService {
  private readonly log = new Logger(ShotContinuityPassService.name);

  constructor(private readonly chat: VolcChatService) {}

  async applyTextBridging(shots: RefinedShot[]): Promise<RefinedShot[]> {
    const sorted = [...shots].sort((a, b) => a.order - b.order);
    if (sorted.length < 2) return sorted;

    let needsBridge = false;
    for (let i = 1; i < sorted.length; i++) {
      if (!sorted[i].firstFrame?.trim()) {
        needsBridge = true;
        break;
      }
    }
    if (!needsBridge) return sorted;

    try {
      this.chat.assertConfigured();
    } catch (e) {
      this.log.warn(
        `PR-A text continuity skipped (chat unavailable): ${e instanceof Error ? e.message : String(e)}`
      );
      return sorted;
    }

    const sys =
      "你是动漫短片「镜间衔接」助理。输入为按顺序排列的镜头列表（含 order、description、prompt 摘要、是否已有首帧 URL）。" +
      "已有 firstFrame（hasFirstFrame=true）的镜头禁止追加衔接句。" +
      "第 1 条镜头（序列首镜）不需要衔接上一镜。" +
      "对其余 hasFirstFrame=false 的镜头，根据**上一镜**的 description+prompt 与**当前镜**内容，各写一句不超过 60 字的中文「画面承接」——描述当前镜开头如何接上一镜结尾（主体外形色块、场景光线、机位方向延续），禁止复述整条 prompt。" +
      "只输出一个 JSON 对象：{\"appendByOrder\":{\"2\":\"……\",\"3\":\"……\"}}，键为字符串形式的 order；不需要衔接的镜头不要出现在 appendByOrder。不要 markdown。";

    const user = JSON.stringify({
      shots: sorted.map((s) => ({
        order: s.order,
        description: (s.description || "").slice(0, 400),
        promptHead: (s.prompt || "").slice(0, 900),
        hasFirstFrame: Boolean(s.firstFrame?.trim()),
      })),
    });

    try {
      const { content } = await this.chat.createChatCompletion({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.28,
        response_format: { type: "json_object" },
      });
      const raw = parseJsonLoose<{ appendByOrder?: Record<string, string> }>(content);
      const map = raw.appendByOrder ?? {};
      const firstOrder = sorted[0]?.order;

      return sorted.map((s) => {
        if (s.order === firstOrder) return s;
        if (s.firstFrame?.trim()) return s;
        const append = map[String(s.order)]?.trim();
        if (!append) return s;
        const prefix = `【镜间承接·PR-A】${append}\n\n`;
        return { ...s, prompt: clampPrompt(prefix + s.prompt, MAX_PROMPT) };
      });
    } catch (e) {
      this.log.warn(`PR-A LLM continuity failed: ${e instanceof Error ? e.message : String(e)}`);
      return sorted;
    }
  }
}

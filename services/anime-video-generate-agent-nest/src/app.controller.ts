import { Controller, Get } from "@nestjs/common";
import * as path from "node:path";

import { buildVolcEnvDiag } from "./nest-env.loader";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return { ok: true, service: "anime-video-generate-agent-nest" };
  }

  /**
   * 不含密钥内容，仅路径与字段长度；浏览器打开 http://127.0.0.1:<NEST_PORT>/api/debug/volc-env
   *（经 Vite 代理则为 /api/debug/volc-env）确认当前 Nest 进程是否读到 VOLC_CHAT_MODEL_*。
   */
  @Get("api/debug/volc-env")
  volcEnvDiag() {
    return buildVolcEnvDiag(path.join(__dirname, ".."));
  }
}

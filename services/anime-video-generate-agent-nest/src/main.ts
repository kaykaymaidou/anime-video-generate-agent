import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { IoAdapter } from "@nestjs/platform-socket.io";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import { AppModule } from "./app.module";
import { applyEnvFile, buildVolcEnvDiag, envLoadVerbose, resolveAutoDramaNestRoot } from "./nest-env.loader";

/**
 * 加载顺序：cwd 级环境 → services 路径 → **包根 .env 最后覆盖**（避免仓库根 .env 里的空值占位覆盖 Nest 密钥）。
 */
const nestRoot = resolveAutoDramaNestRoot({ startDirs: [__dirname, process.cwd()], cwd: process.cwd() });

applyEnvFile(path.resolve(path.join(process.cwd(), ".env")), true);

applyEnvFile(path.resolve(path.join(process.cwd(), "services", "anime-video-generate-agent-nest", ".env")), true);

if (nestRoot) {
  applyEnvFile(path.join(nestRoot, ".env"), true);
}

if (envLoadVerbose()) {
  const d = buildVolcEnvDiag(path.join(__dirname, ".."));
  // eslint-disable-next-line no-console
  console.log(
    `[anime-video-generate-agent-nest env] summary: nestRoot=${d.nestRootResolved ?? "(null)"} nestDotEnvExists=${d.nestDotEnvExists} ` +
      `VOLC_PRO/LITE/MINI_len=${d.VOLC_CHAT_MODEL_PRO_len}/${d.VOLC_CHAT_MODEL_LITE_len}/${d.VOLC_CHAT_MODEL_MINI_len} ` +
      `cascade=${d.chatModelCascadeLen} seedanceKey_len=${d.SEEDANCE_API_KEY_len} cwd=${d.cwd}`
  );
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: true, credentials: true });

  const exportsDir = path.join(process.cwd(), "storage", "exports");
  await fsp.mkdir(exportsDir, { recursive: true });
  app.useStaticAssets(exportsDir, { prefix: "/exports/" });

  const port = Number(process.env.NEST_PORT || 4010);
  await app.listen(port);
  console.log(`[anime-video-generate-agent-nest] HTTP + Socket.io http://127.0.0.1:${port}`);
  console.log(`[anime-video-generate-agent-nest] REST 示例: POST http://127.0.0.1:${port}/api/agent`);
  console.log(`[anime-video-generate-agent-nest] 成片导出目录挂载: http://127.0.0.1:${port}/exports/`);
}

void bootstrap();

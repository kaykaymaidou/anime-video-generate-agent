import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import * as path from "node:path";

import { AppController } from "./app.controller";

/** 编译产物在 dist/，上一级即包根（与 cwd 无关） */
const nestPkgEnv = path.join(__dirname, "..", ".env");
import { RealtimeModule } from "./realtime/realtime.module";
import { VolcModule } from "./volc/volc.module";
import { WorkflowModule } from "./workflow/workflow.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      /** 兼容从仓库根目录、services 下或本包目录启动。后列文件覆盖前列（同键）。 */
      envFilePath: [
        path.join(process.cwd(), "..", "anime-video-generate-agent-ai", ".env"),
        path.join(process.cwd(), "services", "anime-video-generate-agent-ai", ".env"),
        path.join(process.cwd(), "..", "..", ".env"),
        path.join(process.cwd(), "..", ".env"),
        path.join(process.cwd(), "services", "anime-video-generate-agent-nest", ".env"),
        path.join(process.cwd(), "..", "anime-video-generate-agent-nest", ".env"),
        path.join(process.cwd(), ".env"),
        nestPkgEnv,
      ],
    }),
    VolcModule,
    RealtimeModule,
    WorkflowModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

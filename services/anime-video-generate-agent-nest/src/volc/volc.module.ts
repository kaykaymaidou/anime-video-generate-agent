import { Module } from "@nestjs/common";

import { VolcArkAdvancedService } from "./volc-ark-advanced.service";
import { VolcArkService } from "./volc-ark.service";
import { VolcChatService } from "./volc-chat.service";
import { VolcImageService } from "./volc-image.service";
import { VolcTasksController } from "./volc-tasks.controller";
import { VolcTokenizationService } from "./volc-tokenization.service";

@Module({
  controllers: [VolcTasksController],
  providers: [VolcArkService, VolcArkAdvancedService, VolcChatService, VolcTokenizationService, VolcImageService],
  exports: [VolcArkService, VolcArkAdvancedService, VolcChatService, VolcTokenizationService, VolcImageService],
})
export class VolcModule {}

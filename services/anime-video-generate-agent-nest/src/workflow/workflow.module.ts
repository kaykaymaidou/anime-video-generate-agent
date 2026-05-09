import { Module } from "@nestjs/common";

import { RealtimeModule } from "../realtime/realtime.module";
import { VolcModule } from "../volc/volc.module";
import { ContextCacheSessionStore } from "./context-cache-session.store";
import { AnimeAgentPipelineService } from "./anime-agent.pipeline.service";
import { ScriptIntentService } from "./script-intent.service";
import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";
import { TimelineConcatService } from "./timeline-concat.service";
import { TimelineController } from "./timeline.controller";
import { UsageController } from "./usage.controller";
import { UsageLedgerService } from "./usage-ledger.service";
import { ScriptAssistService } from "./script-assist.service";
import {
  CharacterConsistencyService,
  DirectorAgentService,
  PromptEngineService,
  ScenePlannerService,
  StoryboardEngineService,
  TimelineGeneratorService,
} from "./workflow-engines.service";

@Module({
  imports: [VolcModule, RealtimeModule],
  controllers: [AgentController, TimelineController, UsageController],
  providers: [
    ContextCacheSessionStore,
    AgentService,
    UsageLedgerService,
    TimelineConcatService,
    ScriptAssistService,
    ScriptIntentService,
    AnimeAgentPipelineService,
    PromptEngineService,
    StoryboardEngineService,
    CharacterConsistencyService,
    ScenePlannerService,
    TimelineGeneratorService,
    DirectorAgentService,
  ],
})
export class WorkflowModule {}

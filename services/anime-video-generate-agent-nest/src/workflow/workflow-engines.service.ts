import { Injectable } from "@nestjs/common";

/** Prompt 增强 / 风格模板（占位，后续接 LLM） */
@Injectable()
export class PromptEngineService {
  describePhase(): string {
    return "PromptEngine: 模板与风格占位（可接 Ark 文本模型）";
  }
}

/** 分镜结构化 / 节拍（占位） */
@Injectable()
export class StoryboardEngineService {
  describePhase(): string {
    return "StoryboardEngine: 镜头序列与节拍校验（占位）";
  }
}

/** 角色一致性：参考图 / embedding（占位） */
@Injectable()
export class CharacterConsistencyService {
  describePhase(): string {
    return "CharacterConsistency: reference 注入策略（占位）";
  }
}

/** 场景规划：地点 / 连贯性（占位） */
@Injectable()
export class ScenePlannerService {
  describePhase(): string {
    return "ScenePlanner: 场景衔接与预算（占位）";
  }
}

/** 时间轴输出：Remotion / FFmpeg 前置结构（占位） */
@Injectable()
export class TimelineGeneratorService {
  describePhase(): string {
    return "TimelineGenerator: 轨道与导出规划（占位）";
  }
}

/**
 * Director：编排上述引擎里程碑事件（当前为可观测骨架，逻辑在各 Engine 内演进）
 */
@Injectable()
export class DirectorAgentService {
  constructor(
    private readonly prompt: PromptEngineService,
    private readonly storyboard: StoryboardEngineService,
    private readonly character: CharacterConsistencyService,
    private readonly scene: ScenePlannerService,
    private readonly timeline: TimelineGeneratorService
  ) {}

  emitWorkflowMilestones(taskId: string, emit: (e: Record<string, unknown>) => void) {
    emit({
      event: "workflow-phase",
      taskId,
      phase: "prompt",
      message: this.prompt.describePhase(),
    });
    emit({
      event: "workflow-phase",
      taskId,
      phase: "storyboard",
      message: this.storyboard.describePhase(),
    });
    emit({
      event: "workflow-phase",
      taskId,
      phase: "character",
      message: this.character.describePhase(),
    });
    emit({
      event: "workflow-phase",
      taskId,
      phase: "scene",
      message: this.scene.describePhase(),
    });
    emit({
      event: "workflow-phase",
      taskId,
      phase: "timeline",
      message: this.timeline.describePhase(),
    });
    emit({
      event: "workflow-phase",
      taskId,
      phase: "director",
      message: "DirectorAgent: 编排完成，进入火山 Seedance 生成",
    });
  }
}

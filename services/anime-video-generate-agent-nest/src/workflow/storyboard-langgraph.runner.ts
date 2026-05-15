import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

/**
 * LangGraph 拆镜编排：导演 → 分镜 → 质检 → 一致性审计 →（可选）带补救回环再分镜。
 * 与 AnimeAgentPipelineService 中的 PipelineState / PipelineShot 结构兼容（duck typing）。
 */
export type LangGraphShot = {
  order: number;
  description: string;
  prompt: string;
  duration?: number;
  resolution?: "480p" | "720p" | "1080p";
  ratio?: "16:9" | "9:16" | "1:1";
  fps?: number;
};

export type LangGraphWorkspace = {
  script: string;
  ragContext?: string;
  director?: { styleBible: string; narrativeBeats: string[] };
  storyboard?: { shots: LangGraphShot[] };
  /** LangGraph 回路注入：附加在分镜首轮 user 末尾 */
  remedySuffix?: string;
};

export type LangGraphBundle = {
  workspace: LangGraphWorkspace;
  shots: LangGraphShot[];
  repairAttempts: number;
  /** 下一轮分镜附加的系统补救句 */
  repairHint: string;
};

const GraphState = Annotation.Root({
  bundle: Annotation<LangGraphBundle>(),
});

export type StoryboardLangGraphHandlers = {
  director: (ws: LangGraphWorkspace) => Promise<LangGraphWorkspace>;
  storyboard: (ws: LangGraphWorkspace) => Promise<LangGraphWorkspace>;
  qa: (ws: LangGraphWorkspace) => Promise<{ shots: LangGraphShot[] }>;
  /** 一致性审计：pass=false 且未达重试上限时将触发再分镜 */
  audit: (ws: LangGraphWorkspace, shots: LangGraphShot[]) => Promise<{ pass: boolean; hint: string }>;
  maxRepairs: number;
  onStage?: (stage: string, progress: number, message: string) => void;
};

/**
 * 编译并执行拆镜 StateGraph；返回最终 shots（质检后，可能经审计回路多跑分镜）。
 */
export async function runStoryboardLangGraph(
  handlers: StoryboardLangGraphHandlers,
  initialWorkspace: LangGraphWorkspace
): Promise<LangGraphShot[]> {
  const { director, storyboard, qa, audit, maxRepairs, onStage } = handlers;

  const nodeDirector = async (state: { bundle: LangGraphBundle }) => {
    const ws = await director(state.bundle.workspace);
    onStage?.("director", 42, "导演完成（风格宪法与叙事节拍）· LangGraph");
    return { bundle: { ...state.bundle, workspace: ws } };
  };

  const nodeStoryboard = async (state: { bundle: LangGraphBundle }) => {
    const hint = state.bundle.repairHint.trim();
    const ws = hint
      ? { ...state.bundle.workspace, remedySuffix: `【一致性复核补救】${hint}` }
      : { ...state.bundle.workspace, remedySuffix: undefined };
    const next = await storyboard(ws);
    onStage?.("storyboard", 72, "分镜结构化完成· LangGraph");
    return {
      bundle: {
        ...state.bundle,
        workspace: { ...next, remedySuffix: undefined },
        repairHint: "",
      },
    };
  };

  const nodeQa = async (state: { bundle: LangGraphBundle }) => {
    const out = await qa(state.bundle.workspace);
    const shots = out.shots;
    const ws: LangGraphWorkspace = {
      ...state.bundle.workspace,
      storyboard: { shots },
    };
    onStage?.("qa", 84, "质检完成· LangGraph");
    return { bundle: { ...state.bundle, workspace: ws, shots } };
  };

  const nodeAudit = async (state: { bundle: LangGraphBundle }) => {
    const { pass, hint } = await audit(state.bundle.workspace, state.bundle.shots);
    onStage?.(
      "consistency_audit",
      91,
      pass ? "一致性审计通过（角色/节拍/衔接）" : `一致性审计待加固：${hint.slice(0, 120)}`
    );
    return {
      bundle: {
        ...state.bundle,
        repairHint: pass ? "" : hint.trim(),
      },
    };
  };

  const routeAfterAudit = (state: { bundle: LangGraphBundle }): "retry_storyboard" | "finish" => {
    const hint = state.bundle.repairHint.trim();
    if (!hint) return "finish";
    if (state.bundle.repairAttempts >= maxRepairs) return "finish";
    return "retry_storyboard";
  };

  const nodeBumpRepair = async (state: { bundle: LangGraphBundle }) => {
    return {
      bundle: {
        ...state.bundle,
        repairAttempts: state.bundle.repairAttempts + 1,
      },
    };
  };

  const graph = new StateGraph(GraphState)
    .addNode("director", nodeDirector)
    .addNode("storyboard", nodeStoryboard)
    .addNode("qa", nodeQa)
    .addNode("audit", nodeAudit)
    .addNode("bump_repair", nodeBumpRepair)
    .addEdge(START, "director")
    .addEdge("director", "storyboard")
    .addEdge("storyboard", "qa")
    .addEdge("qa", "audit")
    .addConditionalEdges("audit", routeAfterAudit, {
      retry_storyboard: "bump_repair",
      finish: END,
    })
    .addEdge("bump_repair", "storyboard")
    .compile();

  const initial: LangGraphBundle = {
    workspace: { ...initialWorkspace, remedySuffix: undefined },
    shots: [],
    repairAttempts: 0,
    repairHint: "",
  };

  const out = await graph.invoke({ bundle: initial });
  return out.bundle.shots;
}

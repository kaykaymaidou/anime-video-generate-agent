/**
 * 全局 Socket `progress-update` 与当前生成批次对齐策略（防迟到包、串任务）。
 * 纯函数，便于单测；Editor 长生命周期监听层调用。
 */

export type ProgressIngressSnapshot = {
  activeProgressTaskId: string | null;
  progressIngressGeneration: number;
};

export type ProgressAcceptResult =
  | { accept: true }
  | { accept: false; reason: "idle_drop_task_scoped" | "task_mismatch" | "ingress_superseded" };

export function shouldAcceptAgentProgressEvent(
  evt: Record<string, unknown>,
  snap: ProgressIngressSnapshot,
): ProgressAcceptResult {
  const tid = typeof evt.taskId === "string" ? evt.taskId.trim() || null : null;
  const active = snap.activeProgressTaskId;

  if (tid != null && active == null) {
    return { accept: false, reason: "idle_drop_task_scoped" };
  }
  if (active != null && tid != null && tid !== active) {
    return { accept: false, reason: "task_mismatch" };
  }
  return { accept: true };
}

/** 入口快照与当前 store 代数不一致则丢弃（批次已中止/切换后的迟到事件）。 */
export function isProgressIngressStale(
  snap: ProgressIngressSnapshot,
  currentGeneration: number,
): boolean {
  return currentGeneration !== snap.progressIngressGeneration;
}

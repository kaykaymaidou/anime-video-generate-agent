/**
 * 依赖倒置：Workflow 仅依赖「可向客户端推送进度」的能力，便于替换实现（测试 Fake、消息队列桥接等）。
 * 当前唯一生产实现：{@link ProgressGateway}
 */
export interface IProgressBroadcaster {
  broadcastProgress(evt: Record<string, unknown>): void;
  emitProgressToTask(taskId: string, evt: Record<string, unknown>): void;
}

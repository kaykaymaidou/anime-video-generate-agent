import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"],
})
export class ProgressGateway implements OnGatewayConnection {
  private readonly log = new Logger(ProgressGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    client.emit("progress-update", {
      event: "hello",
      message: "socket connected (anime-video-generate-agent-nest)",
    });
  }

  broadcastProgress(evt: Record<string, unknown>) {
    this.server.emit("progress-update", evt);
  }

  emitProgressToTask(taskId: string, evt: Record<string, unknown>) {
    const id = taskId.trim();
    if (!id) return;
    const merged = { ...evt, taskId: id };
    this.server.to(`task:${id}`).emit("progress-update", merged);
  }

  @SubscribeMessage("client-hello")
  handleHello(client: Socket, payload: Record<string, unknown>) {
    client.emit("progress-update", {
      event: "hello-ack",
      clientId: payload?.clientId,
      ts: Date.now(),
    });
  }

  @SubscribeMessage("client-ping")
  handlePing(client: Socket, payload: Record<string, unknown>) {
    client.emit("progress-update", {
      event: "heartbeat",
      kind: "app",
      clientId: payload?.clientId,
      seq: payload?.seq,
      ts: Date.now(),
      clientTs: payload?.ts,
    });
  }

  /** subscribe-task：用 handler 返回值触发客户端 ack（Nest 10 不把 ack 当第三个参数）。 */
  @SubscribeMessage("subscribe-task")
  async handleSubscribe(client: Socket, payload: { taskId?: string }) {
    const taskId = typeof payload?.taskId === "string" ? payload.taskId : "";
    if (!taskId) {
      return { ok: false as const, error: "missing taskId" };
    }
    const room = `task:${taskId}`;
    if (client.rooms.has(room)) {
      return { ok: true as const, taskId, room, already: true as const };
    }
    await client.join(room);
    this.log.log(`subscribed ${client.id} -> ${room}`);
    client.emit("progress-update", { event: "subscribed", taskId, ts: Date.now() });
    return { ok: true as const, taskId, room };
  }

  @SubscribeMessage("unsubscribe-task")
  async handleUnsubscribe(client: Socket, payload: { taskId?: string }) {
    const taskId = typeof payload?.taskId === "string" ? payload.taskId : "";
    if (!taskId) {
      return { ok: false as const, error: "missing taskId" };
    }
    const room = `task:${taskId}`;
    await client.leave(room);
    client.emit("progress-update", { event: "unsubscribed", taskId, ts: Date.now() });
    return { ok: true as const, taskId, room };
  }
}

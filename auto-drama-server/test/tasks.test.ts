import request from "supertest";
import express from "express";
import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createTasksRouter } from "../src/routes/tasks";

function createFakeIo() {
  const events: any[] = [];
  return {
    io: { emit: (_name: string, payload: any) => events.push(payload) } as any as SocketIOServer,
    events
  };
}

describe("POST /api/tasks", () => {
  it("should accept shots payload and emit pipeline-init", async () => {
    const app = express();
    app.use(express.json());

    const { io, events } = createFakeIo();
    app.use("/api/tasks", createTasksRouter({ io, repoRootDir: process.cwd() }));

    const res = await request(app)
      .post("/api/tasks")
      .send({
        shots: [
          {
            id: "s1",
            order: 1,
            description: "desc",
            prompt: "prompt",
            modelType: "seedance2.0fast"
          }
        ]
      });

    expect(res.status).toBe(200);
    expect(events.some((e) => e?.event === "pipeline-init")).toBe(true);
  });
});


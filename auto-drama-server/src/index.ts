import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { createTasksRouter } from "./routes/tasks";

const PORT = Number(process.env.PORT || 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "5mb" }));

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: CLIENT_ORIGIN, credentials: true }
});

io.on("connection", (socket) => {
  socket.emit("progress-update", { event: "hello", message: "socket connected" });
});

const repoRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/tasks", createTasksRouter({ io, repoRootDir }));

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[auto-drama-server] listening on http://localhost:${PORT}`);
});


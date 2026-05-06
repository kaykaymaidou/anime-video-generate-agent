import { useEffect, useRef, useState } from "react";

import { ScriptEditor } from "@/components/features/script/ScriptEditor";
import { VideoPreview } from "@/components/features/video/VideoPreview";
import { apiFetch } from "@/lib/api-client";
import { acquireSocketClient } from "@/lib/socket-client";
import { useStoryboardStore } from "@/store/storyboardStore";
import { useTaskStore } from "@/store/useTaskStore";
import { v4 as uuidv4 } from "uuid";
import type { Socket } from "socket.io-client";

export function EditorPage() {
  const setStatus = useTaskStore((s) => s.setStatus);
  const setActiveVideoUrl = useTaskStore((s) => s.setActiveVideoUrl);
  const appendEvent = useTaskStore((s) => s.appendEvent);
  const clearEvents = useTaskStore((s) => s.clearEvents);
  const taskId = useTaskStore((s) => s.taskId);
  const setTaskId = useTaskStore((s) => s.setTaskId);
  const selectedShotId = useTaskStore((s) => s.selectedShotId);
  const selectShot = useTaskStore((s) => s.selectShot);
  const shots = useStoryboardStore((s) => s.shots);
  const updateShot = useStoryboardStore((s) => s.updateShot);
  const [submitting, setSubmitting] = useState(false);
  const [script, setScript] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const ensureSocketConnected = async () => {
    const socket = socketRef.current;
    if (!socket) throw new Error("socket not ready");
    if (socket.connected) return socket;
    socket.connect();
    await new Promise<void>((resolve) => {
      socket.once("connect", () => resolve());
    });
    return socket;
  };

  const submitShots = async (shotIds?: string[]) => {
    const list = shots
      .filter((s) => (shotIds ? shotIds.includes(s.id) : true))
      .map((s, idx) => ({
        id: s.id || uuidv4(),
        order: s.order ?? idx + 1,
        description: s.description ?? "",
        prompt: s.prompt,
        modelType: s.modelType,
        duration: s.duration,
        resolution: s.resolution,
        ratio: s.ratio,
        fps: s.fps,
        seed: s.seed,
        watermark: s.watermark,
        camera_fixed: s.camera_fixed,
        referenceImage: s.referenceImage ?? undefined,
        lastFrame: s.lastFrame ?? undefined
      }));

    if (list.length === 0) return;

    // 关键：先确定 taskId + 先订阅 room，再发起请求，避免 pipeline-init 等早期事件丢失
    const nextTaskId = taskId || uuidv4();
    if (!taskId) setTaskId(nextTaskId);
    clearEvents();
    try {
      const socket = await ensureSocketConnected();
      // 必须等到服务端确认 join room，避免“后端发了进度但前端没订阅上”
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("subscribe-task timeout")), 2000);
        socket.emit("subscribe-task", { taskId: nextTaskId }, (res: any) => {
          window.clearTimeout(timer);
          if (res?.ok) resolve();
          else reject(new Error(res?.error || "subscribe-task failed"));
        });
      });
    } catch {
      // ignore: API 仍可走 backlog emitter，不阻塞提交
    }

    setSubmitting(true);
    setStatus("queued");
    setErrorText(null);
    try {
      const res = await apiFetch<{ ok: boolean; taskId?: string }>("/api/agent", {
        method: "POST",
        body: JSON.stringify({ taskId: nextTaskId, script, shots: list })
      });
      if (res.taskId) setTaskId(res.taskId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error(e);
      setErrorText(msg);
      setSubmitting(false);
      setStatus("failed");
    }
  };

  useEffect(() => {
    const { socket, release } = acquireSocketClient();
    socketRef.current = socket;
    socket.connect();

    socket.on("progress-update", (evt: Record<string, unknown>) => {
      appendEvent(evt);
      const ev = evt?.event;
      if (ev === "pipeline-init") setStatus("running");
      if (ev === "progress") setStatus("running");
      if (ev === "result" && typeof evt.video_url === "string") {
        const shotId = typeof evt.shotId === "string" ? evt.shotId : null;
        if (shotId) updateShot(shotId, { status: "success", videoUrl: evt.video_url });
        if (!selectedShotId || selectedShotId === shotId) setActiveVideoUrl(evt.video_url);
        setStatus("succeeded");
        setSubmitting(false);
      }
      if (ev === "error") {
        const shotId = typeof evt.shotId === "string" ? evt.shotId : null;
        if (shotId) updateShot(shotId, { status: "error" });
        if (typeof evt.message === "string" && evt.message.trim()) {
          setErrorText(evt.message);
        } else {
          setErrorText("生成失败（未返回错误信息）");
        }
        setStatus("failed");
        setSubmitting(false);
      }
      if (ev === "done") setSubmitting(false);
    });

    return () => {
      release();
      socketRef.current = null;
    };
  }, [selectedShotId, setActiveVideoUrl, setStatus, updateShot]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!taskId) return;
    // 订阅由 submitShots 负责提前完成；这里不再重复订阅，避免双 subscribed
    return;
  }, [taskId]);

  return (
    <div className="h-[calc(100svh-3.5rem)]">
      <div className="flex h-full">
        <aside className="flex h-full w-[38%] min-w-[380px] flex-col border-r border-white/10 bg-slate-950">
          <div className="border-b border-white/10 bg-slate-950 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-50">脚本</div>
              <div className="text-xs text-slate-400">状态：{submitting ? "generating" : "ready"}</div>
            </div>
            {errorText && (
              <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {errorText}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ScriptEditor
              script={script}
              onScriptChange={setScript}
              onGenerateAll={() => void submitShots()}
              onGenerateShot={(shotId) => {
                selectShot(shotId);
                void submitShots([shotId]);
              }}
            />
          </div>
        </aside>
        <div className="relative h-full flex-1 overflow-hidden bg-black">
          <VideoPreview />
        </div>
      </div>
    </div>
  );
}

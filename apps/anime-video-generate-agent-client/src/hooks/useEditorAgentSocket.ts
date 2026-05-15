import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { acquireSocketClient } from "@/lib/socket-client";
import { shouldAcceptAgentProgressEvent } from "@/lib/socket-progress-guards";
import { useStoryboardStore } from "@/store/storyboardStore";
import type { TaskStatus } from "@/store/useTaskStore";
import { useTaskStore } from "@/store/useTaskStore";
import type { Socket } from "socket.io-client";

export function useEditorAgentSocket(deps: {
  queryClient: QueryClient;
  appendEvent: (evt: Record<string, unknown>) => void;
  setIntentBanner: (s: string | null) => void;
  setSubmitting: (b: boolean) => void;
  setErrorText: (s: string | null) => void;
  setErrorHint: (s: string | null) => void;
  setErrorCode: (s: string | null) => void;
  setErrorCodeN: (s: string | null) => void;
  setErrorDocUrl: (s: string | null) => void;
  setStatus: (status: TaskStatus) => void;
  setActiveVideoUrl: (url: string | null) => void;
  updateShot: ReturnType<typeof useStoryboardStore.getState>["updateShot"];
}) {
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

  useEffect(() => {
    const { socket, release } = acquireSocketClient();
    socketRef.current = socket;
    socket.connect();

    socket.on("progress-update", (evt: Record<string, unknown>) => {
      const st0 = useTaskStore.getState();
      const snap = {
        activeProgressTaskId: st0.activeProgressTaskId,
        progressIngressGeneration: st0.progressIngressGeneration,
      };
      const gate = shouldAcceptAgentProgressEvent(evt, snap);
      if (gate.accept === false) {
        const debug =
          String(import.meta.env.VITE_SOCKET_DEBUG || "0").toLowerCase() === "1" ||
          String(import.meta.env.VITE_SOCKET_DEBUG || "0").toLowerCase() === "true";
        if (debug) console.debug("[Editor/socket] dropped progress-update", gate.reason, evt);
        return;
      }

      deps.appendEvent(evt);
      const ev = evt?.event;
      if (ev === "agent-intent" && typeof evt.message === "string" && evt.message.trim()) {
        deps.setIntentBanner(evt.message.trim());
      }
      if (ev === "pipeline-init") deps.setStatus("running");
      if (ev === "progress") deps.setStatus("running");
      if (ev === "result" && typeof evt.video_url === "string") {
        const shotId = typeof evt.shotId === "string" ? evt.shotId : null;
        const url = evt.video_url;
        if (shotId) {
          const cur = useStoryboardStore.getState().shots.find((s) => s.id === shotId);
          const prevUrl = cur?.videoUrl?.trim() ?? "";
          const takes = [...(cur?.videoTakeUrls ?? [])];
          if (prevUrl && prevUrl !== url && !takes.includes(prevUrl)) takes.push(prevUrl);
          if (!takes.includes(url)) takes.push(url);
          deps.updateShot(shotId, { status: "success", videoUrl: url, videoTakeUrls: takes });
        }
        const sel = useTaskStore.getState().selectedShotId;
        if (!sel || sel === shotId) deps.setActiveVideoUrl(url);
        if (shotId) useTaskStore.getState().resolveShotGeneration(shotId, "ok");
        if (useTaskStore.getState().generationPendingShotIds.length === 0) deps.setSubmitting(false);
        void deps.queryClient.invalidateQueries({ queryKey: ["usage"] });
      }
      if (ev === "error") {
        const shotId = typeof evt.shotId === "string" ? evt.shotId : null;
        if (shotId) {
          deps.updateShot(shotId, { status: "error" });
          useTaskStore.getState().resolveShotGeneration(shotId, "error");
        } else {
          useTaskStore.getState().abortShotGeneration();
        }
        if (typeof evt.message === "string" && evt.message.trim()) {
          deps.setErrorText(evt.message.trim());
        } else {
          deps.setErrorText("生成失败（未返回错误信息）");
        }
        deps.setErrorHint(typeof evt.hint === "string" && evt.hint.trim() ? evt.hint.trim() : null);
        deps.setErrorCode(typeof evt.ark_code === "string" && evt.ark_code.trim() ? evt.ark_code.trim() : null);
        const cn = evt.volc_code_n;
        deps.setErrorCodeN(typeof cn === "number" ? String(cn) : null);
        deps.setErrorDocUrl(typeof evt.doc_url === "string" && evt.doc_url.trim() ? evt.doc_url.trim() : null);
        if (useTaskStore.getState().generationPendingShotIds.length === 0) deps.setSubmitting(false);
      }
      if (ev === "done") {
        if (useTaskStore.getState().generationPendingShotIds.length === 0) deps.setSubmitting(false);
      }
    });

    return () => {
      release();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- socket listener registered once
  }, [
    deps.appendEvent,
    deps.queryClient,
    deps.setActiveVideoUrl,
    deps.setErrorCode,
    deps.setErrorCodeN,
    deps.setErrorDocUrl,
    deps.setErrorHint,
    deps.setErrorText,
    deps.setIntentBanner,
    deps.setStatus,
    deps.setSubmitting,
    deps.updateShot,
  ]);

  return { socketRef, ensureSocketConnected };
}

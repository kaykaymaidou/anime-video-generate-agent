import { describe, expect, it } from "vitest";

import {
  isProgressIngressStale,
  shouldAcceptAgentProgressEvent,
} from "../socket-progress-guards";

describe("shouldAcceptAgentProgressEvent", () => {
  it("drops task-scoped events when idle (late packets)", () => {
    const r = shouldAcceptAgentProgressEvent(
      { taskId: "t-old", event: "result" },
      { activeProgressTaskId: null, progressIngressGeneration: 3 },
    );
    expect(r.accept).toBe(false);
    if (!r.accept) expect(r.reason).toBe("idle_drop_task_scoped");
  });

  it("allows task-scoped events when active matches", () => {
    const r = shouldAcceptAgentProgressEvent(
      { taskId: "t1", event: "progress" },
      { activeProgressTaskId: "t1", progressIngressGeneration: 1 },
    );
    expect(r.accept).toBe(true);
  });

  it("drops when active batch exists but taskId mismatches", () => {
    const r = shouldAcceptAgentProgressEvent(
      { taskId: "t-old", event: "progress" },
      { activeProgressTaskId: "t-new", progressIngressGeneration: 2 },
    );
    expect(r.accept).toBe(false);
    if (!r.accept) expect(r.reason).toBe("task_mismatch");
  });

  it("allows broadcast (no taskId) during active batch", () => {
    const r = shouldAcceptAgentProgressEvent(
      { event: "heartbeat" },
      { activeProgressTaskId: "t1", progressIngressGeneration: 0 },
    );
    expect(r.accept).toBe(true);
  });

  it("allows broadcast when idle", () => {
    const r = shouldAcceptAgentProgressEvent(
      { event: "hello" },
      { activeProgressTaskId: null, progressIngressGeneration: 9 },
    );
    expect(r.accept).toBe(true);
  });
});

describe("isProgressIngressStale", () => {
  it("detects superseded wave", () => {
    expect(
      isProgressIngressStale({ activeProgressTaskId: null, progressIngressGeneration: 1 }, 2),
    ).toBe(true);
    expect(
      isProgressIngressStale({ activeProgressTaskId: null, progressIngressGeneration: 2 }, 2),
    ).toBe(false);
  });
});

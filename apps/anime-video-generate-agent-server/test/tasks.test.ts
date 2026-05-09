import { describe, expect, it, vi } from "vitest";

import type { PythonBridgeOptions } from "../src/lib/python-bridge";
import { handleTaskSubmit } from "../src/lib/submit-tasks";

describe("handleTaskSubmit", () => {
  it("accepts shots payload and emits pipeline-init", () => {
    const emit = vi.fn();
    const io = { emit };
    const runTask = vi.fn();

    const res = handleTaskSubmit(
      {
        shots: [
          {
            id: "s1",
            order: 1,
            description: "desc",
            prompt: "prompt",
            modelType: "seedance1.5pro"
          }
        ]
      },
      {
        io,
        repoRootDir: "/repo",
        bridgeFactory: (_opts: PythonBridgeOptions) => ({ runTask })
      }
    );

    expect(res.status).toBe(200);
    expect(emit).toHaveBeenCalledWith(
      "progress-update",
      expect.objectContaining({
        event: "pipeline-init",
        shots: expect.any(Array)
      })
    );
    expect(runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        shotId: "s1",
        prompt: "prompt",
        modelType: "seedance1.5pro"
      })
    );
  });
});

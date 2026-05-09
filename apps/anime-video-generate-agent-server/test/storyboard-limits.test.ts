import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getArkStoryboardEnvLimits,
  shouldSkipArkStoryboard,
} from "../src/lib/ark/storyboard";

const KEYS = [
  "ARK_STORYBOARD_MIN_SHOTS",
  "ARK_STORYBOARD_MAX_SHOTS",
  "ARK_STORYBOARD_MAX_SCRIPT_CHARS",
  "ARK_STORYBOARD_SKIP",
] as const;

describe("Ark storyboard env limits (SPEC-002)", () => {
  const snapshot: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of KEYS) snapshot[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of KEYS) {
      const v = snapshot[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("defaults max shots to 10", () => {
    for (const k of KEYS) delete process.env[k];
    const lim = getArkStoryboardEnvLimits();
    expect(lim.minShots).toBe(3);
    expect(lim.maxShots).toBe(10);
    expect(lim.maxScriptChars).toBe(12_000);
    expect(shouldSkipArkStoryboard()).toBe(false);
  });

  it("respects ARK_STORYBOARD_SKIP", () => {
    process.env.ARK_STORYBOARD_SKIP = "1";
    expect(shouldSkipArkStoryboard()).toBe(true);
  });

  it("coerces max >= min", () => {
    for (const k of KEYS) delete process.env[k];
    process.env.ARK_STORYBOARD_MIN_SHOTS = "8";
    process.env.ARK_STORYBOARD_MAX_SHOTS = "3";
    const lim = getArkStoryboardEnvLimits();
    expect(lim.minShots).toBe(8);
    expect(lim.maxShots).toBe(8);
  });
});

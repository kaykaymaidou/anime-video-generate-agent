import { truthyEnv } from "./env-flag.util";

describe("truthyEnv", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ["TEST_FLAG"]) {
      prev[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("treats 1/true/yes/on as true (case-insensitive)", () => {
    for (const v of ["1", "true", "TRUE", "yes", "On"]) {
      process.env.TEST_FLAG = v;
      expect(truthyEnv("TEST_FLAG")).toBe(true);
    }
  });

  it("treats empty or other strings as false", () => {
    process.env.TEST_FLAG = "";
    expect(truthyEnv("TEST_FLAG")).toBe(false);
    process.env.TEST_FLAG = "0";
    expect(truthyEnv("TEST_FLAG")).toBe(false);
    delete process.env.TEST_FLAG;
    expect(truthyEnv("TEST_FLAG")).toBe(false);
  });
});

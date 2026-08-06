import { describe, expect, it } from "vitest";
import { WORKER_ID } from "./index.js";

describe("worker", () => {
  it("has a stable worker id", () => {
    expect(WORKER_ID).toBe("worker-1");
  });
});

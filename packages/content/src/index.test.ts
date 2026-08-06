import { describe, expect, it } from "vitest";
import { CONTENT_SCHEMA_VERSION } from "./index.js";

describe("content", () => {
  it("has a schema version", () => {
    expect(CONTENT_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

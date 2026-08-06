import { describe, expect, it } from "vitest";
import { CLIENT_NAME, CLIENT_PROTOCOL_VERSION } from "./index.js";

describe("h5-client", () => {
  it("identifies the client", () => {
    expect(CLIENT_NAME).toBe("yjh-h5");
    expect(CLIENT_PROTOCOL_VERSION).toBe(1);
  });
});

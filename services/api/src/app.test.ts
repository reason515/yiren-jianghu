import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { FastifyInstance } from "fastify";

describe("api app", () => {
  let app: FastifyInstance;

  async function boot(opts?: Parameters<typeof createApp>[0]): Promise<FastifyInstance> {
    app = await createApp(opts);
    await app.ready();
    return app;
  }

  afterEach(async () => {
    await app?.close();
  });

  it("GET /health returns ok", async () => {
    const a = await boot();
    const res = await a.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "api" });
  });

  it("GET /ready returns ready when all deps pass", async () => {
    const a = await boot({ deps: { readiness: async () => [] } });
    const res = await a.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready" });
  });

  it("GET /ready returns 503 with reasons when deps fail", async () => {
    const a = await boot({ deps: { readiness: async () => ["postgres down"] } });
    const res = await a.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: "not_ready", message: "postgres down" } });
  });

  it("404 returns error envelope with requestId", async () => {
    const a = await boot();
    const res = await a.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
    expect(res.json().error.requestId).toBeTruthy();
  });

  it("protected route rejects missing token", async () => {
    const a = await boot();
    const res = await a.inject({ method: "GET", url: "/private" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("protected route accepts bearer token", async () => {
    const a = await boot({
      verifyToken: async (token) => (token === "good" ? { accountId: "acc_1" } : null),
    });
    const res = await a.inject({
      method: "GET",
      url: "/private",
      headers: { authorization: "Bearer good" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ accountId: "acc_1" });
  });

  it("rate limit returns 429 after budget exhausted", async () => {
    const a = await boot();
    let last = 0;
    for (let i = 0; i < 121; i++) {
      last = (await a.inject({ method: "GET", url: "/health" })).statusCode;
    }
    expect(last).toBe(429);
  });
});

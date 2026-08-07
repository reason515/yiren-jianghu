import { describe, expect, it } from "vitest";
import { createPgDb } from "./db.js";

describe("createPgDb transaction", () => {
  it("Pool 注入时在同一 client 内提交事务", async () => {
    const calls: string[] = [];
    const client = {
      async query(text: string) {
        calls.push(text);
        return { rows: [] as unknown[] };
      },
      release() {
        calls.push("RELEASE");
      },
    };
    const pool = {
      async query(text: string) {
        calls.push(`POOL:${text}`);
        return { rows: [] as unknown[] };
      },
      async connect() {
        calls.push("CONNECT");
        return client;
      },
    };
    const db = createPgDb(pool);

    await db.transaction!(async (tx) => {
      await tx.query("SELECT 1");
      expect(tx.transaction).toBeUndefined();
    });

    expect(calls).toEqual(["CONNECT", "BEGIN", "SELECT 1", "COMMIT", "RELEASE"]);
  });

  it("事务内抛错时回滚并释放连接", async () => {
    const calls: string[] = [];
    const pool = {
      async query() {
        return { rows: [] as unknown[] };
      },
      async connect() {
        return {
          async query(text: string) {
            calls.push(text);
            return { rows: [] as unknown[] };
          },
          release() {
            calls.push("RELEASE");
          },
        };
      },
    };
    const db = createPgDb(pool);

    await expect(
      db.transaction!(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls).toEqual(["BEGIN", "ROLLBACK", "RELEASE"]);
  });
});

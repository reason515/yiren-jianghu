import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { EVENT_TYPES, PROTOCOL_VERSION } from "@yjh/shared";
import { createApp } from "./app.js";
import type { FastifyInstance } from "fastify";

/**
 * 协议一致性契约测试（Q2 机制）：
 * docs/protocol.md（人工维护的唯一清单）↔ 代码实际注册的路由/事件/版本。
 * 任一方向发散都会在此失败。
 */

const PROTOCOL_DOC = fileURLToPath(new URL("../../../docs/protocol.md", import.meta.url));

interface ParsedManifest {
  version: number;
  routes: { method: string; path: string }[];
  events: string[];
}

async function parseManifest(): Promise<ParsedManifest> {
  const text = await readFile(PROTOCOL_DOC, "utf8");
  const lines = text.split(/\r?\n/);
  const versionLine = lines.find((l) => /^protocolVersion:\s*\d+$/.test(l.trim()));
  if (!versionLine) throw new Error("docs/protocol.md 缺少 protocolVersion 行");
  const version = Number(versionLine.match(/\d+/)![0]);

  const routes: ParsedManifest["routes"] = [];
  const events: string[] = [];
  let section: "" | "routes" | "events" = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      section = line.includes("HTTP") ? "routes" : line.includes("WS") ? "events" : "";
      continue;
    }
    if (section === "routes") {
      const m = line.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/);
      if (m) routes.push({ method: m[1]!, path: m[2]! });
    }
    if (section === "events" && /^[a-z][a-z0-9_.-]*$/.test(line)) {
      events.push(line);
    }
  }
  return { version, routes, events };
}

describe("protocol contract", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("manifest 版本与 @yjh/shared 一致", async () => {
    const manifest = await parseManifest();
    expect(manifest.version).toBe(PROTOCOL_VERSION);
  });

  it("manifest 事件集合与 EVENT_TYPES 完全一致", async () => {
    const manifest = await parseManifest();
    expect(new Set(manifest.events)).toEqual(new Set(EVENT_TYPES));
  });

  it("manifest 中每条路由都已被 app 注册", async () => {
    const manifest = await parseManifest();
    app = await createApp({});
    await app.ready();
    for (const route of manifest.routes) {
      expect(
        app.hasRoute({ method: route.method, url: route.path }),
        `docs/protocol.md 声明 ${route.method} ${route.path} 但 app 未注册`,
      ).toBe(true);
    }
  });
});

/**
 * 后台作业 Worker（F2 / DC-043）。
 * 离线挂机：轮询结算；在线挂机：仅检查心跳超时并 pause。
 */
import type { Pool } from "pg";
import type { ContentPack } from "@yjh/content";
import { PROTOCOL_VERSION } from "@yjh/shared";
import {
  settleDueJobs,
  settleJobNow,
  stopJobNow,
  progressOf,
  JOB_COLS,
  gains,
  narrativeFor,
  type SettlementSummary,
  type JobRow,
  type SettleJobResult,
  type AfkPresence,
  type SettleMode,
} from "./jobSettle.js";

export { settleDueJobs, settleJobNow, stopJobNow, progressOf, JOB_COLS, gains, narrativeFor };
export type { SettlementSummary, JobRow, SettleJobResult, AfkPresence, SettleMode };

export const WORKER_ID = `worker-${PROTOCOL_VERSION}`;

export interface WorkerOptions {
  pool: Pool;
  content: ContentPack;
  /** 轮询间隔（毫秒），默认 60s。 */
  intervalMs?: number;
}

export interface WorkerHandle {
  stop(): Promise<void>;
}

export async function startWorker(opts: WorkerOptions): Promise<WorkerHandle> {
  const intervalMs = opts.intervalMs ?? 60_000;
  let running = true;

  const tick = async (): Promise<void> => {
    if (!running) return;
    try {
      const summary = await settleDueJobs({ pool: opts.pool, content: opts.content });
      if (summary.settled > 0 || summary.completed > 0 || summary.paused > 0) {
        console.log(
          `[${WORKER_ID}] settle scanned=${summary.scanned} settled=${summary.settled} completed=${summary.completed} paused=${summary.paused} skipped=${summary.skipped}`,
        );
      }
    } catch (err) {
      console.error(`[${WORKER_ID}] settle failed:`, err);
    }
  };

  await tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    stop: async () => {
      running = false;
      clearInterval(timer);
    },
  };
}

/**
 * 后台作业 Worker（F2 实现）。
 * 轮询结算 running 挂机作业（修炼型逐次参悟；任务型待 PVE 战斗域）。
 * - 启动即跑一轮 = 崩溃恢复扫描（离线期间照常结算）；
 * - 每作业事务 + FOR UPDATE 行锁（并发幂等）；
 * - 不需要 Redis 延迟队列：DB 轮询天然覆盖到期结算与恢复（封测规模足够）。
 */
import type { Pool } from "pg";
import type { ContentPack } from "@yjh/content";
import { PROTOCOL_VERSION } from "@yjh/shared";
import { settleDueJobs, type SettlementSummary } from "./run.js";

export { settleDueJobs };
export type { SettlementSummary };

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
      if (summary.settled > 0 || summary.completed > 0) {
        console.log(
          `[${WORKER_ID}] settle scanned=${summary.scanned} settled=${summary.settled} completed=${summary.completed} skipped=${summary.skipped}`,
        );
      }
    } catch (err) {
      console.error(`[${WORKER_ID}] settle failed:`, err);
    }
  };

  // 启动即跑一轮：崩溃恢复 + 离线期间补结算
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

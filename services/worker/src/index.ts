/**
 * 后台作业 Worker（任务 C7 起实现）。
 * 消费 Redis 延迟队列，执行挂机 tick、结算与恢复扫描。
 */
import { PROTOCOL_VERSION } from "@yjh/shared";

export const WORKER_ID = `worker-${PROTOCOL_VERSION}`;

import { PROTOCOL_VERSION } from "@yjh/shared";
import {
  computeMaxVitals,
  effectivePotential,
  maxFoodCapacity,
  maxWaterCapacity,
} from "@yjh/game-core";
import type { ContentPack } from "@yjh/content";
import type { Db } from "./db.js";
import { settleCharacterVitals, vitalsContentFromPack } from "./vitalsSettle.js";

/** 会话恢复域错误（code 进入错误信封）。 */
export class SessionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

export interface ResumeCharacterView {
  id: string;
  name: string;
  gender: string;
  status: string;
  roomPath: string;
  vitals: { qi: number; jing: number; jingli: number; neili: number; food: number; water: number };
  /** 生存资源上限（V2.9：与当前值成对展示；无内容包时全 0）。 */
  vitalsMax: {
    qi: number;
    jing: number;
    jingli: number;
    neili: number;
    food: number;
    water: number;
  };
  exp: number;
  effectivePotential: number;
  silver: number;
}

export interface ResumeAfkReportView {
  jobId: string;
  kind: string;
  status: string;
  stopReason?: string;
}

export interface SessionResumeView {
  stateVersion: number;
  character: ResumeCharacterView | null;
  pendingAfkReports: ResumeAfkReportView[];
  pendingPvpReportIds: string[];
}

export interface SessionService {
  resume(accountId: string): Promise<SessionResumeView>;
}

type CharRow = {
  id: string;
  name: string;
  gender: string;
  status: string;
  room_path: string;
  exp: number;
  potential: number;
  learned_points: number;
  silver: number;
  qi: number;
  jing: number;
  jingli: number;
  neili: number;
  food: number;
  water: number;
  attrs?: Record<string, unknown> | string | null;
};

export function createSessionService(db: Db, content?: ContentPack): SessionService {
  return {
    async resume(accountId) {
      // DC-044：重连恢复点先结算气精/食水，再读快照。
      if (content) {
        await settleCharacterVitals(db, vitalsContentFromPack(content), accountId);
      }
      const rows = await db.query<CharRow>(
        "SELECT id, name, gender, status, room_path, exp, potential, learned_points, silver, qi, jing, jingli, neili, food, water, attrs FROM characters WHERE account_id = $1 AND status = 'active'",
        [accountId],
      );
      const row = rows.rows[0] ?? null;

      let vitalsMax: ResumeCharacterView["vitalsMax"] = {
        qi: 0,
        jing: 0,
        jingli: 0,
        neili: 0,
        food: 0,
        water: 0,
      };
      if (row && content) {
        const rawAttrs =
          typeof row.attrs === "string"
            ? JSON.parse(row.attrs)
            : (row.attrs ?? ({} as Record<string, unknown>));
        const num = (key: string) => {
          const value = Number(rawAttrs[key]);
          return Number.isFinite(value) ? value : 0;
        };
        const skillsById = new Map(content.skills.map((skill) => [skill.id, skill]));
        const forceRows = await db.query<{ skill_id: string; level: number }>(
          "SELECT skill_id, level FROM character_skills WHERE character_id = $1",
          [row.id],
        );
        const forceLevels = forceRows.rows
          .filter((skill) => skillsById.get(skill.skill_id)?.category === "force")
          .map((skill) => skill.level);
        const forceLevel = forceLevels.length > 0 ? Math.max(...forceLevels) : 0;
        const maxVitals = computeMaxVitals(content.params, {
          str: num("str"),
          int: num("int"),
          con: num("con"),
          dex: num("dex"),
          forceLevel,
        });
        vitalsMax = {
          qi: maxVitals.maxQi,
          jing: maxVitals.maxJing,
          jingli: maxVitals.maxJingli,
          neili: maxVitals.maxNeili,
          food: maxFoodCapacity(content.params, num("con")),
          water: maxWaterCapacity(content.params, num("dex")),
        };
      }

      const character: ResumeCharacterView | null = row
        ? {
            id: row.id,
            name: row.name,
            gender: row.gender,
            status: row.status,
            roomPath: row.room_path,
            vitals: {
              qi: row.qi,
              jing: row.jing,
              jingli: row.jingli,
              neili: row.neili,
              food: row.food,
              water: row.water,
            },
            vitalsMax,
            exp: row.exp,
            effectivePotential: effectivePotential(row.potential, row.learned_points),
            silver: row.silver,
          }
        : null;

      // 未读挂机战报（断线期间完成/失败）
      const pendingAfkReports: ResumeAfkReportView[] = [];
      const afkIds: string[] = [];
      if (row) {
        const afkRows = await db.query<{
          id: string;
          kind: string;
          status: string;
          stop_reason: string | null;
        }>(
          "SELECT id, kind, status, stop_reason FROM afk_jobs WHERE character_id = $1 AND status IN ('completed','failed') AND read_at IS NULL ORDER BY updated_at DESC LIMIT 20",
          [row.id],
        );
        for (const r of afkRows.rows) {
          pendingAfkReports.push({
            jobId: r.id,
            kind: r.kind,
            status: r.status,
            stopReason: r.stop_reason ?? undefined,
          });
          afkIds.push(r.id);
        }
        if (afkIds.length > 0) {
          await db.query("UPDATE afk_jobs SET read_at = now() WHERE id = ANY($1)", [afkIds]);
        }
      }

      // 未读 PVP 战报 id
      const pendingPvpReportIds: string[] = [];
      if (row) {
        const pvpRows = await db.query<{ id: string }>(
          "SELECT id FROM pvp_matches WHERE (challenger_id = $1 OR defender_id = $1) AND result IS NOT NULL AND read_at IS NULL ORDER BY created_at DESC LIMIT 20",
          [row.id],
        );
        for (const r of pvpRows.rows) pendingPvpReportIds.push(r.id);
        if (pendingPvpReportIds.length > 0) {
          await db.query("UPDATE pvp_matches SET read_at = now() WHERE id = ANY($1)", [
            pendingPvpReportIds,
          ]);
        }
      }

      return {
        stateVersion: PROTOCOL_VERSION,
        character,
        pendingAfkReports,
        pendingPvpReportIds,
      };
    },
  };
}

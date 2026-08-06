import { ApiError } from "./authApi.js";

/** 断线重连恢复点（对齐 @yjh/shared sessionResumeSchema；服务端权威）。 */

export interface ResumeAfkReport {
  jobId: string;
  kind: string;
  status: string;
  stopReason?: string;
}

export interface SessionResumeData {
  stateVersion: number;
  character: unknown | null;
  pendingAfkReports: ResumeAfkReport[];
  pendingPvpReportIds: string[];
}

export interface ResumeClient {
  resume(token: string): Promise<SessionResumeData>;
}

export function createResumeClient(baseUrl: string, fetchImpl: typeof fetch = fetch): ResumeClient {
  return {
    resume: async (token) => {
      const res = await fetchImpl(`${baseUrl}/session/resume`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string; requestId?: string };
      } | null;
      if (!res.ok) {
        const e = data?.error;
        throw new ApiError(
          e?.code ?? "http_error",
          res.status,
          e?.message ?? `恢复失败（${res.status}）`,
          e?.requestId,
        );
      }
      return data as SessionResumeData;
    },
  };
}

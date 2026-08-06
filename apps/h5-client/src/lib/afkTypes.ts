/** 挂机 UI 数据（由服务端 afk.* 事件组装；客户端只发起配置与展示）。 */

export type AfkMode = "quest";

export interface AfkTemplateOption {
  id: string;
  name: string;
}

export interface AfkStartConfig {
  mode: AfkMode;
  templateId: string;
  /** 分钟；服务端上限内选择。 */
  durationMinutes: number;
}

export interface AfkStatusView {
  active: boolean;
  message: string;
  startedAt?: number;
  scheduledEndAt?: number;
}

export interface AfkGains {
  exp: number;
  potential: number;
  silver: number;
}

export interface AfkReportData {
  jobId: string;
  kind: string;
  status: "completed" | "failed" | "cancelled";
  reason?: string;
  durationMinutes: number;
  gains: AfkGains;
  /** 叙事化战报（wuxia 文案，服务端生成）。 */
  narrative: string;
}

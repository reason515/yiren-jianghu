import type { JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import type { AfkReportData } from "../lib/afkTypes.js";

/** 挂机战报（mobile-ui：离线叙事回声；收益数值 UI 展示，叙事文案由服务端按 wuxia 生成）。 */
export interface AfkReportViewProps {
  open: boolean;
  report: AfkReportData | null;
  onClose: () => void;
}

const STATUS_TEXT: Record<AfkReportData["status"], string> = {
  completed: "挂机已完成",
  failed: "挂机已中断",
  cancelled: "挂机已停止",
};

export function AfkReportView({ open, report, onClose }: AfkReportViewProps): JSX.Element | null {
  return (
    <Sheet open={open && !!report} title="挂机结算" onClose={onClose}>
      {report && (
        <div className="afk-report" data-testid="afk-report">
          <p className="afk-report-status">{STATUS_TEXT[report.status]}</p>
          {report.reason && <p className="afk-report-reason">{report.reason}</p>}
          <p className="afk-report-narrative">{report.narrative}</p>
          <div className="afk-report-gains">
            <span className="gain-exp">历练 +{Math.floor(report.gains.exp)}</span>
            <span className="gain-sep"> · </span>
            <span className="gain-pot">潜能 +{Math.floor(report.gains.potential)}</span>
            <span className="gain-sep"> · </span>
            <span className="gain-silver">银两 +{Math.floor(report.gains.silver)}</span>
          </div>
          <p className="afk-report-duration">
            历时 {Math.round((report.durationMinutes / 120) * 10) / 10} 时辰。
          </p>
        </div>
      )}
    </Sheet>
  );
}

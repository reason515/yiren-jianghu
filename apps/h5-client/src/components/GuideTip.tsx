import type { JSX } from "react";

/** 新手引导轻提示（首启动线：欢迎/接任务/学武/首战；不打断主流程，可随时“知道了”关闭）。 */
export interface GuideTipProps {
  text: string;
  onDismiss: () => void;
}

export function GuideTip({ text, onDismiss }: GuideTipProps): JSX.Element {
  return (
    <div className="guide-tip" role="status" data-testid="guide-tip">
      <p className="guide-text">{text}</p>
      <button type="button" className="guide-dismiss" onClick={onDismiss}>
        知道了
      </button>
    </div>
  );
}

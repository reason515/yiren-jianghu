import type { JSX } from "react";

/** 高风险操作二次确认（放弃角色/不可逆消耗等；见 yjh-mobile-ui：朱砂=高风险）。 */
export interface ConfirmSheetProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "再想想",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps): JSX.Element | null {
  if (!open) return null;
  return (
    <div className="overlay" role="presentation" data-testid="confirm-overlay" onClick={onCancel}>
      <div
        className="sheet confirm-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        data-testid="confirm-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-top">
          <h3>{title}</h3>
        </div>
        <div className="sheet-scroll">
          <p className="confirm-message">{message}</p>
          <div className="confirm-actions">
            <button type="button" className="btn danger" disabled={busy} onClick={onConfirm}>
              {confirmLabel}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

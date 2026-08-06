import type { JSX, ReactNode } from "react";

/** 浮层容器（详情/地图/模板编辑等二级界面；规范见 yjh-mobile-ui：浮层不离开主场景）。 */
export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, title, onClose, children }: SheetProps): JSX.Element | null {
  if (!open) return null;
  return (
    <div className="overlay" role="presentation" data-testid="sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-top">
          <h3>{title}</h3>
          <button type="button" className="close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sheet-scroll">{children}</div>
      </div>
    </div>
  );
}

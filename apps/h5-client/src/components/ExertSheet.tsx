import type { JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { Chip } from "./base/Chip.js";
import { fieldExertKindLabel, formatExertCost, type FieldExertOption } from "../lib/fieldExert.js";

/** 场外运功浮层（DC-052）：顶栏与人物簿共用。 */
export interface ExertSheetProps {
  open: boolean;
  options: FieldExertOption[];
  busy?: boolean;
  onClose: () => void;
  onExert: (performId: string) => void;
}

export function ExertSheet({
  open,
  options,
  busy = false,
  onClose,
  onExert,
}: ExertSheetProps): JSX.Element {
  return (
    <Sheet open={open} title="运功" onClose={onClose}>
      <div className="exert-sheet" data-testid="exert-sheet">
        <p className="exert-lead">静心调息，以已学内功心法温养气精。</p>
        {options.length === 0 ? (
          <p className="exert-empty" data-testid="exert-empty">
            尚未学会可运之功。当面请教师父，悟得疗伤、聚气、回神诸式后再来。
          </p>
        ) : (
          <ul className="exert-list">
            {options.map((opt) => (
              <li key={opt.id} className="exert-row" data-testid={`exert-row-${opt.id}`}>
                <div className="exert-meta">
                  <span className="exert-name">{opt.name}</span>
                  <em className="exert-kind">{fieldExertKindLabel(opt.kind)}</em>
                  <span className="exert-cost">{formatExertCost(opt.cost)}</span>
                </div>
                <Chip
                  label={busy ? "运功中…" : "运功"}
                  variant="perform"
                  disabled={busy}
                  onClick={() => onExert(opt.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

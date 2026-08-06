import { useState, type JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import type { AfkStartConfig, AfkTemplateOption } from "../lib/afkTypes.js";

/** 挂机启动面板（选模板/时长；结构化 chips，禁原生 select）。 */
export interface AfkSheetProps {
  open: boolean;
  templates: AfkTemplateOption[];
  active: boolean;
  statusMessage: string;
  onStart: (config: AfkStartConfig) => void;
  onStop: () => void;
  onClose: () => void;
}

const DURATIONS = [60, 120, 240, 480]; // 分钟（服务端上限 8h 内）

export function AfkSheet({
  open,
  templates,
  active,
  statusMessage,
  onStart,
  onStop,
  onClose,
}: AfkSheetProps): JSX.Element | null {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [duration, setDuration] = useState(DURATIONS[0]!);

  return (
    <Sheet open={open} title="行止·挂机" onClose={onClose}>
      <p className="afk-lead">离开之前，先把这段时间安排妥当——江湖不会等你，但行止可以。</p>

      {active ? (
        <div className="afk-running">
          <p className="afk-status">{statusMessage}</p>
          <button type="button" className="btn danger" onClick={onStop}>
            停止挂机
          </button>
        </div>
      ) : (
        <div className="afk-form">
          <div className="field">
            <span className="field-label">行止</span>
            <span className="afk-mode-tag">任务挂机</span>
          </div>
          <div className="field">
            <span className="field-label">战术模板</span>
            <div className="chips" role="group" aria-label="战术模板">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tactic-chip${templateId === t.id ? " on" : ""}`}
                  onClick={() => setTemplateId(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">时长</span>
            <div className="chips" role="group" aria-label="时长">
              {DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`tactic-chip${duration === m ? " on" : ""}`}
                  onClick={() => setDuration(m)}
                >
                  {m >= 60 ? `${m / 60} 时辰` : `${m} 分`}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={!templateId}
            onClick={() => onStart({ mode: "quest", templateId, durationMinutes: duration })}
          >
            安排行止
          </button>
        </div>
      )}
    </Sheet>
  );
}

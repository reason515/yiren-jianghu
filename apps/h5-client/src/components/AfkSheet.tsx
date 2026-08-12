import { useEffect, useState, type JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { ChoiceRow } from "./base/ChoiceRow.js";
import type {
  AfkGrindOption,
  AfkPresence,
  AfkQuestOption,
  AfkSkillOption,
  AfkStartConfig,
  AfkTemplateOption,
} from "../lib/afkTypes.js";

/**
 * 挂机启动面板（DC-043）：先选在线/离线，再选法门。
 * 在线仅生计/行侠；离线含修炼。运行中展示进度与累计收益。
 */
export interface AfkSheetProps {
  open: boolean;
  skills: AfkSkillOption[];
  quests: AfkQuestOption[];
  templates: AfkTemplateOption[];
  grindJobs: AfkGrindOption[];
  active: boolean;
  paused?: boolean;
  statusMessage: string;
  progress?: number;
  gains?: { exp: number; potential: number; silver: number };
  pending?: boolean;
  onStart: (config: AfkStartConfig) => void;
  onStop: () => void;
  onResume?: () => void;
  onClose: () => void;
}

const ONLINE_DURATIONS = [15, 30, 60];
const OFFLINE_DURATIONS = [15, 60, 120, 240, 480];

function durationLabel(minutes: number): string {
  if (minutes === 15) return "一刻";
  if (minutes === 30) return "两刻";
  if (minutes === 60) return "半时辰";
  return `${minutes / 120} 时辰`;
}

export function AfkSheet({
  open,
  skills,
  quests,
  templates,
  grindJobs,
  active,
  paused = false,
  statusMessage,
  progress = 0,
  gains = { exp: 0, potential: 0, silver: 0 },
  pending = false,
  onStart,
  onStop,
  onResume,
  onClose,
}: AfkSheetProps): JSX.Element | null {
  const [presence, setPresence] = useState<AfkPresence>("offline");
  const [mode, setMode] = useState<"practice" | "dazuo" | "tuna" | "quest" | "grind">("grind");
  const [skillId, setSkillId] = useState(skills[0]?.id ?? "");
  const [questId, setQuestId] = useState(quests[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [grindJobId, setGrindJobId] = useState(grindJobs[0]?.id ?? "");
  const durations = presence === "online" ? ONLINE_DURATIONS : OFFLINE_DURATIONS;
  const [duration, setDuration] = useState(durations[0]!);

  useEffect(() => {
    if (presence === "online" && (mode === "practice" || mode === "dazuo" || mode === "tuna"))
      setMode("grind");
  }, [presence, mode]);

  useEffect(() => {
    if (!durations.includes(duration)) setDuration(durations[0]!);
  }, [presence, duration, durations]);

  useEffect(() => {
    if (!skills.some((skill) => skill.id === skillId)) setSkillId(skills[0]?.id ?? "");
  }, [skillId, skills]);

  useEffect(() => {
    if (!quests.some((quest) => quest.id === questId)) setQuestId(quests[0]?.id ?? "");
  }, [questId, quests]);

  useEffect(() => {
    if (!templates.some((template) => template.id === templateId)) {
      setTemplateId(templates[0]?.id ?? "");
    }
  }, [templateId, templates]);

  useEffect(() => {
    if (!grindJobs.some((job) => job.id === grindJobId)) setGrindJobId(grindJobs[0]?.id ?? "");
  }, [grindJobId, grindJobs]);

  const canStart =
    mode === "practice"
      ? Boolean(skillId)
      : mode === "quest"
        ? Boolean(questId)
        : Boolean(grindJobId);

  const start = (): void => {
    if (mode === "practice") {
      onStart({
        kind: "practice",
        presence: "offline",
        durationMinutes: duration,
        config: { skillId },
      });
    } else if (mode === "dazuo") {
      onStart({ kind: "dazuo", presence: "offline", durationMinutes: duration, config: {} });
    } else if (mode === "tuna") {
      onStart({ kind: "tuna", presence: "offline", durationMinutes: duration, config: {} });
    } else if (mode === "quest" && questId) {
      onStart({
        kind: "quest",
        presence,
        ...(templateId ? { templateId } : {}),
        durationMinutes: duration,
        config: { questId },
      });
    } else if (mode === "grind" && grindJobId) {
      onStart({
        kind: "grind",
        presence,
        durationMinutes: duration,
        config: { jobId: grindJobId },
      });
    }
  };

  const lead =
    presence === "online"
      ? "在线行止轮回更密、所得更丰；须时时守着，断线即暂歇。"
      : mode === "practice"
        ? "勤练不辍，招式自会熟极而化。"
        : mode === "dazuo"
          ? "沉心运气，涓滴真息，终可聚成内力。"
          : mode === "tuna"
            ? "吐故纳新，神意归一，精力便有长进。"
            : mode === "quest"
              ? "既已应下差事，便按定下的路数行走江湖——事成与否，归来皆有交代。"
              : "不需动武，只换些碎银与历练。挂多久结多久，中途停下亦立刻清算。";

  return (
    <Sheet open={open} title="行止" onClose={onClose}>
      <p className="afk-lead">{lead}</p>

      {active ? (
        <div className="afk-running">
          <p className="afk-status">{statusMessage}</p>
          <div className="afk-progress" aria-label="挂机进度">
            <div className="afk-progress-track">
              <div
                className="afk-progress-fill"
                style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
              />
            </div>
            <p className="afk-progress-gains">
              已获 · <span className="gain-exp">历练 {Math.floor(gains.exp)}</span>
              <span className="gain-sep"> · </span>
              <span className="gain-pot">潜能 {Math.floor(gains.potential)}</span>
              <span className="gain-sep"> · </span>
              <span className="gain-silver">银两 {Math.floor(gains.silver)}</span>
            </p>
          </div>
          <div className="afk-running-actions">
            {paused && onResume ? (
              <button type="button" className="btn primary" disabled={pending} onClick={onResume}>
                继续行止
              </button>
            ) : null}
            <button type="button" className="btn danger" disabled={pending} onClick={onStop}>
              停止并结算
            </button>
          </div>
        </div>
      ) : (
        <div className="afk-form">
          <div className="field">
            <span className="field-label">方式</span>
            <ChoiceRow
              label="在线或离线"
              options={[
                { value: "offline", label: "离线", disabled: pending },
                { value: "online", label: "在线", disabled: pending },
              ]}
              value={presence}
              onChange={setPresence}
            />
          </div>

          <div className="field">
            <span className="field-label">行止</span>
            <ChoiceRow
              label="行止法门"
              options={[
                { value: "grind", label: "生计", disabled: pending },
                ...(presence === "offline"
                  ? [
                      { value: "practice" as const, label: "练功", disabled: pending },
                      { value: "dazuo" as const, label: "打坐", disabled: pending },
                      { value: "tuna" as const, label: "吐纳", disabled: pending },
                    ]
                  : []),
                { value: "quest", label: "行侠", disabled: pending },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>

          {mode === "practice" ? (
            <div className="field">
              <span className="field-label">练功武学</span>
              {skills.length > 0 ? (
                <div className="chips" role="group" aria-label="参悟武功">
                  {skills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      className={`tactic-chip${skillId === skill.id ? " on" : ""}`}
                      disabled={pending}
                      onClick={() => setSkillId(skill.id)}
                    >
                      {skill.name} · Lv.{skill.level}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="afk-empty">尚无可练的武功，先向师长请教一门本事。</p>
              )}
              <p className="afk-hint">练功耗气，不耗潜能。</p>
            </div>
          ) : mode === "dazuo" ? (
            <p className="afk-hint">打坐以气化力，循序渐进。</p>
          ) : mode === "tuna" ? (
            <p className="afk-hint">吐纳以精养神，贵在绵长。</p>
          ) : mode === "quest" ? (
            <>
              <div className="field">
                <span className="field-label">应下差事</span>
                {quests.length > 0 ? (
                  <div className="chips" role="group" aria-label="应下差事">
                    {quests.map((quest) => (
                      <button
                        key={quest.id}
                        type="button"
                        className={`tactic-chip${questId === quest.id ? " on" : ""}`}
                        disabled={pending}
                        onClick={() => setQuestId(quest.id)}
                      >
                        {quest.name} · 会一会{quest.targetName}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="afk-empty">手头没有可了结的差事，先去应下一桩悬赏。</p>
                )}
              </div>
              <div className="field">
                <span className="field-label">行侠路数</span>
                {templates.length > 0 ? (
                  <div className="chips" role="group" aria-label="行侠路数">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className={`tactic-chip${templateId === template.id ? " on" : ""}`}
                        disabled={pending}
                        onClick={() => setTemplateId(template.id)}
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="afk-empty">尚无战术谱，启程时将按稳守路数应敌。</p>
                )}
              </div>
            </>
          ) : (
            <div className="field">
              <span className="field-label">杂役</span>
              {grindJobs.length > 0 ? (
                <div className="chips" role="group" aria-label="杂役">
                  {grindJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      className={`tactic-chip${grindJobId === job.id ? " on" : ""}`}
                      disabled={pending}
                      onClick={() => setGrindJobId(job.id)}
                    >
                      {job.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="afk-empty">眼下没有可做的杂役——历练已够，或簿中暂无安排。</p>
              )}
              {grindJobId ? (
                <p className="afk-hint">
                  {grindJobs.find((job) => job.id === grindJobId)?.description}
                  {(() => {
                    const job = grindJobs.find((entry) => entry.id === grindJobId);
                    if (!job) return null;
                    const g = job.hourlyGain;
                    const mult = presence === "online" ? "（在线更高）" : "";
                    return ` · 每时约历练 ${g.exp}、潜能 ${g.potential}、银 ${g.silver}${mult}`;
                  })()}
                </p>
              ) : null}
            </div>
          )}

          <div className="field">
            <span className="field-label">时长</span>
            <div className="chips" role="group" aria-label="时长">
              {durations.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={`tactic-chip${duration === minutes ? " on" : ""}`}
                  disabled={pending}
                  onClick={() => setDuration(minutes)}
                >
                  {durationLabel(minutes)}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={!canStart || pending}
            onClick={start}
          >
            {pending
              ? "安排行止中…"
              : mode === "practice"
                ? "开始练功"
                : mode === "dazuo"
                  ? "开始打坐"
                  : mode === "tuna"
                    ? "开始吐纳"
                    : mode === "quest"
                      ? "启程行侠"
                      : "开始生计"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

import { useState, type JSX } from "react";
import { ChoiceRow } from "./base/ChoiceRow.js";
import { AttributeAllocator, ATTR_META, type Attrs, type AttrKey } from "./AttributeAllocator.js";
import type { ApiError, AuthApi, CreateCharacterInput } from "../lib/authApi.js";

/**
 * 角色创建（V2.3：全屏两步流程——序章引导 + 立名与根基）。
 * 序章：水墨远景舞台 + 宣纸卷轴竖排序文，交待"一人一江湖"背景并引导三事；
 * 表单：墨色舞台 + 宣纸控件成对（名号/性别/四维分配）。
 * 视觉组合 atmosphere.css 原语（ink-screen/ink-backdrop/prologue-scroll/paper-card/v-cols）；
 * 文案遵循 yjh-wuxia-copywriting。
 */
export interface CharacterCreateSheetProps {
  open: boolean;
  token: string;
  api: AuthApi;
  onCreated: (characterId: string) => void;
  onClose: () => void;
}

const CREATE_BUDGET = 80;
const CREATE_MIN = 10;
const CREATE_MAX = 30;

/** 序章卷竖排五句（短句顿挫、留白；先声夺人："一人一江湖"的来由）。 */
const INTRO_COLS = ["江湖万里", "只此一人", "此去无人相送", "名姓自取", "恩怨自了"] as const;

export function CharacterCreateSheet({
  open,
  token,
  api,
  onCreated,
  onClose: _onClose,
}: CharacterCreateSheetProps): JSX.Element | null {
  const [step, setStep] = useState<"intro" | "form">("intro");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [attrs, setAttrs] = useState<Attrs>({ str: 20, int: 20, con: 20, dex: 20 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("江湖路远，先立名号。");
      return;
    }
    if (trimmed.length > 8) {
      setError("名号八个字以内，再想短些。");
      return;
    }
    const input: CreateCharacterInput = { name: trimmed, gender, attrs };
    setBusy(true);
    setError(null);
    try {
      const { characterId } = await api.createCharacter(token, input);
      onCreated(characterId);
    } catch (err) {
      const e = err as ApiError;
      setError(e instanceof Error ? e.message : "立名失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ink-screen create-flow" data-testid="create-flow">
      {/* 墨色远景：atmosphere.css 原语（与登录页同一舞台） */}
      <div className="ink-backdrop" aria-hidden="true">
        <div className="ink-stars" />
        <div className="ink-moon" />
        <div className="ink-horizon" />
        <div className="ink-range back" />
        <div className="ink-range mid" />
        <div className="ink-range front" />
        <div className="ink-lights" aria-hidden="true" />
        <div className="ink-mist m1" />
        <div className="ink-mist m2" />
        <div className="ink-mist m3" />
        <div className="ink-vignette" />
      </div>

      {step === "intro" ? (
        <div className="ink-content create-intro">
          <div
            className="prologue-scroll paper-card rolls create-scroll"
            role="dialog"
            aria-label="入江湖序"
          >
            <div className="p-head">
              <span className="p-roll">入江湖</span>
            </div>
            <div className="v-cols">
              {INTRO_COLS.map((c) => (
                <p key={c} className="v-col">
                  {c}
                </p>
              ))}
            </div>
            <p className="p-mood">一人一江湖</p>
          </div>
          <p className="create-intro-lead">
            城门那边，有酒有剑，有恩怨，有江湖——都在等你的名字。
            <br />
            先立名号，分定根基，然后踏入。
          </p>
          <button type="button" className="btn paper create-begin" onClick={() => setStep("form")}>
            立名闯荡
          </button>
        </div>
      ) : (
        <div className="ink-content create-form">
          <div className="auth-seal">闯</div>
          <h1 className="auth-title create-title">立名闯江湖</h1>
          <p className="create-lead">江湖路远，先立名号。名号一旦定了，便随你走完这一程。</p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="field">
              <span className="field-label">名号</span>
              <input
                className="input paper"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="两到四字为佳"
                aria-label="名号"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </label>
            <div className="field">
              <span className="field-label">性别</span>
              <ChoiceRow
                label="性别"
                options={[
                  { value: "male", label: "男儿" },
                  { value: "female", label: "女儿" },
                ]}
                value={gender}
                onChange={setGender}
              />
            </div>
            <div className="field">
              <span className="field-label">四维 · 分配根基</span>
              <p className="field-hint">
                {ATTR_META.str.label}主{ATTR_META.str.hint}
                ，其余类推——根基定了，闯荡的路也就有了底色。
              </p>
              <AttributeAllocator
                initial={attrs}
                budget={CREATE_BUDGET}
                min={CREATE_MIN}
                max={CREATE_MAX}
                onChange={setAttrs}
              />
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn primary paper" disabled={busy}>
              {busy ? "踏入江湖…" : "踏入江湖"}
            </button>
          </form>
          <button type="button" className="create-back" onClick={() => setStep("intro")}>
            回想序章
          </button>
        </div>
      )}
    </div>
  );
}

export type { AttrKey };

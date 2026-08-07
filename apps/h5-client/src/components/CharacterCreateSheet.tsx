import { useState, type JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { ChoiceRow } from "./base/ChoiceRow.js";
import { AttributeAllocator, ATTR_META, type Attrs, type AttrKey } from "./AttributeAllocator.js";
import type { ApiError, AuthApi, CreateCharacterInput } from "../lib/authApi.js";

/** 角色创建（姓名 + 性别 + 四维分配；创建流程文案遵循 yjh-wuxia-copywriting）。 */
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

export function CharacterCreateSheet({
  open,
  token,
  api,
  onCreated,
  onClose,
}: CharacterCreateSheetProps): JSX.Element | null {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [attrs, setAttrs] = useState<Attrs>({ str: 20, int: 20, con: 20, dex: 20 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Sheet open={open} title="立名闯江湖" onClose={onClose}>
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
            className="input"
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
            {ATTR_META.str.label}主{ATTR_META.str.hint}，其余类推——根基定了，闯荡的路也就有了底色。
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
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "踏入江湖…" : "踏入江湖"}
        </button>
      </form>
    </Sheet>
  );
}

export type { AttrKey };

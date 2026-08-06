import { useState, type JSX } from "react";

/** 纯文本发帖/评论表单（受控社区；长度限制）。 */
export interface PostComposerProps {
  open: boolean;
  title: string;
  showTitleField: boolean;
  maxTitleLength?: number;
  maxBodyLength: number;
  submitLabel: string;
  onSubmit: (input: { title?: string; body: string }) => void;
  onClose: () => void;
}

export function PostComposer({
  open,
  title,
  showTitleField,
  maxTitleLength = 24,
  maxBodyLength,
  submitLabel,
  onSubmit,
  onClose,
}: PostComposerProps): JSX.Element | null {
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");

  if (!open) return null;

  const canSubmit =
    draftBody.trim().length > 0 && (!showTitleField || draftTitle.trim().length > 0);

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="post-composer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-top">
          <h3>{title}</h3>
          <button type="button" className="close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sheet-scroll">
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSubmit) return;
              onSubmit(
                showTitleField
                  ? { title: draftTitle.trim(), body: draftBody.trim() }
                  : { body: draftBody.trim() },
              );
              setDraftTitle("");
              setDraftBody("");
            }}
          >
            {showTitleField && (
              <label className="field">
                <span className="field-label">标题</span>
                <input
                  className="input"
                  value={draftTitle}
                  maxLength={maxTitleLength}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  aria-label="标题"
                />
              </label>
            )}
            <label className="field">
              <span className="field-label">正文</span>
              <textarea
                className="input textarea"
                value={draftBody}
                maxLength={maxBodyLength}
                rows={6}
                onChange={(e) => setDraftBody(e.target.value)}
                aria-label="正文"
                placeholder="只说人话，莫谈他事。"
              />
              <span className="composer-count">
                {draftBody.length}/{maxBodyLength}
              </span>
            </label>
            <button type="submit" className="btn primary" disabled={!canSubmit}>
              {submitLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

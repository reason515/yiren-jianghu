import type { JSX } from "react";

/** 轻量提示（z-index 200 高于一切浮层；见 yjh-mobile-ui）。 */
export interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps): JSX.Element {
  return (
    <div className={`toast${message ? " show" : ""}`} role="status" aria-live="polite">
      {message ?? ""}
    </div>
  );
}

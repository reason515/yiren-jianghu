import type { JSX } from "react";

/** 轻量插画占位（首字印章；正式插画接入前的统一占位，token 驱动）。 */
export interface ArtPlaceholderProps {
  text: string;
  tone?: "jade" | "cinnabar" | "gold";
  size?: "sm" | "md";
}

export function ArtPlaceholder({
  text,
  tone = "jade",
  size = "md",
}: ArtPlaceholderProps): JSX.Element {
  const ch = [...text][0] ?? "侠";
  return (
    <span
      className={`art-placeholder ${tone} ${size}`}
      role="img"
      aria-label={`${text}（占位插画）`}
    >
      {ch}
    </span>
  );
}

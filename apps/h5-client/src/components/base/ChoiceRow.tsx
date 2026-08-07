import type { JSX } from "react";

/**
 * 分段控件（泛型化，对齐 mobile-ui §4.2：互斥选择统一 ChoiceRow<T>，禁原生 select）。
 * 选中态玉色描边（.seg-btn.on）；行为由调用方传入 value/onChange。
 */
export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface ChoiceRowProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** aria-label（分组语义，如“行止法门”“榜单”）。 */
  label: string;
}

export function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
  label,
}: ChoiceRowProps<T>): JSX.Element {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`seg-btn${value === option.value ? " on" : ""}`}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

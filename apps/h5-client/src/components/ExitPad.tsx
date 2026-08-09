import type { JSX } from "react";
import type { SceneExit } from "../lib/sceneTypes.js";

/**
 * 出口罗盘（V2.9 重构：只显示可前往的方向，行内居中，画面干净紧凑）。
 * 方位语义保留（北行在上、南行在下，map-design 八向语义）；无法前往的方向不渲染，
 * 中心为当前房间。纵向出口（上/下/进/出/入）单独右侧竖列。
 */
export interface ExitPadProps {
  exits: SceneExit[];
  roomName: string;
  onGo: (dir: string) => void;
  /** DC-045：在线生计 running 时锁定出口。 */
  locked?: boolean;
  lockedHint?: string;
}

const PLANAR_ROWS: string[][] = [
  ["northwest", "north", "northeast"],
  ["west", "east"],
  ["southwest", "south", "southeast"],
];

const VERTICAL = ["up", "down", "enter", "out", "in"];

export const DIR_LABEL: Record<string, string> = {
  north: "北",
  northeast: "东北",
  east: "东",
  southeast: "东南",
  south: "南",
  southwest: "西南",
  west: "西",
  northwest: "西北",
  up: "上",
  down: "下",
  enter: "进",
  out: "出",
  in: "入",
};

export function ExitPad({
  exits,
  roomName,
  onGo,
  locked = false,
  lockedHint = "行止未歇，不便擅离",
}: ExitPadProps): JSX.Element {
  const byDir = new Map(exits.map((e) => [e.dir, e]));
  const vertical = VERTICAL.filter((d) => byDir.has(d));

  const cell = (dir: string): JSX.Element | null => {
    const exit = byDir.get(dir);
    if (!exit) return null;
    return (
      <button
        key={dir}
        type="button"
        className={`exit-cell has${locked ? " locked" : ""}`}
        data-dir={dir}
        disabled={locked}
        title={locked ? lockedHint : undefined}
        aria-label={locked ? lockedHint : `向${DIR_LABEL[dir]}往${exit.name ?? exit.roomId}`}
        onClick={() => {
          if (!locked) onGo(exit.dir);
        }}
      >
        {DIR_LABEL[dir]}
      </button>
    );
  };

  return (
    <div className="exit-pad" data-testid="exit-pad" role="group" aria-label="出口">
      {locked ? (
        <p className="exit-locked-hint" data-testid="exit-locked">
          {lockedHint}
        </p>
      ) : null}
      <div className="exit-compass">
        {PLANAR_ROWS.map((row, rowIndex) => (
          <div key={row.join()} className={`exit-row${rowIndex === 1 ? " mid" : ""}`}>
            {rowIndex === 1 && cell("west")}
            {rowIndex === 1 ? (
              <span className="exit-center" data-testid="exit-center">
                <span className="exit-center-name">{roomName}</span>
              </span>
            ) : null}
            {rowIndex === 1 && cell("east")}
            {rowIndex !== 1 && row.map(cell)}
          </div>
        ))}
      </div>
      {vertical.length > 0 && (
        <div className="exit-vertical" role="group" aria-label="纵向出口">
          {vertical.map((d) => {
            const exit = byDir.get(d)!;
            return (
              <button
                key={d}
                type="button"
                className={`exit-cell vertical${locked ? " locked" : ""}`}
                disabled={locked}
                title={locked ? lockedHint : undefined}
                aria-label={
                  locked ? lockedHint : `往${DIR_LABEL[d]}（${exit.name ?? exit.roomId}）`
                }
                onClick={() => {
                  if (!locked) onGo(d);
                }}
              >
                {DIR_LABEL[d]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

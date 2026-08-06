import type { JSX } from "react";
import type { SceneExit } from "../lib/sceneTypes.js";

/**
 * 出口九宫格（map-design 场景方位图：上北下南左西右东，斜向占四角；上/下/进/出竖列右侧）。
 * 无出口方向留空；固定北标，不逐边标字。
 */
export interface ExitPadProps {
  exits: SceneExit[];
  roomName: string;
  onGo: (dir: string) => void;
}

/** 3×3 九宫格：index 0..8，位置 4 为当前房间。 */
const PLANAR_ORDER: Array<{ index: number; dir?: string }> = [
  { index: 0, dir: "northwest" },
  { index: 1, dir: "north" },
  { index: 2, dir: "northeast" },
  { index: 3, dir: "west" },
  { index: 4 },
  { index: 5, dir: "east" },
  { index: 6, dir: "southwest" },
  { index: 7, dir: "south" },
  { index: 8, dir: "southeast" },
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

export function ExitPad({ exits, roomName, onGo }: ExitPadProps): JSX.Element {
  const byDir = new Map(exits.map((e) => [e.dir, e]));
  const vertical = VERTICAL.filter((d) => byDir.has(d));

  return (
    <div className="exit-pad" data-testid="exit-pad" role="group" aria-label="出口">
      <div className="exit-grid">
        {PLANAR_ORDER.map(({ index, dir }) => {
          if (!dir) {
            return (
              <div key="center" className="exit-cell center" data-testid="exit-center">
                <span className="exit-center-name">{roomName}</span>
              </div>
            );
          }
          const exit = byDir.get(dir);
          return (
            <button
              key={dir}
              type="button"
              className={`exit-cell${exit ? " has" : ""}`}
              data-dir={dir}
              aria-label={
                exit
                  ? `向${DIR_LABEL[dir]}往${exit.name ?? exit.roomId}`
                  : `${DIR_LABEL[dir]}无出口`
              }
              disabled={!exit}
              onClick={() => exit && onGo(exit.dir)}
            >
              {exit ? DIR_LABEL[dir] : ""}
            </button>
          );
        })}
      </div>
      {vertical.length > 0 && (
        <div className="exit-vertical" role="group" aria-label="纵向出口">
          {vertical.map((d) => {
            const exit = byDir.get(d)!;
            return (
              <button
                key={d}
                type="button"
                className="exit-cell vertical"
                aria-label={`往${DIR_LABEL[d]}（${exit.name ?? exit.roomId}）`}
                onClick={() => onGo(d)}
              >
                {DIR_LABEL[d]}
              </button>
            );
          })}
        </div>
      )}
      <div className="exit-north">北</div>
    </div>
  );
}

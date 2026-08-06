import { useRef, useState, type JSX } from "react";
import { Sheet } from "./base/Sheet.js";

/**
 * 区域地图（map-design：语义网格八向渲染、动态 viewBox、北标、缩放/拖拽/回到位置）。
 * 数据来自内容包 rooms.grid + exits（与 C10 导航共享出口真相；可前往节点点击真实移动）。
 */

export interface MapRoomView {
  id: string;
  name: string;
  grid: [number, number];
  state: "current" | "visited" | "locked";
}

export interface MapEdgeView {
  from: string;
  to: string;
}

export interface MapSheetProps {
  open: boolean;
  rooms: MapRoomView[];
  edges: MapEdgeView[];
  areaLabel?: string;
  onNavigate: (roomId: string) => void;
  onClose: () => void;
}

const STEP = { x: 150, y: 110 };
const PAD = 90;
const NODE_H = 36;

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function buildLayout(rooms: MapRoomView[]): {
  layout: Map<string, { x: number; y: number }>;
  boxes: Box[];
} {
  const layout = new Map<string, { x: number; y: number }>();
  const boxes: Box[] = [];
  for (const room of rooms) {
    const x = room.grid[0] * STEP.x;
    const y = room.grid[1] * STEP.y;
    layout.set(room.id, { x, y });
    const w = Math.max(84, room.name.length * 18 + 24);
    boxes.push({
      id: room.id,
      x,
      y,
      w,
      h: NODE_H,
      left: x - w / 2 - 8,
      right: x + w / 2 + 8,
      top: y - NODE_H / 2 - 8,
      bottom: y + NODE_H / 2 + 8,
    });
  }
  return { layout, boxes };
}

/** 端点裁切到节点框外缘（边线与箭头不被节点遮住）。 */
function trimToEdge(
  from: { x: number; y: number },
  to: { x: number; y: number },
  box: Box,
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return to;
  const scale = 1 / Math.max(Math.abs(dx) / (box.w / 2 + 8), Math.abs(dy) / (box.h / 2 + 8));
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

export function MapSheet({
  open,
  rooms,
  edges,
  areaLabel,
  onNavigate,
  onClose,
}: MapSheetProps): JSX.Element | null {
  const { layout, boxes } = buildLayout(rooms);
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ zoom: 1, cx: 0, cy: 0 });
  const drag = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  // 动态 viewBox（含负坐标留白）
  const xs = boxes.flatMap((b) => [b.left, b.right]);
  const ys = boxes.flatMap((b) => [b.top, b.bottom]);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const maxY = Math.max(...ys) + PAD;
  const vw = maxX - minX;
  const vh = maxY - minY;
  const baseCx = minX + vw / 2;
  const baseCy = minY + vh / 2;

  const clamp = (
    cx: number,
    cy: number,
    zoom: number,
  ): { cx: number; cy: number; zoom: number } => {
    const z = Math.max(0.8, Math.min(3, zoom));
    const w = vw / z;
    const h = vh / z;
    return {
      zoom: z,
      cx: Math.max(minX + w / 2, Math.min(maxX - w / 2, cx)),
      cy: Math.max(minY + h / 2, Math.min(maxY - h / 2, cy)),
    };
  };

  const located = view.zoom === 1 && view.cx === 0 && view.cy === 0;
  const cx = located ? baseCx : view.cx;
  const cy = located ? baseCy : view.cy;
  const zoom = located ? 1 : view.zoom;
  const w = vw / zoom;
  const h = vh / zoom;
  const viewBox = `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;

  const zoomBy = (f: number): void =>
    setView((v) => clamp(v.cx === 0 ? baseCx : v.cx, v.cy === 0 ? baseCy : v.cy, v.zoom * f));
  const locate = (): void => setView({ zoom: 1, cx: 0, cy: 0 });

  const onPointerDown = (e: React.PointerEvent): void => {
    drag.current = { x: e.clientX, y: e.clientY, dragging: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.dragging = d.dragging || Math.abs(dx) + Math.abs(dy) > 3;
    if (d.dragging) {
      const rect = e.currentTarget.getBoundingClientRect();
      setView((v) => {
        const z = v.zoom === 1 && v.cx === 0 ? 1 : v.zoom;
        return clamp(
          (v.cx === 0 ? baseCx : v.cx) - (dx * vw) / rect.width / z,
          (v.cy === 0 ? baseCy : v.cy) - (dy * vh) / rect.height / z,
          z,
        );
      });
    }
  };
  const onPointerUp = (): void => {
    drag.current = null;
  };

  return (
    <Sheet open={open} title={areaLabel ?? "掌中舆图"} onClose={onClose}>
      <div className="map-wrap">
        <div className="map-controls" role="group" aria-label="地图控件">
          <button type="button" aria-label="缩小" onClick={() => zoomBy(0.8)}>
            −
          </button>
          <button type="button" aria-label="放大" onClick={() => zoomBy(1.25)}>
            ＋
          </button>
          <button type="button" aria-label="回到位置" onClick={locate}>
            回到位置
          </button>
        </div>
        <svg
          ref={svgRef}
          className="map-svg"
          viewBox={viewBox}
          role="group"
          aria-label={areaLabel ? `${areaLabel}舆图` : "舆图"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-testid="map-svg"
        >
          <text className="map-north" x={maxX - 40} y={minY + 22}>
            北
          </text>
          <g className="map-edges" data-testid="map-edges">
            {edges.map((e, i) => {
              const a = layout.get(e.from);
              const b = layout.get(e.to);
              if (!a || !b) return null;
              const from = trimToEdge(
                a,
                b,
                boxes.find((x) => x.id === e.from)!,
              );
              const to = trimToEdge(
                b,
                a,
                boxes.find((x) => x.id === e.to)!,
              );
              return (
                <path key={i} className="map-edge" d={`M${from.x},${from.y} L${to.x},${to.y}`} />
              );
            })}
          </g>
          <g className="map-nodes" data-testid="map-nodes">
            {rooms.map((room) => {
              const box = boxes.find((b) => b.id === room.id)!;
              const p = layout.get(room.id)!;
              const locked = room.state === "locked";
              return (
                <g
                  key={room.id}
                  className={`map-node ${room.state}`}
                  role="button"
                  tabIndex={locked ? -1 : 0}
                  aria-label={
                    locked
                      ? `${room.name}（尚未开放）`
                      : `${room.name}${room.state === "current" ? "（在此）" : ""}`
                  }
                  data-map-node={room.id}
                  onClick={() => !locked && onNavigate(room.id)}
                  onKeyDown={(e) => {
                    if (!locked && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onNavigate(room.id);
                    }
                  }}
                >
                  <rect
                    x={p.x - box.w / 2}
                    y={p.y - box.h / 2}
                    width={box.w}
                    height={box.h}
                    rx={5}
                  />
                  <text x={p.x} y={p.y + 5} textAnchor="middle">
                    {room.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </Sheet>
  );
}

export type { Box };

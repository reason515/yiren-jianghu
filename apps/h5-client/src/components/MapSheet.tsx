import { useEffect, useRef, useState, type JSX } from "react";
import { Sheet } from "./base/Sheet.js";
import { ChoiceRow } from "./base/ChoiceRow.js";
import type { MapEdgeView, MapRoomView, WorldNodeView, WorldRoadView } from "../lib/mapTypes.js";

/**
 * 舆图浮层（map-design：本域八向网格 + 天下图 Tab）。
 * 默认「本域」；天下图只展示地理与道路，不伪装传送。
 */

export interface MapSheetProps {
  open: boolean;
  areaLabel?: string;
  rooms: MapRoomView[];
  edges: MapEdgeView[];
  worldNodes?: WorldNodeView[];
  worldRoads?: WorldRoadView[];
  /** 默认页签；打开时重置。 */
  initialTab?: "area" | "world";
  onNavigate: (roomId: string) => void;
  /** 点选天下节点：当前区域切回本域；其它区域由调用方提示（不可传送）。 */
  onSelectWorldArea?: (areaId: string) => void;
  onClose: () => void;
}

const STEP = { x: 150, y: 110 };
const PAD = 90;
const NODE_H = 36;
const WORLD_PAD = 70;

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

function worldNodeSize(scale: string): { w: number; h: number } {
  if (scale === "capital") return { w: 108, h: 44 };
  if (scale === "pass") return { w: 96, h: 40 };
  return { w: 88, h: 36 };
}

function buildWorldLayout(nodes: WorldNodeView[]): {
  layout: Map<string, { x: number; y: number }>;
  boxes: Box[];
} {
  const layout = new Map<string, { x: number; y: number }>();
  const boxes: Box[] = [];
  for (const node of nodes) {
    const [x, y] = node.geo;
    layout.set(node.id, { x, y });
    const { w, h } = worldNodeSize(node.scale);
    boxes.push({
      id: node.id,
      x,
      y,
      w,
      h,
      left: x - w / 2 - 8,
      right: x + w / 2 + 8,
      top: y - h / 2 - 8,
      bottom: y + h / 2 + 8,
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

function useMapViewport(boxes: Box[], pad: number) {
  const [view, setView] = useState({ zoom: 1, cx: 0, cy: 0 });
  const drag = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  const empty = boxes.length === 0;
  const xs = boxes.flatMap((b) => [b.left, b.right]);
  const ys = boxes.flatMap((b) => [b.top, b.bottom]);
  const minX = empty ? -pad : Math.min(...xs) - pad;
  const minY = empty ? -pad : Math.min(...ys) - pad;
  const maxX = empty ? pad : Math.max(...xs) + pad;
  const maxY = empty ? pad : Math.max(...ys) + pad;
  const vw = Math.max(1, maxX - minX);
  const vh = Math.max(1, maxY - minY);
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
      d.x = e.clientX;
      d.y = e.clientY;
    }
  };
  const onPointerUp = (): void => {
    drag.current = null;
  };

  return {
    viewBox,
    north: { x: maxX - 40, y: minY + 22 },
    zoomBy,
    locate,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}

export function MapSheet({
  open,
  areaLabel,
  rooms,
  edges,
  worldNodes = [],
  worldRoads = [],
  initialTab = "area",
  onNavigate,
  onSelectWorldArea,
  onClose,
}: MapSheetProps): JSX.Element | null {
  const [tab, setTab] = useState<"area" | "world">(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const area = buildLayout(rooms);
  const world = buildWorldLayout(worldNodes);
  const areaView = useMapViewport(area.boxes, PAD);
  const worldView = useMapViewport(world.boxes, WORLD_PAD);
  const active = tab === "area" ? areaView : worldView;

  const title = tab === "area" ? (areaLabel ?? "本域舆图") : "天下舆图";

  const onWorldClick = (node: WorldNodeView): void => {
    if (node.state === "current") {
      setTab("area");
      return;
    }
    onSelectWorldArea?.(node.id);
  };

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="map-sheet-body">
        <ChoiceRow
          label="舆图范围"
          value={tab}
          onChange={setTab}
          options={[
            { value: "area", label: "本域" },
            { value: "world", label: "天下" },
          ]}
        />
        <div className="map-wrap">
          <div className="map-controls" role="group" aria-label="地图控件">
            <button type="button" aria-label="缩小" onClick={() => active.zoomBy(0.8)}>
              −
            </button>
            <button type="button" aria-label="放大" onClick={() => active.zoomBy(1.25)}>
              ＋
            </button>
            <button type="button" aria-label="回到位置" onClick={active.locate}>
              回到位置
            </button>
          </div>
          {tab === "area" ? (
            <svg
              className="map-svg"
              viewBox={areaView.viewBox}
              role="group"
              aria-label={areaLabel ? `${areaLabel}舆图` : "本域舆图"}
              onPointerDown={areaView.onPointerDown}
              onPointerMove={areaView.onPointerMove}
              onPointerUp={areaView.onPointerUp}
              onPointerCancel={areaView.onPointerUp}
              data-testid="map-svg"
            >
              <text className="map-north" x={areaView.north.x} y={areaView.north.y}>
                北
              </text>
              <g className="map-edges" data-testid="map-edges">
                {edges.map((e, i) => {
                  const a = area.layout.get(e.from);
                  const b = area.layout.get(e.to);
                  if (!a || !b) return null;
                  const from = trimToEdge(
                    a,
                    b,
                    area.boxes.find((x) => x.id === e.from)!,
                  );
                  const to = trimToEdge(
                    b,
                    a,
                    area.boxes.find((x) => x.id === e.to)!,
                  );
                  const mx = (from.x + to.x) / 2;
                  const my = (from.y + to.y) / 2;
                  const dx = to.x - from.x;
                  const dy = to.y - from.y;
                  const len = Math.hypot(dx, dy) || 1;
                  const off = (i % 2 === 0 ? 1 : -1) * Math.min(10, len * 0.08);
                  const cpx = mx + (-dy / len) * off;
                  const cpy = my + (dx / len) * off;
                  return (
                    <path
                      key={i}
                      className="map-edge"
                      d={`M${from.x},${from.y} Q${cpx},${cpy} ${to.x},${to.y}`}
                    />
                  );
                })}
              </g>
              <g className="map-nodes" data-testid="map-nodes">
                {rooms.map((room) => {
                  const box = area.boxes.find((b) => b.id === room.id)!;
                  const p = area.layout.get(room.id)!;
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
                      onKeyDown={(ev) => {
                        if (!locked && (ev.key === "Enter" || ev.key === " ")) {
                          ev.preventDefault();
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
          ) : (
            <svg
              className="map-svg"
              viewBox={worldView.viewBox}
              role="group"
              aria-label="天下舆图"
              onPointerDown={worldView.onPointerDown}
              onPointerMove={worldView.onPointerMove}
              onPointerUp={worldView.onPointerUp}
              onPointerCancel={worldView.onPointerUp}
              data-testid="world-map-svg"
            >
              <text className="map-north" x={worldView.north.x} y={worldView.north.y}>
                北
              </text>
              <g className="map-edges" data-testid="world-map-roads">
                {worldRoads.map((road, i) => {
                  const a = world.layout.get(road.from);
                  const b = world.layout.get(road.to);
                  if (!a || !b) return null;
                  const from = trimToEdge(
                    a,
                    b,
                    world.boxes.find((x) => x.id === road.from)!,
                  );
                  const to = trimToEdge(
                    b,
                    a,
                    world.boxes.find((x) => x.id === road.to)!,
                  );
                  return (
                    <path
                      key={i}
                      className="map-edge world-road"
                      d={`M${from.x},${from.y} L${to.x},${to.y}`}
                    />
                  );
                })}
              </g>
              <g className="map-nodes" data-testid="world-map-nodes">
                {worldNodes.map((node) => {
                  const box = world.boxes.find((b) => b.id === node.id)!;
                  const p = world.layout.get(node.id)!;
                  const diamond = node.scale === "pass";
                  return (
                    <g
                      key={node.id}
                      className={`map-node world-node ${node.state} scale-${node.scale}`}
                      role="button"
                      tabIndex={0}
                      aria-label={node.state === "current" ? `${node.name}（在此）` : node.name}
                      data-world-node={node.id}
                      onClick={() => onWorldClick(node)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          onWorldClick(node);
                        }
                      }}
                    >
                      {diamond ? (
                        <polygon
                          points={[
                            `${p.x},${p.y - box.h / 2}`,
                            `${p.x + box.w / 2},${p.y}`,
                            `${p.x},${p.y + box.h / 2}`,
                            `${p.x - box.w / 2},${p.y}`,
                          ].join(" ")}
                        />
                      ) : (
                        <rect
                          x={p.x - box.w / 2}
                          y={p.y - box.h / 2}
                          width={box.w}
                          height={box.h}
                          rx={node.scale === "capital" ? 8 : 5}
                        />
                      )}
                      <text x={p.x} y={p.y + 5} textAnchor="middle">
                        {node.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
        </div>
        {tab === "world" && (
          <p className="map-world-hint">点选所在之地可回本域；远方只可观望，不可传送。</p>
        )}
      </div>
    </Sheet>
  );
}

export type { MapRoomView, MapEdgeView };

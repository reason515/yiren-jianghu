/** 区域/天下舆图数据（GET /map 服务端组装）。 */

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

export interface WorldNodeView {
  id: string;
  name: string;
  kind: string;
  geo: [number, number];
  scale: string;
  state: "current" | "known";
}

export interface WorldRoadView {
  from: string;
  to: string;
  mode: string;
}

export interface MapData {
  areaId: string;
  areaLabel: string;
  rooms: MapRoomView[];
  edges: MapEdgeView[];
  world: {
    nodes: WorldNodeView[];
    roads: WorldRoadView[];
  };
}

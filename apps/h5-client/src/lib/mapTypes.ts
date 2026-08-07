/** 区域舆图数据（GET /map 服务端组装：内容包 rooms.grid + exits 驱动）。 */

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

export interface MapData {
  rooms: MapRoomView[];
  edges: MapEdgeView[];
}

---
name: yjh-map-design
description: 《一人江湖》(yiren-jianghu) 地图设计规范——区域地图与世界地图（舆图/天下图）的数据契约、八向语义网格、多视图一致性、开发期校验与交互基线。触发条件：设计或修改场景方位图、区域地图、世界总览；为房间补充地图布局数据（grid 坐标/出口方向/via 绕行）；地图节点重叠、路线穿节点、方位错乱、缩放拖动交互问题；用户提到"地图""舆图""八方向""区域总览""世界地图""地图数据"。地图逻辑导航（BFS/白名单）见 game-core/map.ts（C10），本 skill 管地图的表现层数据与渲染语义。文案遵循 yjh-wuxia-copywriting。
---

# yjh-map-design（已迁移）

权威副本：`.cursor/skills/yjh-map-design/SKILL.md`

本文件仅为 pi 目录兼容 stub。**必须 read 上述权威文件**，勿在此 stub 上编辑或凭记忆继续。修改 skill 只改 `.cursor/skills/`。

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/atmosphere.css";
import "./styles/auth.css";
import "./styles/scene.css";
import "./styles/character.css";
import "./styles/combat.css";
import "./styles/afk.css";
import "./styles/quest.css";
import "./styles/forum.css";
import "./styles/leaderboard.css";
import "./styles/pvp.css";
import "./styles/map.css";
import "./styles/reconnect.css";
import "./styles/tactic.css";
import "./styles/visual.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root 不存在");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import { type JSX } from "react";

/**
 * 起程过场（V2.6：建角后、进入场景前的剧情过渡）。
 * 形态：水墨远景 + 宣纸卡片横排叙事（复用 atmosphere 原语 ink-screen/ink-backdrop/paper-card）。
 * 叙事对齐内容包：老屋·旧榻醒来（village_start）→ 村口有武馆/杂货铺/客栈（village_square）
 * → 野狗祸患（q_newbie_trail 主线）。文案遵循 yjh-wuxia-copywriting（先声夺人、短句、留白）。
 */
export interface DepartureOverlayProps {
  /** 角色名（resume 就绪后传入，用于"从今天起，你叫「X」"）。 */
  name: string;
  onDone: () => void;
}

export function DepartureOverlay({ name, onDone }: DepartureOverlayProps): JSX.Element {
  return (
    <div className="ink-screen depart-flow" data-testid="departure-overlay">
      {/* 墨色远景：与登录/建角同一舞台 */}
      <div className="ink-backdrop" aria-hidden="true">
        <div className="ink-stars" />
        <div className="ink-moon" />
        <div className="ink-horizon" />
        <div className="ink-range back" />
        <div className="ink-range mid" />
        <div className="ink-range front" />
        <div className="ink-lights" aria-hidden="true" />
        <div className="ink-mist m1" />
        <div className="ink-mist m2" />
        <div className="ink-mist m3" />
        <div className="ink-vignette" />
      </div>

      <div className="ink-content depart-content">
        <div className="paper-card depart-card" role="dialog" aria-label="起程">
          <div className="auth-seal depart-seal">起</div>
          <h2 className="depart-title">老屋晨光</h2>
          <p className="depart-body">
            鸡鸣三遍，晨光透进窗纸。你在老屋的硬板床上醒来——门扉虚掩，屋外是一座陌生的村子。
          </p>
          <p className="depart-body">
            从今天起，你叫<span className="depart-name">「{name}」</span>
            。晒谷场边有武馆、杂货铺、客栈；听说村外的野狗夜里总来糟蹋庄稼，村长正愁没人收拾。
          </p>
          <p className="depart-close">江湖的第一步，往往从一件小事开始。</p>
          <button type="button" className="btn paper depart-btn" onClick={onDone}>
            起身推门
          </button>
        </div>
      </div>
    </div>
  );
}

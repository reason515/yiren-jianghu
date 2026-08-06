/** 环境音占位（可注入真实播放器；默认 no-op，事件映射表为后续接入预留）。 */

export type SoundEvent =
  "combat.hit" | "combat.perform" | "combat.victory" | "quest.complete" | "afk.report" | "ui.tap";

export interface SoundPlayer {
  play(event: SoundEvent): void;
}

export function createSoundPlayer(opts: { enabled: boolean; impl?: SoundPlayer }): SoundPlayer {
  return {
    play: (event) => {
      if (opts.enabled) opts.impl?.play(event);
    },
  };
}

/** 事件 → 音效资源映射（占位；E 阶段后接入真实音频）。 */
export const SOUND_ASSETS: Record<SoundEvent, string | null> = {
  "combat.hit": null,
  "combat.perform": null,
  "combat.victory": null,
  "quest.complete": null,
  "afk.report": null,
  "ui.tap": null,
};

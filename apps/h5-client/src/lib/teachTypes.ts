/** 当面请教报价（GET /skills/teach-offer，DC-039/041）。 */

export interface TeachOfferRow {
  skillId: string;
  skillName: string;
  currentLevel: number;
  nextLevel: number;
  teachCap: number;
  cost: { silver: number; jing: number; potential: number };
  canLearn: boolean;
  blockedReason?: string;
}

export interface TeachPerformOfferRow {
  performId: string;
  performName: string;
  skillId: string;
  skillName: string;
  learnMinLevel: number;
  alreadyLearned: boolean;
  canLearn: boolean;
  blockedReason?: string;
}

export interface TeachOfferData {
  npc: { id: string; name: string; kind: string; sectId?: string };
  offers: TeachOfferRow[];
  performOffers?: TeachPerformOfferRow[];
}

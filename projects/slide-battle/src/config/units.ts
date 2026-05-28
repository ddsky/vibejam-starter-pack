export type UnitType = "swordsman" | "archer" | "knight";
export type Team = "player" | "ai";
export type GameMode = "ai" | "pvp";

export interface UnitStats {
  hp: number;
  radius: number;
  mass: number;
  knockbackMult: number;
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  swordsman: { hp: 100, radius: 28, mass: 1.0, knockbackMult: 1.0 },
  archer:    { hp:  80, radius: 26, mass: 0.8, knockbackMult: 1.2 },
  knight:    { hp: 150, radius: 32, mass: 1.6, knockbackMult: 0.7 },
};

export const DAMAGE_MATRIX: Record<UnitType, Record<UnitType, number>> = {
  swordsman: { swordsman: 20, archer: 40, knight: 10 },
  archer:    { swordsman: 15, archer: 30, knight: 10 },
  knight:    { swordsman: 30, archer: 50, knight: 20 },
};

export const TEAM_COLORS: Record<Team, number> = {
  player: 0x3a7bd5,
  ai: 0xc4452d,
};

export const TEAM_LABELS: Record<Team, string> = {
  player: "You",
  ai: "AI",
};

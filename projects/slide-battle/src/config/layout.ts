import type { Team, UnitType } from "./units";
import {
  PLAYFIELD_LEFT,
  PLAYFIELD_RIGHT,
  PLAYFIELD_TOP,
  PLAYFIELD_BOTTOM,
  PLAYFIELD_WIDTH,
} from "./balance";

export interface UnitSpawn {
  team: Team;
  type: UnitType;
  x: number;
  y: number;
}

export interface ObstacleSpawn {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SPAWN_ROW_INSET = 54;
const playerRowY = PLAYFIELD_BOTTOM - SPAWN_ROW_INSET;
const aiRowY = PLAYFIELD_TOP + SPAWN_ROW_INSET;
const lane = (i: number, n: number) => {
  const spacing = PLAYFIELD_WIDTH / (n + 1);
  return PLAYFIELD_LEFT + spacing * (i + 1);
};

export const UNIT_SPAWNS: UnitSpawn[] = [
  { team: "player", type: "swordsman", x: lane(0, 4), y: playerRowY },
  { team: "player", type: "archer",    x: lane(1, 4), y: playerRowY },
  { team: "player", type: "knight",    x: lane(2, 4), y: playerRowY },
  { team: "player", type: "swordsman", x: lane(3, 4), y: playerRowY },
  { team: "ai", type: "swordsman", x: lane(0, 4), y: aiRowY },
  { team: "ai", type: "archer",    x: lane(1, 4), y: aiRowY },
  { team: "ai", type: "knight",    x: lane(2, 4), y: aiRowY },
  { team: "ai", type: "swordsman", x: lane(3, 4), y: aiRowY },
];

const playfieldCenterX = (PLAYFIELD_LEFT + PLAYFIELD_RIGHT) / 2;
const playfieldCenterY = (PLAYFIELD_TOP + PLAYFIELD_BOTTOM) / 2;

export const OBSTACLE_SPAWNS: ObstacleSpawn[] = [
  { x: playfieldCenterX - 280, y: playfieldCenterY, width: 80, height: 130 },
  { x: playfieldCenterX + 280, y: playfieldCenterY, width: 80, height: 130 },
  { x: playfieldCenterX, y: playfieldCenterY, width: 160, height: 60 },
];

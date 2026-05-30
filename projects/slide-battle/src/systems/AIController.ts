import Phaser from "phaser";
import type { Unit } from "../objects/Unit";
import type { Obstacle } from "../objects/Obstacle";
import type { Arrow } from "../objects/Arrow";
import type { TurnManager } from "./TurnManager";
import type { Terrain } from "./Terrain";
import { TERRAIN_CELL_W } from "../config/balance";
import { DAMAGE_MATRIX, UNIT_STATS } from "../config/units";
import {
  AI_ACTION_PACING_MS,
  ARROW_HSPEED_MIN,
  ARROW_HSPEED_MAX,
  ARROW_VH_MIN,
  ARROW_VH_MAX,
  ARROW_GRAVITY,
  FRICTION,
  MAX_LAUNCH_SPEED,
  MIN_LAUNCH_SPEED,
  PLAYFIELD_BOTTOM,
  PLAYFIELD_LEFT,
  PLAYFIELD_RIGHT,
  PLAYFIELD_TOP,
} from "../config/balance";
import { launchUnit } from "./DragInput";

const AI_OBSTACLE_CLEARANCE = 10;
const POSITIONING_POWER_LEVELS = [0.38, 0.52, 0.66, 0.8];
const POSITIONING_ANGLE_OFFSETS_DEG = [0, -18, 18, -34, 34, -52, 52, -72, 72, -96, 96];

export interface AIDeps {
  scene: Phaser.Scene;
  turnManager: TurnManager;
  units: Phaser.Physics.Arcade.Group;
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  terrain: Terrain;
  spawnArrow: (
    x: number,
    y: number,
    vx: number,
    vy: number,
    vh: number,
    team: "ai",
  ) => Arrow;
}

type MeleeAction = {
  kind: "melee";
  attacker: Unit;
  target: Unit;
  vx: number;
  vy: number;
  score: number;
};
type RangedAction = {
  kind: "ranged";
  attacker: Unit;
  target: Unit;
  vx: number;
  vy: number;
  vh: number;
  score: number;
};
type MoveAction = {
  kind: "move";
  attacker: Unit;
  vx: number;
  vy: number;
  score: number;
};
type Action = MeleeAction | RangedAction | MoveAction;

export class AIController {
  private deps: AIDeps;
  private active = false;
  private pendingTimer?: Phaser.Time.TimerEvent;

  constructor(deps: AIDeps) {
    this.deps = deps;
    deps.turnManager.on("turn-changed", (team: string) => {
      if (team === "ai" && !deps.turnManager.isGameOver()) this.beginTurn();
    });
    deps.turnManager.on("units-at-rest", () => {
      if (this.active && !deps.turnManager.isGameOver()) this.scheduleNextAction();
    });
    deps.turnManager.on("game-over", () => {
      this.active = false;
      this.pendingTimer?.remove();
    });
  }

  private beginTurn(): void {
    this.active = true;
    this.scheduleNextAction();
  }

  private scheduleNextAction(): void {
    if (this.deps.turnManager.getCurrentTeam() !== "ai") {
      this.active = false;
      return;
    }
    if (this.deps.turnManager.getAP() <= 0) {
      this.active = false;
      this.deps.turnManager.endTurn();
      return;
    }
    this.pendingTimer?.remove();
    this.pendingTimer = this.deps.scene.time.delayedCall(AI_ACTION_PACING_MS, () => this.takeAction());
  }

  private takeAction(): void {
    if (!this.active) return;
    if (this.deps.turnManager.getCurrentTeam() !== "ai") return;
    const allUnits = this.deps.units.getChildren().map((c) => c as Unit).filter((u) => u.active);
    const obstacles = this.deps.obstacles.getChildren().map((c) => c as Obstacle);
    const aiUnits = allUnits.filter((u) => u.team === "ai" && u.isAlive());
    const enemies = allUnits.filter((u) => u.team === "player" && u.isAlive());
    if (aiUnits.length === 0 || enemies.length === 0) {
      this.deps.turnManager.endTurn();
      this.active = false;
      return;
    }

    const candidates: Action[] = [];
    for (const attacker of aiUnits) {
      if (attacker.unitType === "archer") {
        for (const target of enemies) {
          const action = this.evaluateRanged(attacker, target, allUnits, obstacles);
          if (action) candidates.push(action);
        }
      } else {
        for (const target of enemies) {
          const action = this.evaluateMelee(attacker, target, allUnits, obstacles);
          if (action) candidates.push(action);
        }
      }
    }

    let chosen: Action | null = null;
    if (candidates.length > 0) {
      const maxScore = Math.max(...candidates.map((c) => c.score));
      const best = candidates.filter((c) => c.score >= maxScore - 0.5);
      chosen = Phaser.Math.RND.pick(best);
    } else {
      chosen = this.positioningAction(aiUnits, enemies, allUnits, obstacles);
    }

    if (chosen) this.executeAction(chosen);
    else {
      this.deps.turnManager.endTurn();
      this.active = false;
    }
  }

  private evaluateMelee(
    attacker: Unit,
    target: Unit,
    all: Unit[],
    obstacles: Obstacle[],
  ): MeleeAction | null {
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return null;
    // path-clear check (units + obstacles)
    if (!hasClearPath(attacker.x, attacker.y, target.x, target.y, all, obstacles, [attacker, target], target.radius, attacker.radius)) return null;

    const speed = neededSlideSpeed(dist);
    if (speed === null) return null;
    const damage = DAMAGE_MATRIX[attacker.unitType][target.unitType];
    const killBonus = damage >= target.hp ? 35 : 0;
    const score = damage + killBonus - dist * 0.015;
    return {
      kind: "melee",
      attacker,
      target,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      score,
    };
  }

  private evaluateRanged(
    attacker: Unit,
    target: Unit,
    all: Unit[],
    obstacles: Obstacle[],
  ): RangedAction | null {
    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return null;
    // Arrows now fly OVER obstacles, so we no longer require a clear ground path.
    // We DO still want to avoid hitting our own units, so check for friendly
    // archers/etc. on the line as a coarse heuristic.
    if (!hasClearOfFriendlies(attacker, target, all)) return null;

    // Choose a horizontal speed proportional to distance, then derive the
    // vertical (vh) so the arrow's ballistic range matches `dist` exactly.
    // Range formula:  range = hspeed × 2 × vh / gravity
    // → vh = range × gravity / (2 × hspeed)
    const hspeed = Phaser.Math.Clamp(
      Math.sqrt(dist) * 22, // gentle scaling; long shots want fast arrows
      ARROW_HSPEED_MIN,
      ARROW_HSPEED_MAX,
    );
    const vh = (dist * ARROW_GRAVITY) / (2 * hspeed);
    // Reject if the required vh is way out of bounds — target's too far/close.
    if (vh < ARROW_VH_MIN * 0.7 || vh > ARROW_VH_MAX * 1.3) return null;

    const damage = DAMAGE_MATRIX.archer[target.unitType];
    const killBonus = damage >= target.hp ? 35 : 0;
    const safetyBonus = 8;
    const score = damage + killBonus + safetyBonus - dist * 0.005;
    return {
      kind: "ranged",
      attacker,
      target,
      vx: (dx / dist) * hspeed,
      vy: (dy / dist) * hspeed,
      vh: Phaser.Math.Clamp(vh, ARROW_VH_MIN, ARROW_VH_MAX),
      score,
    };
  }

  private positioningAction(
    aiUnits: Unit[],
    enemies: Unit[],
    allUnits: Unit[],
    obstacles: Obstacle[],
  ): MoveAction | null {
    const hasMelee = aiUnits.some((x) => x.unitType !== "archer");

    for (const includeArchers of [!hasMelee, true]) {
      let best: MoveAction | null = null;

      for (const attacker of aiUnits) {
        // Archers already get ranged opportunities most turns; when melee is alive,
        // spend fallback movement on the units that actually need lanes opened first.
        if (!includeArchers && attacker.unitType === "archer") continue;

        for (const target of enemies) {
          const currentDist = Phaser.Math.Distance.Between(attacker.x, attacker.y, target.x, target.y);
          if (currentDist < 1) continue;

          const directLaneOpen = hasClearPath(
            attacker.x,
            attacker.y,
            target.x,
            target.y,
            allUnits,
            obstacles,
            [attacker, target],
            target.radius,
            attacker.radius,
          );

          // Geodesic distance field to the target — lets a walled-off unit make
          // real progress by routing around terrain instead of pressing into it.
          // Eroded by 1 cell so it only routes where a unit's body actually fits.
          const field = this.deps.terrain.distanceFieldFrom(target.x, target.y, 1);
          const startGeo = this.deps.terrain.fieldAt(field, attacker.x, attacker.y);
          // Aim moves along the navigable route (next waypoint around any wall),
          // not the straight line to the target — otherwise the sampler explores
          // the wrong cone and a boxed-in unit finds no progress move.
          const waypoint = this.deps.terrain.flowLookahead(field, attacker.x, attacker.y, 4);
          const aimX = waypoint ? waypoint.x : target.x;
          const aimY = waypoint ? waypoint.y : target.y;
          const targetAngle = Math.atan2(aimY - attacker.y, aimX - attacker.x);

          for (const angleOffsetDeg of POSITIONING_ANGLE_OFFSETS_DEG) {
            const angle = targetAngle + Phaser.Math.DegToRad(angleOffsetDeg);
            for (const power of POSITIONING_POWER_LEVELS) {
              const speed = Phaser.Math.Linear(MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED, power);
              const vx = Math.cos(angle) * speed;
              const vy = Math.sin(angle) * speed;
              const candidate = this.evaluatePositioningMove(
                attacker,
                target,
                vx,
                vy,
                currentDist,
                directLaneOpen,
                allUnits,
                obstacles,
                Math.abs(angleOffsetDeg),
                field,
                startGeo,
              );
              if (candidate && (!best || candidate.score > best.score)) best = candidate;
            }
          }
        }
      }

      if (best) return best;
    }

    return null;
  }

  private evaluatePositioningMove(
    attacker: Unit,
    target: Unit,
    vx: number,
    vy: number,
    currentDist: number,
    directLaneOpen: boolean,
    allUnits: Unit[],
    obstacles: Obstacle[],
    angleOffsetDeg: number,
    field: number[],
    startGeo: number,
  ): MoveAction | null {
    const speed = Math.hypot(vx, vy);
    if (speed < 1) return null;

    const travel = stoppingDistance(speed);
    const endX = attacker.x + (vx / speed) * travel;
    const endY = attacker.y + (vy / speed) * travel;
    if (!isInsidePlayfield(endX, endY, attacker.radius)) return null;

    if (!hasClearPath(attacker.x, attacker.y, endX, endY, allUnits, obstacles, [attacker], 0, attacker.radius)) {
      return null;
    }

    const endDist = Phaser.Math.Distance.Between(endX, endY, target.x, target.y);
    const laneAfterMove = hasClearPath(
      endX,
      endY,
      target.x,
      target.y,
      allUnits,
      obstacles,
      [attacker, target],
      target.radius,
      attacker.radius,
    );

    // Prefer geodesic progress (routes around walls) when the field reaches both
    // ends; fall back to straight-line distance if either cell is unreachable.
    const endGeo = this.deps.terrain.fieldAt(field, endX, endY);
    const geoValid = Number.isFinite(startGeo) && Number.isFinite(endGeo);
    const progress = geoValid ? (startGeo - endGeo) * TERRAIN_CELL_W : currentDist - endDist;
    const proximity = geoValid ? endGeo * TERRAIN_CELL_W : endDist;

    if (!laneAfterMove && progress < 24 && directLaneOpen) return null;
    if (progress < -55 && !laneAfterMove) return null;

    const clearance = nearestObstacleClearance(endX, endY, obstacles, attacker.radius);
    const clearanceScore = Phaser.Math.Clamp(clearance, 0, 120) * 0.045;
    const laneBonus = laneAfterMove ? (directLaneOpen ? 10 : 28) : 0;
    const roleBonus = attacker.unitType === "knight" ? 2 : attacker.unitType === "swordsman" ? 1 : 0;
    const score =
      progress * 0.12 -
      proximity * 0.006 -
      angleOffsetDeg * 0.035 +
      clearanceScore +
      laneBonus +
      roleBonus;

    return {
      kind: "move",
      attacker,
      vx,
      vy,
      score,
    };
  }

  private executeAction(action: Action): void {
    const angleNoiseRange = action.kind === "ranged" ? 3 : 1;
    const speedNoiseRange = action.kind === "ranged" ? 0.05 : 0.02;
    const angleNoise = Phaser.Math.DegToRad(Phaser.Math.RND.realInRange(-angleNoiseRange, angleNoiseRange));
    const speedNoise = Phaser.Math.RND.realInRange(1 - speedNoiseRange, 1 + speedNoiseRange);
    const v = new Phaser.Math.Vector2(action.vx, action.vy);
    v.rotate(angleNoise);
    v.scale(speedNoise);

    if (action.kind === "ranged") {
      const u = action.attacker;
      const len = v.length() || 1;
      const ox = u.x + (v.x / len) * (u.radius + 6);
      const oy = u.y + (v.y / len) * (u.radius + 6);
      this.deps.spawnArrow(ox, oy, v.x, v.y, action.vh, "ai");
    } else {
      launchUnit(action.attacker, v.x, v.y);
    }
    this.deps.turnManager.consumeAP();
  }
}

function neededSlideSpeed(dist: number): number | null {
  // distance = v^2 / (2 * FRICTION)
  // v = sqrt(2 * FRICTION * dist) * buffer
  const raw = Math.sqrt(2 * FRICTION * dist) * 1.18;
  if (raw < MIN_LAUNCH_SPEED) return MIN_LAUNCH_SPEED;
  if (raw > MAX_LAUNCH_SPEED) return raw < MAX_LAUNCH_SPEED * 1.4 ? MAX_LAUNCH_SPEED : null;
  return raw;
}

function stoppingDistance(speed: number): number {
  // distance = v^2 / (2 * FRICTION)
  return (speed * speed) / (2 * FRICTION);
}

function isInsidePlayfield(x: number, y: number, radius: number): boolean {
  return (
    x >= PLAYFIELD_LEFT + radius &&
    x <= PLAYFIELD_RIGHT - radius &&
    y >= PLAYFIELD_TOP + radius &&
    y <= PLAYFIELD_BOTTOM - radius
  );
}

/**
 * Coarse "don't shoot through a friendly" check — used for ranged actions
 * only. Obstacles are ignored (arrows arc over them now). Only blocks if a
 * friendly unit's body is within sumRadii of the line between attacker and
 * target AND is between them.
 */
function hasClearOfFriendlies(attacker: Unit, target: Unit, units: Unit[]): boolean {
  const line = new Phaser.Geom.Line(attacker.x, attacker.y, target.x, target.y);
  const targetDist = Phaser.Math.Distance.Between(attacker.x, attacker.y, target.x, target.y);
  for (const u of units) {
    if (u === attacker || u === target) continue;
    if (!u.isAlive()) continue;
    if (u.team !== attacker.team) continue; // enemies in the line of fire are fine
    const distToAttacker = Phaser.Math.Distance.Between(attacker.x, attacker.y, u.x, u.y);
    if (distToAttacker >= targetDist - target.radius) continue;
    const circle = new Phaser.Geom.Circle(u.x, u.y, u.radius + 2);
    if (Phaser.Geom.Intersects.LineToCircle(line, circle)) return false;
  }
  return true;
}

function hasClearPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  units: Unit[],
  obstacles: Obstacle[],
  ignore: Unit[],
  targetRadius: number,
  movingRadius: number,
): boolean {
  const line = new Phaser.Geom.Line(x1, y1, x2, y2);
  const targetDist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
  for (const u of units) {
    if (ignore.includes(u)) continue;
    if (!u.isAlive()) continue;
    const distToAttacker = Phaser.Math.Distance.Between(x1, y1, u.x, u.y);
    if (targetRadius > 0 && distToAttacker >= targetDist - targetRadius) continue;
    const circle = new Phaser.Geom.Circle(u.x, u.y, u.radius + movingRadius + 4);
    if (Phaser.Geom.Intersects.LineToCircle(line, circle)) return false;
  }
  // Obstacles are only tested along the segment the mover actually slides
  // through — i.e. up to the contact point, where its center stops
  // (targetRadius + movingRadius) from the target center. The region around a
  // wall-hugging target lies past that point and isn't traversed, so it must
  // not veto the move (square-corner rect inflation would otherwise engulf an
  // adjacent attacker standing on clear ground next to a wall).
  const contact = targetRadius > 0 ? targetRadius + movingRadius : 0;
  const travel = targetDist - contact;
  if (travel > 1) {
    const travelLine =
      contact > 0
        ? new Phaser.Geom.Line(x1, y1, x1 + ((x2 - x1) / targetDist) * travel, y1 + ((y2 - y1) / targetDist) * travel)
        : line;
    for (const o of obstacles) {
      if (lineHitsObstacle(travelLine, o, movingRadius, AI_OBSTACLE_CLEARANCE)) return false;
    }
  }
  return true;
}

function lineHitsObstacle(
  line: Phaser.Geom.Line,
  obstacle: Obstacle,
  movingRadius: number,
  safetyMargin: number,
): boolean {
  const softRect = obstacleRect(obstacle, movingRadius + safetyMargin);
  if (!Phaser.Geom.Intersects.LineToRectangle(line, softRect)) return false;

  // A unit already beside a wall can be inside the conservative margin. Let it
  // leave that cushion, but never let a planned path cross the real collision
  // envelope.
  if (softRect.contains(line.x1, line.y1) && !softRect.contains(line.x2, line.y2)) {
    const hardRect = obstacleRect(obstacle, movingRadius + 1);
    return Phaser.Geom.Intersects.LineToRectangle(line, hardRect);
  }

  return true;
}

function obstacleRect(obstacle: Obstacle, padding: number): Phaser.Geom.Rectangle {
  const w = obstacle.displayWidth + padding * 2;
  const h = obstacle.displayHeight + padding * 2;
  return new Phaser.Geom.Rectangle(obstacle.x - w / 2, obstacle.y - h / 2, w, h);
}

function nearestObstacleClearance(x: number, y: number, obstacles: Obstacle[], radius: number): number {
  let best = Infinity;
  for (const obstacle of obstacles) {
    const halfW = obstacle.displayWidth / 2;
    const halfH = obstacle.displayHeight / 2;
    const dx = Math.max(Math.abs(x - obstacle.x) - halfW, 0);
    const dy = Math.max(Math.abs(y - obstacle.y) - halfH, 0);
    best = Math.min(best, Math.hypot(dx, dy) - radius);
  }
  return best === Infinity ? 120 : best;
}

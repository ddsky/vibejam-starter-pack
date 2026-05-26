import Phaser from "phaser";
import type { Unit } from "../objects/Unit";
import type { Obstacle } from "../objects/Obstacle";
import type { Arrow } from "../objects/Arrow";
import type { TurnManager } from "./TurnManager";
import { DAMAGE_MATRIX, UNIT_STATS } from "../config/units";
import {
  AI_ACTION_PACING_MS,
  ARROW_FRICTION,
  ARROW_MAX_SPEED,
  ARROW_MIN_SPEED,
  FRICTION,
  MAX_LAUNCH_SPEED,
  MIN_LAUNCH_SPEED,
} from "../config/balance";
import { launchUnit } from "./DragInput";

export interface AIDeps {
  scene: Phaser.Scene;
  turnManager: TurnManager;
  units: Phaser.Physics.Arcade.Group;
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  arrows: Phaser.Physics.Arcade.Group;
  spawnArrow: (x: number, y: number, vx: number, vy: number, team: "ai") => Arrow;
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
      chosen = this.positioningAction(aiUnits, enemies);
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
    if (!hasClearPath(attacker.x, attacker.y, target.x, target.y, all, obstacles, [attacker, target], target.radius)) return null;

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
    if (!hasClearPath(attacker.x, attacker.y, target.x, target.y, all, obstacles, [attacker, target], target.radius)) return null;

    // pick arrow speed that just reaches target (with a small buffer)
    const neededSpeed = Math.sqrt(2 * ARROW_FRICTION * dist) * 1.18;
    if (neededSpeed > ARROW_MAX_SPEED * 1.05) return null; // out of range
    const arrowSpeed = Phaser.Math.Clamp(neededSpeed, ARROW_MIN_SPEED, ARROW_MAX_SPEED);

    const damage = DAMAGE_MATRIX.archer[target.unitType];
    const killBonus = damage >= target.hp ? 35 : 0;
    const safetyBonus = 8;
    const score = damage + killBonus + safetyBonus - dist * 0.005;
    return {
      kind: "ranged",
      attacker,
      target,
      vx: (dx / dist) * arrowSpeed,
      vy: (dy / dist) * arrowSpeed,
      score,
    };
  }

  private positioningAction(aiUnits: Unit[], enemies: Unit[]): MoveAction | null {
    // pick AI unit closest to any enemy, slide toward nearest enemy at 60% power
    let bestAttacker: Unit | null = null;
    let bestTarget: Unit | null = null;
    let bestDist = Infinity;
    for (const a of aiUnits) {
      // archers stay back when positioning; prefer melee units
      const skip = a.unitType === "archer" && aiUnits.some((x) => x.unitType !== "archer");
      if (skip) continue;
      for (const t of enemies) {
        const d = Phaser.Math.Distance.Between(a.x, a.y, t.x, t.y);
        if (d < bestDist) {
          bestDist = d;
          bestAttacker = a;
          bestTarget = t;
        }
      }
    }
    if (!bestAttacker || !bestTarget) return null;
    const dx = bestTarget.x - bestAttacker.x;
    const dy = bestTarget.y - bestAttacker.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = Phaser.Math.Linear(MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED, 0.6);
    return {
      kind: "move",
      attacker: bestAttacker,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      score: 0,
    };
  }

  private executeAction(action: Action): void {
    const angleNoise = Phaser.Math.DegToRad(Phaser.Math.RND.realInRange(-3, 3));
    const speedNoise = Phaser.Math.RND.realInRange(0.95, 1.05);
    const v = new Phaser.Math.Vector2(action.vx, action.vy);
    v.rotate(angleNoise);
    v.scale(speedNoise);

    if (action.kind === "ranged") {
      const u = action.attacker;
      const len = v.length() || 1;
      const ox = u.x + (v.x / len) * (u.radius + 6);
      const oy = u.y + (v.y / len) * (u.radius + 6);
      this.deps.spawnArrow(ox, oy, v.x, v.y, "ai");
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

function hasClearPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  units: Unit[],
  obstacles: Obstacle[],
  ignore: Unit[],
  targetRadius: number,
): boolean {
  const line = new Phaser.Geom.Line(x1, y1, x2, y2);
  const targetDist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
  for (const u of units) {
    if (ignore.includes(u)) continue;
    if (!u.isAlive()) continue;
    const distToAttacker = Phaser.Math.Distance.Between(x1, y1, u.x, u.y);
    if (distToAttacker >= targetDist - targetRadius) continue;
    const circle = new Phaser.Geom.Circle(u.x, u.y, u.radius + 4);
    if (Phaser.Geom.Intersects.LineToCircle(line, circle)) return false;
  }
  for (const o of obstacles) {
    const w = o.displayWidth;
    const h = o.displayHeight;
    const rect = new Phaser.Geom.Rectangle(o.x - w / 2, o.y - h / 2, w, h);
    if (Phaser.Geom.Intersects.LineToRectangle(line, rect)) return false;
  }
  return true;
}

import Phaser from "phaser";
import { Unit } from "../objects/Unit";
import { Obstacle } from "../objects/Obstacle";
import { UNIT_SPAWNS, OBSTACLE_SPAWNS } from "../config/layout";
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  REST_SPEED,
  FRICTION,
  ARROW_GRAVITY,
  ARROW_VH_MIN,
  ARROW_VH_MAX,
  ARROW_HSPEED_MIN,
  ARROW_HSPEED_MAX,
  ARROW_HIT_HEIGHT,
  PLAYFIELD_LEFT,
  PLAYFIELD_TOP,
  PLAYFIELD_RIGHT,
  PLAYFIELD_BOTTOM,
  PLAYFIELD_WIDTH,
  PLAYFIELD_HEIGHT,
} from "../config/balance";
import { DragInput, launchUnit } from "../systems/DragInput";
import { ArcherInput, type ArcherMode } from "../systems/ArcherInput";
import { KnightCurve } from "../systems/KnightCurve";
import { CombatResolver, directionalMultiplier } from "../systems/CombatResolver";
import { TurnManager } from "../systems/TurnManager";
import { AIController } from "../systems/AIController";
import { DAMAGE_MATRIX, type Team } from "../config/units";
import { Arrow } from "../objects/Arrow";
import { sounds } from "../audio/SoundManager";
import { spawnDamagePopup } from "../ui/DamagePopup";

export class GameScene extends Phaser.Scene {
  units!: Phaser.Physics.Arcade.Group;
  obstacles!: Phaser.Physics.Arcade.StaticGroup;
  arrows: Arrow[] = [];
  dragInput!: DragInput;
  archerInput!: ArcherInput;
  knightCurve!: KnightCurve;
  combat!: CombatResolver;
  turnManager!: TurnManager;
  ai!: AIController;

  constructor() {
    super("GameScene");
  }

  create(): void {
    // World physics bounds = inner playfield. Margin around the playfield is
    // out-of-bounds for units but available for the cursor to drag into.
    this.physics.world.setBounds(PLAYFIELD_LEFT, PLAYFIELD_TOP, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    this.drawField();

    this.units = this.physics.add.group({ classType: Unit, runChildUpdate: true });
    this.obstacles = this.physics.add.staticGroup();
    this.arrows = [];

    for (const spawn of OBSTACLE_SPAWNS) {
      const o = new Obstacle(this, spawn.x, spawn.y, spawn.width, spawn.height);
      this.obstacles.add(o);
    }

    for (const spawn of UNIT_SPAWNS) {
      const u = new Unit(this, spawn.x, spawn.y, spawn.team, spawn.type);
      this.units.add(u);
    }

    this.combat = new CombatResolver(this, {
      onMeleeHit: (_a, defender, x, y, damage, multiplier, _killed) => {
        this.spawnImpactPuff(x, y, multiplier >= 2.5 ? 0xff4d3d : multiplier >= 1.5 ? 0xffa733 : 0xf1e9d2);
        sounds.playMeleeHit();
        spawnDamagePopup(this, defender.x, defender.y - defender.radius, damage, multiplier);
      },
      onFriendlyPush: (_a, _d, x, y) => {
        this.spawnImpactPuff(x, y, 0xc9b896);
        sounds.playMeleeHit();
      },
      onWallHit: (_u, x, y) => {
        this.spawnImpactPuff(x, y, 0xc9b896);
        sounds.playWallHit();
      },
    });
    this.combat.attach(this.units, this.obstacles);

    this.turnManager = new TurnManager(this, this.units);

    this.dragInput = new DragInput(
      this,
      (unit) => this.canDragUnit(unit),
      (unit, vx, vy) => this.handleLaunch(unit, vx, vy),
    );
    this.archerInput = new ArcherInput(
      this,
      (unit) => this.canDragUnit(unit),
      (unit, mode, vx, vy) => this.handleArcherLaunch(unit, mode, vx, vy),
    );
    this.knightCurve = new KnightCurve(
      this,
      (unit) => this.canDragUnit(unit),
      (unit, vx, vy, curveAng) => this.handleKnightLaunch(unit, vx, vy, curveAng),
    );

    this.units.getChildren().forEach((obj) => {
      const u = obj as Unit;
      if (u.unitType === "archer") this.archerInput.attachUnit(u);
      else if (u.unitType === "knight") this.knightCurve.attachUnit(u);
      else this.dragInput.attachUnit(u);
    });

    // Arrows are now ballistic Containers stepped manually in update().
    // No Phaser overlaps/colliders — they fly OVER obstacles and only hit
    // units when their height drops into the strike zone (handled in update).

    // launch HUD overlay
    this.scene.launch("HUDScene", { turnManager: this.turnManager });
    sounds.startMusic();

    // game over flow
    this.turnManager.on("game-over", (winner: Team) => {
      this.scene.launch("GameOverScene", { winner });
    });

    this.ai = new AIController({
      scene: this,
      turnManager: this.turnManager,
      units: this.units,
      obstacles: this.obstacles,
      spawnArrow: (x, y, vx, vy, vh, team) => {
        const arrow = new Arrow(this, x, y);
        this.arrows.push(arrow);
        arrow.launch(vx, vy, vh, team);
        sounds.playArrowShoot();
        return arrow;
      },
    });

    // Predictive CCD runs before physics integrates. Catches tunneling at
    // very high velocities or during frame spikes by snapping the attacker
    // to the hit point before the body actually moves through the defender.
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.preStepCCD, this);

    this.input.keyboard?.on("keydown-M", () => {
      this.scene.stop("HUDScene");
      this.scene.start("MainMenuScene");
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.units.getChildren().forEach((obj) => {
      const u = obj as Unit;
      if (!u.active) return;
      const body = u.body as Phaser.Physics.Arcade.Body;
      // Safety clamp: ensure unit center stays inside the playfield even if a
      // huge knockback briefly carries it past Phaser's bounds check.
      const minX = PLAYFIELD_LEFT + u.radius;
      const maxX = PLAYFIELD_RIGHT - u.radius;
      const minY = PLAYFIELD_TOP + u.radius;
      const maxY = PLAYFIELD_BOTTOM - u.radius;
      const clampedX = Phaser.Math.Clamp(u.x, minX, maxX);
      const clampedY = Phaser.Math.Clamp(u.y, minY, maxY);
      if (clampedX !== u.x || clampedY !== u.y) {
        u.x = clampedX;
        u.y = clampedY;
        body.updateFromGameObject();
        if (u.x === minX || u.x === maxX) body.velocity.x *= -0.55;
        if (u.y === minY || u.y === maxY) body.velocity.y *= -0.55;
      }
      if (!u.isMoving) return;
      // Direction-preserving drag: reduce speed along the velocity vector
      // instead of per-axis. Phaser's built-in setDrag works per-axis, which
      // causes diagonal slides to curve toward the dominant axis as the
      // smaller component hits 0 first. Here we scale velocity uniformly so
      // the trajectory stays a clean straight line.
      const speed = body.velocity.length();
      if (speed > 0) {
        const newSpeed = Math.max(0, speed - FRICTION * dt);
        if (newSpeed <= 0) {
          body.velocity.set(0, 0);
        } else {
          body.velocity.scale(newSpeed / speed);
        }
      }
      // apply curve (rotate velocity vector)
      if (u.curveAngularVelocity !== 0) {
        body.velocity.rotate(u.curveAngularVelocity * dt);
      }
      if (body.velocity.length() < REST_SPEED) {
        // NOTE: we do NOT update facing from velocity here. Phaser's per-axis
        // drag corrupts velocity direction in the final frames (one axis hits
        // 0 first), so trusting it would snap facing to a cardinal angle.
        // Facing is preserved from the explicit set on launch/knockback.
        body.setVelocity(0, 0);
        body.setDrag(0, 0);
        u.isMoving = false;
        u.knockedBack = false;
        u.hasHitThisSlide = false;
        u.curveAngularVelocity = 0;
        u.lastHitBy = null;
      }
    });
    // Continuous collision detection (CCD): sweep test fresh attackers against
    // every other unit. Catches tunneling when displacement-per-frame exceeds
    // the defender's diameter (frame spikes, browser throttling, etc).
    this.sweepTestCCD();
    // Step arrows + check collisions manually (they're not Phaser bodies).
    this.stepArrows(dt);
    this.turnManager?.tick();
  }

  /**
   * Post-step safety net: detects tunneling using captured prev → current
   * positions. Pre-step CCD usually catches it first; this runs as belt-and-
   * suspenders for the rare case where pre-step prediction was off.
   */
  private sweepTestCCD(): void {
    const allUnits = this.units.getChildren();
    for (const obj of allUnits) {
      const attacker = obj as Unit;
      if (!attacker.active || !attacker.isMoving) continue;
      if (attacker.hasHitThisSlide) continue;
      const dx = attacker.x - attacker.prevX;
      const dy = attacker.y - attacker.prevY;
      if (dx * dx + dy * dy < 1) continue;
      let bestT = Infinity;
      let bestHit: Unit | null = null;
      for (const otherObj of allUnits) {
        const other = otherObj as Unit;
        if (other === attacker || !other.active) continue;
        if (attacker.knockedBack && attacker.lastHitBy === other.id) continue;
        const t = segmentCircleHit(
          attacker.prevX,
          attacker.prevY,
          attacker.x,
          attacker.y,
          other.x,
          other.y,
          attacker.radius + other.radius,
        );
        if (t !== null && t < bestT) {
          bestT = t;
          bestHit = other;
        }
      }
      if (bestHit && bestT >= 0) {
        const snapT = Math.max(0, bestT - 0.001);
        attacker.x = attacker.prevX + dx * snapT;
        attacker.y = attacker.prevY + dy * snapT;
        (attacker.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
        if (attacker.knockedBack) {
          this.combat.resolveKnockedBackChain(attacker, bestHit);
        } else {
          this.combat.resolveSweepHit(attacker, bestHit);
        }
      }
    }
  }

  /**
   * Predictive CCD: runs before the physics step. Computes where each moving
   * unit WILL be after this frame's integration (current + velocity * delta)
   * and snaps it to the first collision point before physics gets a chance
   * to tunnel past. This is the primary safeguard against high-velocity
   * tunneling and against frame-spike tunneling.
   */
  private preStepCCD(_time: number, delta: number): void {
    if (!this.units) return;
    const dt = delta / 1000;
    if (dt <= 0) return;
    const allUnits = this.units.getChildren();
    for (const obj of allUnits) {
      const unit = obj as Unit;
      if (!unit.active || !unit.isMoving) continue;
      if (unit.hasHitThisSlide) continue;
      const body = unit.body as Phaser.Physics.Arcade.Body;
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      if (vx === 0 && vy === 0) continue;
      // Look 1.2 frames ahead so we catch hits that would land just after a frame boundary too.
      const lookahead = dt * 1.2;
      const nextX = unit.x + vx * lookahead;
      const nextY = unit.y + vy * lookahead;
      const dx = nextX - unit.x;
      const dy = nextY - unit.y;
      if (dx * dx + dy * dy < 1) continue;
      let bestT = Infinity;
      let bestHit: Unit | null = null;
      for (const otherObj of allUnits) {
        const other = otherObj as Unit;
        if (other === unit || !other.active) continue;
        if (unit.knockedBack && unit.lastHitBy === other.id) continue;
        const t = segmentCircleHit(
          unit.x,
          unit.y,
          nextX,
          nextY,
          other.x,
          other.y,
          unit.radius + other.radius,
        );
        if (t !== null && t < bestT) {
          bestT = t;
          bestHit = other;
        }
      }
      if (!bestHit) continue;
      // Snap unit to just-touching position (slightly before contact).
      const snapT = Math.max(0, bestT - 0.001);
      const hitX = unit.x + dx * snapT;
      const hitY = unit.y + dy * snapT;
      unit.x = hitX;
      unit.y = hitY;
      // Sync body position WITHOUT zeroing velocity — both resolveSweepHit
      // and resolveKnockedBackChain read body.velocity to compute knockback
      // / momentum. They call stopUnit internally after capturing the speed.
      body.updateFromGameObject();
      if (unit.knockedBack) {
        // Chain knockback: knocked-back unit transfers momentum to whatever
        // it hits (friendly or enemy), then stops. No damage either way.
        this.combat.resolveKnockedBackChain(unit, bestHit);
      } else {
        this.combat.resolveSweepHit(unit, bestHit);
      }
    }
  }

  private canDragUnit(unit: Unit): boolean {
    if (!this.turnManager.canAct(unit.team)) return false;
    if (unit.team !== "player") return false;
    if (this.knightCurve?.isActive()) return false;
    return true;
  }

  private handleKnightLaunch(unit: Unit, vx: number, vy: number, curveAng: number): void {
    launchUnit(unit, vx, vy);
    unit.curveAngularVelocity = curveAng;
    this.turnManager.consumeAP();
  }

  private handleLaunch(unit: Unit, vx: number, vy: number): void {
    launchUnit(unit, vx, vy);
    this.turnManager.consumeAP();
  }

  private handleArcherLaunch(unit: Unit, mode: ArcherMode, vx: number, vy: number): void {
    if (mode === "move") {
      launchUnit(unit, vx, vy);
    } else {
      const len = Math.hypot(vx, vy) || 1;
      const ox = unit.x + (vx / len) * (unit.radius + 6);
      const oy = unit.y + (vy / len) * (unit.radius + 6);
      // Map the drag-charge (already encoded in |v|) to the initial upward
      // velocity vh. Heavier charges fly faster AND in a higher arc.
      const t = Phaser.Math.Clamp(
        (len - ARROW_HSPEED_MIN) / (ARROW_HSPEED_MAX - ARROW_HSPEED_MIN),
        0,
        1,
      );
      const vh = Phaser.Math.Linear(ARROW_VH_MIN, ARROW_VH_MAX, t);
      const arrow = new Arrow(this, ox, oy);
      this.arrows.push(arrow);
      arrow.launch(vx, vy, vh, unit.team);
      sounds.playArrowShoot();
    }
    this.turnManager.consumeAP();
  }

  /**
   * Advance all ballistic arrows by `dt`, then check each one against the
   * unit roster for ground-overlap-at-low-height. Arrows fly over high
   * obstacles and over units that are temporarily out of strike range.
   */
  private stepArrows(dt: number): void {
    for (const arrow of this.arrows) {
      if (!arrow.active) continue;
      arrow.step(dt);
      if (!arrow.active) continue;
      // Arrows only hit when low enough to be at unit-strike height.
      if (arrow.height >= ARROW_HIT_HEIGHT) continue;
      for (const obj of this.units.getChildren()) {
        const unit = obj as Unit;
        if (!unit.active || !unit.isAlive()) continue;
        const dist = Phaser.Math.Distance.Between(arrow.x, arrow.y, unit.x, unit.y);
        if (dist >= unit.radius + arrow.hitRadius) continue;
        // Hit!
        if (unit.team === arrow.ownerTeam) {
          arrow.destroy();
          break;
        }
        // Direction the arrow is coming from = opposite of its horizontal velocity.
        const multiplier = directionalMultiplier(
          unit.x - arrow.vx,
          unit.y - arrow.vy,
          unit.x,
          unit.y,
          unit.facingAngle,
        );
        const baseDamage = DAMAGE_MATRIX.archer[unit.unitType];
        const damage = Math.max(1, Math.round(baseDamage * multiplier));
        const killed = unit.takeDamage(damage);
        const tintColor = multiplier >= 2.5 ? 0xff4d3d : multiplier >= 1.5 ? 0xffa733 : 0xf1715f;
        this.spawnImpactPuff(arrow.x, arrow.y, tintColor);
        sounds.playArrowHit();
        spawnDamagePopup(this, unit.x, unit.y - unit.radius, damage, multiplier);
        arrow.destroy();
        if (killed) unit.destroyUnit();
        break;
      }
    }
    // Remove destroyed arrows from the active list.
    this.arrows = this.arrows.filter((a) => a.active);
  }

  private spawnImpactPuff(x: number, y: number, color: number = 0xf1e9d2): void {
    const puff = this.add.particles(x, y, "obstacle", {
      lifespan: 400,
      speed: { min: 60, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.9, end: 0 },
      quantity: 14,
      tint: color,
      emitting: false,
    });
    puff.explode(14);
    this.time.delayedCall(450, () => puff.destroy());
  }

  private drawField(): void {
    const g = this.add.graphics();
    // Margin area (darker — out of bounds for units, available for drag/UI).
    g.fillStyle(0x1f1812, 1);
    g.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    // Playfield body.
    g.fillStyle(0x3a3127, 1);
    g.fillRect(PLAYFIELD_LEFT, PLAYFIELD_TOP, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    // Center divider on the playfield.
    const midY = (PLAYFIELD_TOP + PLAYFIELD_BOTTOM) / 2;
    g.fillStyle(0x2a2520, 1);
    g.fillRect(PLAYFIELD_LEFT, midY - 1, PLAYFIELD_WIDTH, 2);
    // Team-colored half tints inside the playfield.
    g.fillStyle(0x3a7bd5, 0.05);
    g.fillRect(PLAYFIELD_LEFT, midY, PLAYFIELD_WIDTH, PLAYFIELD_BOTTOM - midY);
    g.fillStyle(0xc4452d, 0.05);
    g.fillRect(PLAYFIELD_LEFT, PLAYFIELD_TOP, PLAYFIELD_WIDTH, midY - PLAYFIELD_TOP);
    // Solid playfield border.
    g.lineStyle(4, 0x0e0a06, 1);
    g.strokeRect(PLAYFIELD_LEFT, PLAYFIELD_TOP, PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    // Subtle inner highlight on the playfield rim.
    g.lineStyle(1, 0x4a4036, 0.6);
    g.strokeRect(PLAYFIELD_LEFT + 2, PLAYFIELD_TOP + 2, PLAYFIELD_WIDTH - 4, PLAYFIELD_HEIGHT - 4);
    g.setDepth(0);
  }
}

/**
 * Segment-vs-circle intersection. Returns the smallest t in [0, 1] where the
 * moving point at (x1,y1)→(x2,y2) first touches the circle, or null if no hit.
 */
function segmentCircleHit(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  r: number,
): number | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-6) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sqd = Math.sqrt(disc);
  const t1 = (-b - sqd) / (2 * a);
  const t2 = (-b + sqd) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  // start of segment already inside the circle — count as t=0
  if (c <= 0) return 0;
  return null;
}

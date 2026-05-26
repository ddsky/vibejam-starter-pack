import Phaser from "phaser";
import { Unit } from "../objects/Unit";
import {
  DAMAGE_MATRIX,
  UNIT_STATS,
} from "../config/units";
import {
  KNOCKBACK_VELOCITY_FACTOR,
  FRICTION,
  PLAYFIELD_LEFT,
  PLAYFIELD_RIGHT,
  PLAYFIELD_TOP,
  PLAYFIELD_BOTTOM,
} from "../config/balance";

export interface CombatEvents {
  /** Fired when an enemy melee hit lands. damage is the post-multiplier value. */
  onMeleeHit?: (
    attacker: Unit,
    defender: Unit,
    x: number,
    y: number,
    damage: number,
    multiplier: number,
    killed: boolean,
  ) => void;
  /** Fired when a friendly slide pushes another friendly. No damage. */
  onFriendlyPush?: (attacker: Unit, defender: Unit, x: number, y: number) => void;
  onUnitDestroyed?: (unit: Unit) => void;
  onWallHit?: (unit: Unit, x: number, y: number) => void;
}

/**
 * Computes a directional damage multiplier based on the angle between the
 * direction the attack is coming from (defender → attacker) and the defender's
 * facing vector. Frontal (angle=0, dot=1) gives 1×; from behind (angle=π,
 * dot=-1) gives 4×. Smooth `1 + 1.5(1 - cosθ)`.
 */
export function directionalMultiplier(
  attackerX: number,
  attackerY: number,
  defenderX: number,
  defenderY: number,
  defenderFacing: number,
): number {
  const dx = attackerX - defenderX;
  const dy = attackerY - defenderY;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return 1;
  const ax = dx / len;
  const ay = dy / len;
  const fx = Math.cos(defenderFacing);
  const fy = Math.sin(defenderFacing);
  const dot = Phaser.Math.Clamp(ax * fx + ay * fy, -1, 1);
  return 1 + 1.5 * (1 - dot);
}

export class CombatResolver {
  private scene: Phaser.Scene;
  private events: CombatEvents;

  constructor(scene: Phaser.Scene, events: CombatEvents = {}) {
    this.scene = scene;
    this.events = events;
  }

  attach(units: Phaser.Physics.Arcade.Group, obstacles: Phaser.Physics.Arcade.StaticGroup): void {
    // No Phaser unit-unit overlap — GameScene's pre/post-step CCD is the sole
    // authority for unit-unit interactions and calls resolveSweepHit() below.
    // Reason: Phaser's discrete end-of-step detection misses tunneling, and
    // when it does fire it can suppress CCD from catching an EARLIER hit on
    // a tunneled path.
    this.scene.physics.add.collider(units, obstacles, (u) => {
      this.handleWallHit(u as Unit);
    });
  }

  resolveSweepHit(attacker: Unit, defender: Unit): void {
    this.handleUnitOverlap(attacker, defender);
  }

  /**
   * A knocked-back unit collides with another unit that ISN'T the original
   * attacker. PRD says the knocked-back unit stops — but for game-feel the
   * second unit also receives momentum (chain knockback). No damage either way.
   * Mass-weighted transfer so heavy knights push less per unit of incoming speed.
   */
  resolveKnockedBackChain(knocked: Unit, other: Unit): void {
    if (!knocked.active || !other.active) return;
    const knockedBody = knocked.body as Phaser.Physics.Arcade.Body;
    const incomingVx = knockedBody.velocity.x;
    const incomingVy = knockedBody.velocity.y;
    const incomingSpeed = Math.hypot(incomingVx, incomingVy);

    // Determine separation direction (other - knocked). Used both for
    // imparting velocity along the contact normal and pushing them apart.
    const dx = other.x - knocked.x;
    const dy = other.y - knocked.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Stop the knocked-back unit.
    this.stopUnit(knocked);
    knocked.hasHitThisSlide = true;

    // Momentum transfer to other along the contact normal (billiards-ish).
    if (incomingSpeed > 1) {
      const knockedMass = UNIT_STATS[knocked.unitType].mass;
      const otherMass = UNIT_STATS[other.unitType].mass;
      const otherKbMult = UNIT_STATS[other.unitType].knockbackMult;
      const massRatio = (2 * knockedMass) / (knockedMass + otherMass);
      const transferFactor = 0.85;
      const kbSpeed = Math.max(140, incomingSpeed * massRatio * otherKbMult * transferFactor);
      const otherBody = other.body as Phaser.Physics.Arcade.Body;
      otherBody.setVelocity(nx * kbSpeed, ny * kbSpeed);
      otherBody.setDrag(FRICTION, FRICTION);
      other.isMoving = true;
      other.knockedBack = true;
      other.hasHitThisSlide = false;
      other.lastHitBy = knocked.id;
      other.setFacingFromVelocity(nx * kbSpeed, ny * kbSpeed);
    }

    // Push apart so the next-frame CCD doesn't re-fire on this pair.
    const sumRadii = knocked.radius + other.radius;
    const sep = sumRadii - dist + 2;
    if (sep > 0) {
      const newX = Phaser.Math.Clamp(
        other.x + nx * sep,
        PLAYFIELD_LEFT + other.radius,
        PLAYFIELD_RIGHT - other.radius,
      );
      const newY = Phaser.Math.Clamp(
        other.y + ny * sep,
        PLAYFIELD_TOP + other.radius,
        PLAYFIELD_BOTTOM - other.radius,
      );
      other.x = newX;
      other.y = newY;
      (other.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    }

    this.events.onFriendlyPush?.(knocked, other, (knocked.x + other.x) / 2, (knocked.y + other.y) / 2);
  }

  private handleUnitOverlap(u1: Unit, u2: Unit): void {
    if (!u1.active || !u2.active) return;

    let attacker: Unit | null = null;
    let other: Unit | null = null;
    if (u1.isMoving && !u1.knockedBack && !u1.hasHitThisSlide) {
      attacker = u1;
      other = u2;
    } else if (u2.isMoving && !u2.knockedBack && !u2.hasHitThisSlide) {
      attacker = u2;
      other = u1;
    }

    if (!attacker || !other) {
      this.maybeStopKnockedBack(u1, u2);
      this.maybeStopKnockedBack(u2, u1);
      return;
    }

    const isFriendly = attacker.team === other.team;
    this.applyImpact(attacker, other, isFriendly);
  }

  private applyImpact(attacker: Unit, defender: Unit, isFriendly: boolean): void {
    const attackerBody = attacker.body as Phaser.Physics.Arcade.Body;
    const speed = attackerBody.velocity.length();
    const dx = defender.x - attacker.x;
    const dy = defender.y - attacker.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const impactX = (attacker.x + defender.x) / 2;
    const impactY = (attacker.y + defender.y) / 2;

    let killed = false;
    let appliedDamage = 0;
    let multiplier = 1;

    if (!isFriendly) {
      multiplier = directionalMultiplier(
        attacker.x,
        attacker.y,
        defender.x,
        defender.y,
        defender.facingAngle,
      );
      const baseDamage = DAMAGE_MATRIX[attacker.unitType][defender.unitType];
      appliedDamage = Math.max(1, Math.round(baseDamage * multiplier));
      killed = defender.takeDamage(appliedDamage);
    }

    // Attacker always stops on first contact.
    this.stopUnit(attacker);
    attacker.hasHitThisSlide = true;

    if (killed) {
      this.events.onUnitDestroyed?.(defender);
      defender.destroyUnit();
    } else {
      // Knockback on both friendly and enemy contact (friendlies just don't take damage).
      const kbMult = UNIT_STATS[defender.unitType].knockbackMult;
      const kbBoost = isFriendly ? 0.9 : 1; // friendly pushes are slightly softer
      const kbSpeed = Math.max(180, speed * kbMult * KNOCKBACK_VELOCITY_FACTOR * kbBoost);
      const defenderBody = defender.body as Phaser.Physics.Arcade.Body;
      defenderBody.setVelocity(nx * kbSpeed, ny * kbSpeed);
      defenderBody.setDrag(FRICTION, FRICTION);
      defender.isMoving = true;
      defender.knockedBack = true;
      defender.hasHitThisSlide = false;
      defender.lastHitBy = attacker.id;
      defender.setFacingFromVelocity(nx * kbSpeed, ny * kbSpeed);
      // Physically separate so the next-frame CCD doesn't re-fire on this pair.
      // Clamp inside world bounds so the defender can't be punched past the border.
      const sumRadii = attacker.radius + defender.radius;
      const sep = sumRadii - dist + 2;
      if (sep > 0) {
        const newX = Phaser.Math.Clamp(
          defender.x + nx * sep,
          PLAYFIELD_LEFT + defender.radius,
          PLAYFIELD_RIGHT - defender.radius,
        );
        const newY = Phaser.Math.Clamp(
          defender.y + ny * sep,
          PLAYFIELD_TOP + defender.radius,
          PLAYFIELD_BOTTOM - defender.radius,
        );
        defender.x = newX;
        defender.y = newY;
        defenderBody.updateFromGameObject();
      }
    }

    if (isFriendly) {
      this.events.onFriendlyPush?.(attacker, defender, impactX, impactY);
    } else {
      this.events.onMeleeHit?.(attacker, defender, impactX, impactY, appliedDamage, multiplier, killed);
    }
  }

  /**
   * If `candidate` is a knocked-back unit overlapping someone OTHER than the unit that
   * knocked it back, stop it. PRD: "If the knocked back unit collides with a wall or
   * another friendly unit, it will stop moving."
   */
  private maybeStopKnockedBack(candidate: Unit, otherUnit: Unit): void {
    if (!candidate.isMoving) return;
    if (!candidate.knockedBack) return;
    if (candidate.hasHitThisSlide) return;
    if (candidate.lastHitBy === otherUnit.id) return;
    this.stopUnit(candidate);
    candidate.hasHitThisSlide = true;
    candidate.lastHitBy = null;
  }

  private handleWallHit(unit: Unit): void {
    if (!unit.isMoving) return;
    const x = unit.x;
    const y = unit.y;
    this.stopUnit(unit);
    this.events.onWallHit?.(unit, x, y);
  }

  private stopUnit(unit: Unit): void {
    const body = unit.body as Phaser.Physics.Arcade.Body;
    // NOTE: facing is NOT re-derived from velocity here (Phaser's per-axis
    // drag snaps the final-frame velocity vector to a cardinal direction).
    // Facing is preserved from its explicit set on launch / knockback.
    body.setVelocity(0, 0);
    body.setDrag(0, 0);
    unit.isMoving = false;
    unit.knockedBack = false;
    unit.lastHitBy = null;
  }
}

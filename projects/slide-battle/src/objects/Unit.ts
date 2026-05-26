import Phaser from "phaser";
import { UNIT_STATS, type Team, type UnitType } from "../config/units";
import { HealthBar } from "../ui/HealthBar";

let nextUnitId = 0;

export class Unit extends Phaser.Physics.Arcade.Sprite {
  readonly id: number;
  readonly team: Team;
  readonly unitType: UnitType;
  readonly radius: number;
  readonly maxHp: number;
  hp: number;
  isMoving = false;
  knockedBack = false;
  hasHitThisSlide = false;
  curveAngularVelocity = 0;
  /** id of the unit that knocked this one back, so we don't stop on the original attacker. */
  lastHitBy: number | null = null;
  /** position at the start of this physics frame (for sweep-test CCD). */
  prevX = 0;
  prevY = 0;
  /**
   * Direction this unit is "facing" in radians (screen-coords: +Y down, atan2 convention).
   * Player units face up (-π/2) toward the AI side; AI units face down (+π/2) toward the
   * player side. Used by CombatResolver to compute directional damage multipliers.
   */
  facingAngle: number;

  private icon: Phaser.GameObjects.Image;
  private healthBar: HealthBar;
  private archerOverlay?: Phaser.GameObjects.Image;
  private notch: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, team: Team, type: UnitType) {
    const chipKey = team === "player" ? "chip-player" : "chip-ai";
    super(scene, x, y, chipKey);
    this.id = ++nextUnitId;
    this.team = team;
    this.unitType = type;
    const stats = UNIT_STATS[type];
    this.radius = stats.radius;
    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.facingAngle = team === "player" ? -Math.PI / 2 : Math.PI / 2;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Scale sprite so visible radius matches stats.radius (texture is 80px = 40 radius)
    this.setScale(stats.radius / 40);
    this.setCircle(40);
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Solid border bounce: high enough to read clearly. Phaser repositions any
    // body that crosses the world bounds and reflects velocity by this factor.
    body.setBounce(0.55, 0.55);
    body.setCollideWorldBounds(true, undefined, undefined, true);
    body.setDrag(0, 0); // friction applied when launched
    body.setMass(stats.mass);
    body.setMaxVelocity(1300, 1300); // safety cap against tunneling at huge deltas

    // Create icon FIRST (syncNotch reads it).
    this.icon = scene.add.image(x, y, `icon-${type}`).setDepth(3);
    this.icon.setScale(stats.radius / 36);

    // Facing notch — repositioned each frame at the chip's facing edge.
    this.notch = scene.add.image(x, y, "chip-notch").setDepth(2);
    this.syncNotch();

    if (type === "archer") {
      this.archerOverlay = scene.add.image(x, y, "archer-shoot-overlay").setDepth(4);
    }

    this.healthBar = new HealthBar(scene, x, y - stats.radius - 12, stats.hp);
    this.prevX = x;
    this.prevY = y;
  }

  /**
   * Position + rotate the facing notch AND the icon so the chip clearly
   * "looks" in the facing direction. Both have natural orientation of UP
   * (-π/2 in atan2 convention), so add π/2 to align with facingAngle.
   */
  syncNotch(): void {
    const facing = this.facingAngle;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    // Notch sits on the chip rim, tip pointing outward in the facing direction.
    const r = this.radius + 1;
    this.notch.setPosition(this.x + cos * r, this.y + sin * r);
    const rotation = facing + Math.PI / 2;
    this.notch.setRotation(rotation);
    // Icon rotates to match — this is the main facing cue at a glance.
    this.icon.setRotation(rotation);
  }

  /**
   * Set facing from a velocity vector. Ignored if the velocity is too small
   * (so a tiny knockback doesn't flip the unit around).
   */
  setFacingFromVelocity(vx: number, vy: number): void {
    if (vx * vx + vy * vy < 100) return; // < 10 px/s — too noisy
    this.facingAngle = Math.atan2(vy, vx);
  }

  /**
   * Force-set facing from any non-zero velocity vector. Used at settle time
   * to pin the unit's final facing to its last meaningful direction even
   * when the velocity has decayed below the normal threshold.
   */
  forceFacingFromVelocity(vx: number, vy: number): void {
    if (vx * vx + vy * vy < 0.0001) return;
    this.facingAngle = Math.atan2(vy, vx);
  }

  preUpdate(time: number, delta: number): void {
    // capture pre-physics position for sweep-test CCD
    this.prevX = this.x;
    this.prevY = this.y;
    super.preUpdate(time, delta);

    // Facing is set explicitly on launch / knockback / curve-tick (see below).
    // We deliberately DO NOT read facing from body.velocity every frame:
    // Phaser's per-axis drag reduces vx and vy independently, so the smaller
    // component reaches 0 first and the velocity vector "snaps" toward the
    // dominant axis. For a 45° (vx=600, vy=-200) launch, vy hits 0 long
    // before vx — pulling the perceived direction toward pure horizontal.
    // Only knight curves rotate facing mid-slide (their trajectory genuinely
    // changes direction).
    if (this.isMoving && this.curveAngularVelocity !== 0) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      this.setFacingFromVelocity(body.velocity.x, body.velocity.y);
    }

    // keep icon + hp bar + notch attached to body
    this.icon.setPosition(this.x, this.y);
    this.archerOverlay?.setPosition(this.x, this.y);
    this.healthBar.setPosition(this.x, this.y - this.radius - 12);
    this.syncNotch();
  }

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.set(this.hp);
    return this.hp <= 0;
  }

  isAlive(): boolean {
    return this.hp > 0;
  }

  destroyUnit(): void {
    this.icon.destroy();
    this.archerOverlay?.destroy();
    this.notch.destroy();
    this.healthBar.destroy();
    this.destroy();
  }
}

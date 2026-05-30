import Phaser from "phaser";
import type { Team } from "../config/units";
import {
  ARROW_GRAVITY,
  PLAYFIELD_LEFT,
  PLAYFIELD_RIGHT,
  PLAYFIELD_TOP,
  PLAYFIELD_BOTTOM,
} from "../config/balance";

/**
 * Ballistic arrow rendered as a Container. The container's `x, y` is the
 * arrow's GROUND position (used for collision against units). The arrow
 * SPRITE is offset upward by `height` to give the 3D arc illusion, and a
 * SHADOW sprite stays planted at (0, 0) in container space — so it tracks
 * the arrow's ground position regardless of altitude.
 *
 * Arrows fly OVER obstacles (no obstacle collision). They only hit a unit
 * when `height < ARROW_HIT_HEIGHT` and their ground position overlaps the
 * unit body.
 *
 * Lifecycle is driven by `step(dt)` called each frame from GameScene.update.
 * Phaser physics is intentionally NOT used — the manual model makes the arc
 * deterministic and the height-vs-ground separation trivial.
 */
export class Arrow extends Phaser.GameObjects.Container {
  ownerTeam: Team = "player";
  readonly ownerType: "archer" = "archer";
  /** Elevation of the shooter's cell at launch — for the high-ground damage bonus. */
  ownerElevation = 0;

  vx = 0;
  vy = 0;
  vh = 0;
  height = 0;
  hitRadius = 8;
  private visual: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.shadow = scene.add.image(0, 0, "arrow-shadow").setAlpha(0.55).setDepth(0);
    this.visual = scene.add.image(0, 0, "arrow-projectile").setDepth(1);
    this.add([this.shadow, this.visual]);
    this.setDepth(15);
    scene.add.existing(this);
  }

  launch(vx: number, vy: number, vh: number, owner: Team, ownerElevation = 0): void {
    this.vx = vx;
    this.vy = vy;
    this.vh = vh;
    this.ownerTeam = owner;
    this.ownerElevation = ownerElevation;
    this.visual.setRotation(Math.atan2(vy, vx));
  }

  /**
   * Advance one frame. Returns false when the arrow should be considered
   * destroyed (caller may also call .destroy() — the container is removed
   * from the scene either way).
   */
  step(dt: number): void {
    if (!this.active) return;
    // Integrate ground position.
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Integrate height with gravity.
    this.vh -= ARROW_GRAVITY * dt;
    this.height += this.vh * dt;
    // Touched the ground → arrow planted, destroy.
    if (this.height <= 0) {
      this.destroy();
      return;
    }
    // Out of playfield → destroy (with a margin so an arrow can briefly
    // pass over the bound on a long shot, but won't fly forever).
    const m = 20;
    if (
      this.x < PLAYFIELD_LEFT - m ||
      this.x > PLAYFIELD_RIGHT + m ||
      this.y < PLAYFIELD_TOP - m ||
      this.y > PLAYFIELD_BOTTOM + m
    ) {
      this.destroy();
      return;
    }
    // Visual: arrow image offset upward by current height in container space.
    this.visual.setY(-this.height);
    // Shadow scale + alpha shrinks/fades as the arrow climbs higher.
    const t = Phaser.Math.Clamp(this.height / 180, 0, 1);
    this.shadow.setScale(Phaser.Math.Linear(1, 0.45, t));
    this.shadow.setAlpha(Phaser.Math.Linear(0.6, 0.18, t));
  }
}

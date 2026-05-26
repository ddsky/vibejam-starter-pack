import Phaser from "phaser";
import { TEAM_COLORS, UNIT_STATS } from "../config/units";
import { ARROW_LENGTH, ARROW_THICKNESS } from "../config/balance";

/** Same constant used by ArcherInput to decide shoot vs move. */
export const ARCHER_INNER_RING_RATIO = 0.58;

const CHIP_TEX_SIZE = 80;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    this.generateChipTexture("chip-player", TEAM_COLORS.player);
    this.generateChipTexture("chip-ai", TEAM_COLORS.ai);
    this.generateNotchTexture("chip-notch");
    this.generateSwordIcon("icon-swordsman");
    this.generateBowIcon("icon-archer");
    this.generateShieldIcon("icon-knight");
    this.generateArrowTexture("arrow-projectile");
    this.generateArrowShadow("arrow-shadow");
    this.generateObstacleTexture("obstacle");
    this.generateArcherShootOverlay("archer-shoot-overlay");

    this.scene.start("MainMenuScene");
  }

  /** Reticle drawn on top of every archer chip, marking the inner "shoot" zone. */
  private generateArcherShootOverlay(key: string): void {
    const archerRadius = UNIT_STATS.archer.radius; // 26
    const innerRadius = archerRadius * ARCHER_INNER_RING_RATIO;
    const size = archerRadius * 2 + 4;
    const cx = size / 2;
    const cy = size / 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // dashed outer ring of inner zone
    g.lineStyle(2, 0xf1e9d2, 0.9);
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      if (i % 2 !== 0) continue; // skip alternating to fake a dashed line
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      g.beginPath();
      g.arc(cx, cy, innerRadius, a0, a1, false);
      g.strokePath();
    }
    // small crosshair tick marks
    g.lineStyle(1.5, 0xf1e9d2, 0.85);
    g.lineBetween(cx - innerRadius - 2, cy, cx - innerRadius + 3, cy);
    g.lineBetween(cx + innerRadius - 3, cy, cx + innerRadius + 2, cy);
    g.lineBetween(cx, cy - innerRadius - 2, cx, cy - innerRadius + 3);
    g.lineBetween(cx, cy + innerRadius - 3, cx, cy + innerRadius + 2);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private generateChipTexture(key: string, color: number): void {
    const size = CHIP_TEX_SIZE;
    const radius = size / 2 - 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // outer dark ring (drop shadow)
    g.fillStyle(0x111111, 0.5);
    g.fillCircle(size / 2 + 2, size / 2 + 3, radius);

    // outer ring
    g.fillStyle(0x222222, 1);
    g.fillCircle(size / 2, size / 2, radius);

    // main body
    g.fillStyle(color, 1);
    g.fillCircle(size / 2, size / 2, radius - 4);

    // highlight (top-left — implies lighting from upper-left, doesn't rotate)
    g.fillStyle(0xffffff, 0.18);
    g.fillCircle(size / 2 - 5, size / 2 - 6, radius - 10);

    g.generateTexture(key, size, size);
    g.destroy();
  }

  /**
   * Standalone "facing direction" notch sprite. Default orientation: tip
   * points UP in the texture's local frame. The Unit rotates this sprite by
   * `facingAngle + π/2` so the tip always points in the unit's facing direction.
   */
  private generateNotchTexture(key: string): void {
    const w = 18;
    const h = 16;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xf1e9d2, 0.95);
    g.fillTriangle(w / 2, 0, 0, h, w, h);
    g.lineStyle(1.5, 0x0a0805, 0.6);
    g.strokeTriangle(w / 2, 0, 0, h, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private generateSwordIcon(key: string): void {
    const size = 40;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, 0xf1e9d2, 1);
    g.fillStyle(0xf1e9d2, 1);
    // blade
    g.fillTriangle(size / 2, 4, size / 2 - 4, 22, size / 2 + 4, 22);
    // crossguard
    g.fillRect(size / 2 - 9, 22, 18, 4);
    // grip
    g.fillRect(size / 2 - 2, 26, 4, 8);
    // pommel
    g.fillCircle(size / 2, 36, 3);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private generateBowIcon(key: string): void {
    const size = 40;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, 0xf1e9d2, 1);
    // bow arc (left half of a circle)
    g.beginPath();
    g.arc(size / 2 + 3, size / 2, 14, Phaser.Math.DegToRad(120), Phaser.Math.DegToRad(240), false);
    g.strokePath();
    // bow string
    g.lineBetween(size / 2 - 4, size / 2 - 12, size / 2 - 4, size / 2 + 12);
    // arrow shaft
    g.lineStyle(2, 0xf1e9d2, 1);
    g.lineBetween(size / 2 - 4, size / 2, size / 2 + 14, size / 2);
    // arrowhead
    g.fillStyle(0xf1e9d2, 1);
    g.fillTriangle(size / 2 + 18, size / 2, size / 2 + 12, size / 2 - 3, size / 2 + 12, size / 2 + 3);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private generateShieldIcon(key: string): void {
    const size = 40;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(3, 0xf1e9d2, 1);
    g.fillStyle(0xf1e9d2, 1);
    // shield body — pentagon-ish
    g.beginPath();
    g.moveTo(size / 2 - 12, 8);
    g.lineTo(size / 2 + 12, 8);
    g.lineTo(size / 2 + 12, 22);
    g.lineTo(size / 2, 36);
    g.lineTo(size / 2 - 12, 22);
    g.closePath();
    g.fillPath();
    g.strokePath();
    // central stripe
    g.lineStyle(2, 0x2a2520, 1);
    g.lineBetween(size / 2, 10, size / 2, 32);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private generateArrowTexture(key: string): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xf1e9d2, 1);
    // shaft
    g.fillRect(0, ARROW_LENGTH / 2 - ARROW_THICKNESS / 2, ARROW_LENGTH - 6, ARROW_THICKNESS);
    // tip
    g.fillTriangle(
      ARROW_LENGTH - 6, ARROW_LENGTH / 2 - ARROW_THICKNESS,
      ARROW_LENGTH - 6, ARROW_LENGTH / 2 + ARROW_THICKNESS,
      ARROW_LENGTH, ARROW_LENGTH / 2,
    );
    // fletching
    g.fillStyle(0xc4452d, 1);
    g.fillTriangle(0, ARROW_LENGTH / 2 - ARROW_THICKNESS - 1, 0, ARROW_LENGTH / 2 + ARROW_THICKNESS + 1, 5, ARROW_LENGTH / 2);
    g.generateTexture(key, ARROW_LENGTH, ARROW_LENGTH);
    g.destroy();
  }

  private generateArrowShadow(key: string): void {
    const w = 18;
    const h = 8;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x000000, 0.6);
    g.fillEllipse(w / 2, h / 2, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private generateObstacleTexture(key: string): void {
    const size = 16;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x4a4036, 1);
    g.fillRect(0, 0, size, size);
    g.fillStyle(0x5a4f43, 1);
    g.fillRect(1, 1, size - 2, size - 4);
    g.generateTexture(key, size, size);
    g.destroy();
  }
}

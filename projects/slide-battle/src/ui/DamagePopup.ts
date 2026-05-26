import Phaser from "phaser";
import { FIELD_WIDTH, FIELD_HEIGHT } from "../config/balance";

const HORIZONTAL_MARGIN = 60;
const TOP_MARGIN = 60;
const BOTTOM_MARGIN = 40;
const RISE_DISTANCE = 70;
const BADGE_OFFSET = 26;

/**
 * Diablo-style floating damage number. Spawns at impact, floats away from
 * the impact, scales briefly, fades out. Color and size scale with the
 * directional multiplier. Auto-flips direction when near a screen edge so
 * the text always stays readable on-canvas.
 */
export function spawnDamagePopup(
  scene: Phaser.Scene,
  x: number,
  y: number,
  amount: number,
  multiplier: number,
): void {
  const isCrit = multiplier >= 1.5;
  const isHugeCrit = multiplier >= 2.5;
  const color = isHugeCrit ? "#ff4d3d" : isCrit ? "#ffa733" : "#f8f1d8";
  const fontSize = isHugeCrit ? 38 : isCrit ? 30 : 24;
  const stroke = "#0a0805";
  const strokeThickness = isCrit ? 5 : 4;

  // Decide float direction & start position so the popup stays on-canvas.
  // Default = float up from above the unit. If there's not enough headroom,
  // flip and float down from below the unit instead.
  let direction: 1 | -1 = -1; // -1 = upward in screen coords
  let startY = y;
  if (y - RISE_DISTANCE - fontSize < TOP_MARGIN) {
    direction = 1; // float downward
    startY = y + fontSize * 0.6;
  }

  // Slight horizontal jitter so multiple popups don't perfectly stack.
  const jitterX = Phaser.Math.RND.realInRange(-12, 12);
  const startX = Phaser.Math.Clamp(
    x + jitterX,
    HORIZONTAL_MARGIN,
    FIELD_WIDTH - HORIZONTAL_MARGIN,
  );

  const endY = Phaser.Math.Clamp(
    startY + RISE_DISTANCE * direction,
    TOP_MARGIN,
    FIELD_HEIGHT - BOTTOM_MARGIN,
  );

  const text = scene.add
    .text(startX, startY, `${amount}`, {
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      fontSize: `${fontSize}px`,
      color,
      fontStyle: "bold",
      stroke,
      strokeThickness,
    })
    .setOrigin(0.5)
    .setDepth(60);

  const duration = isCrit ? 1500 : 1250;
  scene.tweens.add({
    targets: text,
    y: endY,
    alpha: { from: 1, to: 0 },
    scale: { from: 0.7, to: isHugeCrit ? 1.45 : isCrit ? 1.25 : 1.05 },
    ease: "Cubic.easeOut",
    duration,
    onComplete: () => text.destroy(),
  });

  // Optional badge above/below the number for big hits.
  if (isCrit) {
    const badgeLabel = isHugeCrit ? "BACKSTAB!" : "FLANK";
    const badgeColor = isHugeCrit ? "#ff4d3d" : "#ffa733";
    const badgeFontSize = isHugeCrit ? 13 : 11;
    const badgeStrokeThickness = isHugeCrit ? 3 : 2;
    // Place badge on the side the popup is FLOATING TOWARD, so it tracks the number.
    const badgeStartY = startY + BADGE_OFFSET * direction;
    const badgeEndY = Phaser.Math.Clamp(
      badgeStartY + (RISE_DISTANCE - 10) * direction,
      TOP_MARGIN,
      FIELD_HEIGHT - BOTTOM_MARGIN,
    );
    const badge = scene.add
      .text(startX, badgeStartY, badgeLabel, {
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        fontSize: `${badgeFontSize}px`,
        color: badgeColor,
        fontStyle: "bold",
        stroke,
        strokeThickness: badgeStrokeThickness,
      })
      .setOrigin(0.5)
      .setDepth(60);
    scene.tweens.add({
      targets: badge,
      y: badgeEndY,
      alpha: { from: 1, to: 0 },
      duration: isHugeCrit ? 1300 : 1200,
      ease: "Cubic.easeOut",
      onComplete: () => badge.destroy(),
    });
  }
}

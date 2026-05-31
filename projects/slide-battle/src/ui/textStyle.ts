import type Phaser from "phaser";

const MAX_TEXT_RESOLUTION = 2;
const UI_FONT_FAMILY = '"Courier New", Courier, monospace';

export function crispTextStyle(
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: UI_FONT_FAMILY,
    ...style,
    resolution: textResolution(),
  };
}

function textResolution(): number {
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.max(1, Math.min(ratio, MAX_TEXT_RESOLUTION));
}

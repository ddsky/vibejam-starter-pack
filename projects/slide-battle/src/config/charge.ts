export const CHARGE_MODES = ["radial", "aimPower", "holdWheel"] as const;

export type ChargeMode = (typeof CHARGE_MODES)[number];

export const DEFAULT_CHARGE_MODE: ChargeMode = "radial";
export const CHARGE_MODE_REGISTRY_KEY = "slideBattle.chargeMode";
export const CHARGE_MODE_STORAGE_KEY = "slideBattle.chargeMode";

export const CHARGE_MODE_LABELS: Record<ChargeMode, string> = {
  radial: "Radial",
  aimPower: "Aim+Power",
  holdWheel: "Hold",
};

export const CHARGE_HOLD_MS = 850;
export const HOLD_TAP_CANCEL_MS = 120;
export const MIN_AIM_DISTANCE = 3;
export const CHARGE_RING_PADDING = 16;

export function isChargeMode(value: unknown): value is ChargeMode {
  return typeof value === "string" && (CHARGE_MODES as readonly string[]).includes(value);
}

export function readStoredChargeMode(): ChargeMode {
  try {
    const stored = globalThis.localStorage?.getItem(CHARGE_MODE_STORAGE_KEY);
    return isChargeMode(stored) ? stored : DEFAULT_CHARGE_MODE;
  } catch {
    return DEFAULT_CHARGE_MODE;
  }
}

export function writeStoredChargeMode(mode: ChargeMode): void {
  try {
    globalThis.localStorage?.setItem(CHARGE_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in private contexts. The registry still works.
  }
}

export function clampPower(power: number): number {
  return Math.max(0, Math.min(1, power));
}

export function speedFromPower(power: number, minSpeed: number, maxSpeed: number): number {
  const t = clampPower(power);
  return minSpeed + (maxSpeed - minSpeed) * t;
}

export function chargeRingRadius(unitRadius: number): number {
  return unitRadius + CHARGE_RING_PADDING;
}

export function fixedAimArrowLength(unitRadius: number): number {
  return chargeRingRadius(unitRadius) * 2;
}

export function radialPower(distance: number, unitRadius: number): number {
  return clampPower(distance / chargeRingRadius(unitRadius));
}

export function cyclingHoldPower(elapsedMs: number): number {
  return clampPower((elapsedMs % CHARGE_HOLD_MS) / CHARGE_HOLD_MS);
}

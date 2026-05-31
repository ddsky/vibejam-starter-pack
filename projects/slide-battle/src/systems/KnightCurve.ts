import Phaser from "phaser";
import type { Unit } from "../objects/Unit";
import { DragArrow } from "../ui/DragArrow";
import { ChargeRing } from "../ui/ChargeRing";
import { PowerBar } from "../ui/PowerBar";
import {
  MAX_DRAG_PIXELS,
  MAX_LAUNCH_SPEED,
  MIN_LAUNCH_SPEED,
  KNIGHT_CURVE_MAX_DRAG,
} from "../config/balance";
import {
  cyclingHoldPower,
  fixedAimArrowLength,
  HOLD_TAP_CANCEL_MS,
  MIN_AIM_DISTANCE,
  radialPower,
  speedFromPower,
  type ChargeMode,
} from "../config/charge";
import {
  phaserPointerToWorld,
  startGlobalPointerTracking,
  type PointerWorldPosition,
} from "./PointerTracker";

const MAX_ANG_VEL_RAD_PER_SEC = 2.2;

export type KnightLaunchHandler = (
  unit: Unit,
  vx: number,
  vy: number,
  curveAngularVelocity: number,
) => void;
export type CanDragPredicate = (unit: Unit) => boolean;
export type ChargeModeProvider = () => ChargeMode;

type TrackingStop = () => void;

type State =
  | { kind: "idle" }
  | {
      kind: "radial";
      unit: Unit;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      stopTracking: TrackingStop;
    }
  | {
      kind: "aim-direction";
      unit: Unit;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      stopTracking: TrackingStop;
    }
  | {
      kind: "aim-power-pending";
      unit: Unit;
      dirX: number;
      dirY: number;
    }
  | {
      kind: "aim-power-charging";
      unit: Unit;
      dirX: number;
      dirY: number;
      startedAt: number;
      stopTracking: TrackingStop;
    }
  | {
      kind: "hold-wheel";
      unit: Unit;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      startedAt: number;
      stopTracking: TrackingStop;
    }
  | {
      kind: "stage2-pending";
      unit: Unit;
      dirX: number;
      dirY: number;
      speed: number;
    }
  | {
      kind: "stage2-drag";
      unit: Unit;
      dirX: number;
      dirY: number;
      speed: number;
      curveStartX: number;
      curveStartY: number;
      curveCurX: number;
      curveCurY: number;
      stopTracking: TrackingStop;
    };

export class KnightCurve {
  private scene: Phaser.Scene;
  private arrow: DragArrow;
  private chargeRing: ChargeRing;
  private powerBar: PowerBar;
  private preview: Phaser.GameObjects.Graphics;
  private state: State = { kind: "idle" };
  private canDrag: CanDragPredicate;
  private onLaunch: KnightLaunchHandler;
  private getChargeMode: ChargeModeProvider;

  constructor(
    scene: Phaser.Scene,
    canDrag: CanDragPredicate,
    onLaunch: KnightLaunchHandler,
    getChargeMode: ChargeModeProvider,
  ) {
    this.scene = scene;
    this.canDrag = canDrag;
    this.onLaunch = onLaunch;
    this.getChargeMode = getChargeMode;
    this.arrow = new DragArrow(scene);
    this.chargeRing = new ChargeRing(scene);
    this.powerBar = new PowerBar(scene);
    this.preview = scene.add.graphics();
    this.preview.setDepth(19);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleScenePointerDown, this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.handleUpdate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cancel();
      scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleScenePointerDown, this);
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.handleUpdate, this);
    });
  }

  attachUnit(unit: Unit): void {
    unit.setInteractive({ useHandCursor: true });
    unit.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!this.canDrag(unit)) return;
      if (this.state.kind !== "idle") return;
      this.beginUnitGesture(unit, pointer);
    });
  }

  isActive(): boolean {
    return this.state.kind !== "idle";
  }

  cancel(): void {
    this.arrow.hide();
    this.chargeRing.hide();
    this.powerBar.hide();
    this.preview.clear();
    if ("stopTracking" in this.state) this.state.stopTracking();
    this.state = { kind: "idle" };
  }

  private beginUnitGesture(unit: Unit, pointer: Phaser.Input.Pointer): void {
    const start = phaserPointerToWorld(this.scene, pointer);
    const mode = this.getChargeMode();
    if (mode === "aimPower") {
      this.beginAimDirection(unit, pointer, start);
    } else if (mode === "holdWheel") {
      this.beginHoldWheel(unit, pointer, start);
    } else {
      this.beginRadial(unit, pointer, start);
    }
  }

  private beginRadial(unit: Unit, pointer: Phaser.Input.Pointer, start: PointerWorldPosition): void {
    const stopTracking = startGlobalPointerTracking(this.scene, pointer, {
      onMove: (position) => {
        if (this.state.kind !== "radial") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.redrawRadial();
      },
      onUp: (position) => {
        if (this.state.kind !== "radial") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.finishRadial();
      },
      onCancel: () => this.cancel(),
    });
    this.state = {
      kind: "radial",
      unit,
      startX: start.worldX,
      startY: start.worldY,
      currentX: start.worldX,
      currentY: start.worldY,
      stopTracking,
    };
    this.redrawRadial();
  }

  private beginAimDirection(unit: Unit, pointer: Phaser.Input.Pointer, start: PointerWorldPosition): void {
    const stopTracking = startGlobalPointerTracking(this.scene, pointer, {
      onMove: (position) => {
        if (this.state.kind !== "aim-direction") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.redrawAimDirection();
      },
      onUp: (position) => {
        if (this.state.kind !== "aim-direction") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.finishAimDirection();
      },
      onCancel: () => this.cancel(),
    });
    this.state = {
      kind: "aim-direction",
      unit,
      startX: start.worldX,
      startY: start.worldY,
      currentX: start.worldX,
      currentY: start.worldY,
      stopTracking,
    };
    this.redrawAimDirection();
  }

  private beginHoldWheel(unit: Unit, pointer: Phaser.Input.Pointer, start: PointerWorldPosition): void {
    const stopTracking = startGlobalPointerTracking(this.scene, pointer, {
      onMove: (position) => {
        if (this.state.kind !== "hold-wheel") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.redrawHoldWheel();
      },
      onUp: (position) => {
        if (this.state.kind !== "hold-wheel") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.finishHoldWheel();
      },
      onCancel: () => this.cancel(),
    });
    this.state = {
      kind: "hold-wheel",
      unit,
      startX: start.worldX,
      startY: start.worldY,
      currentX: start.worldX,
      currentY: start.worldY,
      startedAt: this.scene.time.now,
      stopTracking,
    };
    this.redrawHoldWheel();
  }

  private handleScenePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state.kind === "aim-power-pending") {
      const { unit, dirX, dirY } = this.state;
      const stopTracking = startGlobalPointerTracking(this.scene, pointer, {
        onUp: () => this.finishAimPowerCharge(),
        onCancel: () => this.cancel(),
      });
      this.state = {
        kind: "aim-power-charging",
        unit,
        dirX,
        dirY,
        startedAt: this.scene.time.now,
        stopTracking,
      };
      this.redrawAimPowerCharge();
      return;
    }

    if (this.state.kind !== "stage2-pending") return;
    const start = phaserPointerToWorld(this.scene, pointer);
    const { unit, dirX, dirY, speed } = this.state;
    const stopTracking = startGlobalPointerTracking(this.scene, pointer, {
      onMove: (position) => {
        if (this.state.kind !== "stage2-drag") return;
        this.state.curveCurX = position.worldX;
        this.state.curveCurY = position.worldY;
        this.redrawCurvePreview();
      },
      onUp: (position) => {
        if (this.state.kind !== "stage2-drag") return;
        this.state.curveCurX = position.worldX;
        this.state.curveCurY = position.worldY;
        this.finishCurveDrag();
      },
      onCancel: () => this.cancel(),
    });
    this.state = {
      kind: "stage2-drag",
      unit,
      dirX,
      dirY,
      speed,
      curveStartX: start.worldX,
      curveStartY: start.worldY,
      curveCurX: start.worldX,
      curveCurY: start.worldY,
      stopTracking,
    };
    this.redrawCurvePreview();
  }

  private handleUpdate(): void {
    if (this.state.kind === "aim-power-charging") this.redrawAimPowerCharge();
    else if (this.state.kind === "hold-wheel") this.redrawHoldWheel();
  }

  private finishRadial(): void {
    if (this.state.kind !== "radial") return;
    const { unit, startX, startY, currentX, currentY } = this.state;
    const dx = startX - currentX;
    const dy = startY - currentY;
    this.enterCurveFromVector(unit, dx, dy, Math.hypot(dx, dy));
  }

  private finishAimDirection(): void {
    if (this.state.kind !== "aim-direction") return;
    const { unit, startX, startY, currentX, currentY } = this.state;
    const dx = currentX - startX;
    const dy = currentY - startY;
    const mag = Math.hypot(dx, dy);
    if (mag < MIN_AIM_DISTANCE) {
      this.cancel();
      return;
    }
    this.chargeRing.hide();
    this.state = {
      kind: "aim-power-pending",
      unit,
      dirX: dx / mag,
      dirY: dy / mag,
    };
    this.redrawAimPowerPending();
  }

  private finishAimPowerCharge(): void {
    if (this.state.kind !== "aim-power-charging") return;
    const { unit, dirX, dirY, startedAt } = this.state;
    const speed = speedFromPower(this.holdPower(startedAt), MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED);
    this.enterCurvePending(unit, dirX, dirY, speed);
  }

  private finishHoldWheel(): void {
    if (this.state.kind !== "hold-wheel") return;
    const state = this.state;
    const dx = state.currentX - state.startX;
    const dy = state.currentY - state.startY;
    const mag = Math.hypot(dx, dy);
    const elapsed = this.scene.time.now - state.startedAt;
    if (elapsed < HOLD_TAP_CANCEL_MS && mag < MIN_AIM_DISTANCE) {
      this.cancel();
      return;
    }

    const dir = mag >= MIN_AIM_DISTANCE
      ? { x: -dx / mag, y: -dy / mag }
      : { x: Math.cos(state.unit.facingAngle), y: Math.sin(state.unit.facingAngle) };
    const speed = speedFromPower(this.holdPower(state.startedAt), MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED);
    this.enterCurvePending(state.unit, dir.x, dir.y, speed);
  }

  private finishCurveDrag(): void {
    if (this.state.kind !== "stage2-drag") return;
    const { unit, dirX, dirY, speed, curveStartX, curveStartY, curveCurX, curveCurY } = this.state;
    const curveAngularVelocity = computeCurveAngularVelocity(
      dirX,
      dirY,
      curveCurX - curveStartX,
      curveCurY - curveStartY,
    );
    this.arrow.hide();
    this.chargeRing.hide();
    this.powerBar.hide();
    this.preview.clear();
    this.state = { kind: "idle" };
    this.onLaunch(unit, dirX * speed, dirY * speed, curveAngularVelocity);
  }

  private enterCurveFromVector(unit: Unit, dx: number, dy: number, mag: number): void {
    if (mag < MIN_AIM_DISTANCE) {
      this.cancel();
      return;
    }
    const power = radialPower(mag, unit.radius);
    const speed = speedFromPower(power, MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED);
    this.enterCurvePending(unit, dx / mag, dy / mag, speed);
  }

  private enterCurvePending(unit: Unit, dirX: number, dirY: number, speed: number): void {
    this.chargeRing.hide();
    this.powerBar.hide();
    this.state = { kind: "stage2-pending", unit, dirX, dirY, speed };
    this.redrawCurvePreview();
  }

  private redrawRadial(): void {
    if (this.state.kind !== "radial") return;
    const { unit, startX, startY, currentX, currentY } = this.state;
    const dx = startX - currentX;
    const dy = startY - currentY;
    const mag = Math.hypot(dx, dy);
    const power = radialPower(mag, unit.radius);
    this.arrow.draw(unit.x, unit.y, dx, dy, mag, {
      fixedLength: fixedAimArrowLength(unit.radius),
      fixedPower: 0.45,
    });
    this.chargeRing.draw(unit.x, unit.y, unit.radius, power);
    this.powerBar.hide();
    this.preview.clear();
  }

  private redrawAimDirection(): void {
    if (this.state.kind !== "aim-direction") return;
    const { unit, startX, startY, currentX, currentY } = this.state;
    const dx = currentX - startX;
    const dy = currentY - startY;
    const mag = Math.hypot(dx, dy);
    const previewMag = Math.max(Math.min(mag, MAX_DRAG_PIXELS * 0.55), MIN_AIM_DISTANCE);
    this.arrow.draw(unit.x, unit.y, dx, dy, previewMag);
    this.chargeRing.hide();
    this.powerBar.hide();
    this.preview.clear();
  }

  private redrawAimPowerPending(): void {
    if (this.state.kind !== "aim-power-pending") return;
    const { unit, dirX, dirY } = this.state;
    this.arrow.draw(unit.x, unit.y, dirX, dirY, MAX_DRAG_PIXELS * 0.55);
    this.chargeRing.draw(unit.x, unit.y, unit.radius, 0);
    this.powerBar.hide();
    this.preview.clear();
  }

  private redrawAimPowerCharge(): void {
    if (this.state.kind !== "aim-power-charging") return;
    const { unit, dirX, dirY, startedAt } = this.state;
    const power = this.holdPower(startedAt);
    this.arrow.draw(unit.x, unit.y, dirX, dirY, MAX_DRAG_PIXELS * power);
    this.chargeRing.draw(unit.x, unit.y, unit.radius, power);
    this.powerBar.hide();
    this.preview.clear();
  }

  private redrawHoldWheel(): void {
    if (this.state.kind !== "hold-wheel") return;
    const { unit, startX, startY, currentX, currentY, startedAt } = this.state;
    const dx = startX - currentX;
    const dy = startY - currentY;
    const mag = Math.hypot(dx, dy);
    const dirX = mag >= MIN_AIM_DISTANCE ? dx / mag : Math.cos(unit.facingAngle);
    const dirY = mag >= MIN_AIM_DISTANCE ? dy / mag : Math.sin(unit.facingAngle);
    const power = this.holdPower(startedAt);
    this.arrow.draw(unit.x, unit.y, dirX, dirY, power, {
      fixedLength: fixedAimArrowLength(unit.radius),
      fixedPower: 0.45,
    });
    this.chargeRing.hide();
    this.powerBar.draw(unit.x, unit.y, unit.radius, power);
    this.preview.clear();
  }

  private redrawCurvePreview(): void {
    if (this.state.kind !== "stage2-pending" && this.state.kind !== "stage2-drag") return;
    const { unit, dirX, dirY, speed } = this.state;

    const t = (speed - MIN_LAUNCH_SPEED) / (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED);
    const baseLen = Phaser.Math.Linear(60, 220, Phaser.Math.Clamp(t, 0, 1));
    this.arrow.draw(unit.x, unit.y, dirX, dirY, MAX_DRAG_PIXELS * t * 0.9);

    let curveAng = 0;
    if (this.state.kind === "stage2-drag") {
      curveAng = computeCurveAngularVelocity(
        dirX,
        dirY,
        this.state.curveCurX - this.state.curveStartX,
        this.state.curveCurY - this.state.curveStartY,
      );
    }
    this.preview.clear();
    this.preview.lineStyle(3, 0xf4d35e, 0.8);
    drawCurvedPath(this.preview, unit.x, unit.y, dirX, dirY, baseLen * 1.4, curveAng);
  }

  private holdPower(startedAt: number): number {
    return cyclingHoldPower(this.scene.time.now - startedAt);
  }
}

function computeCurveAngularVelocity(dirX: number, dirY: number, dx: number, dy: number): number {
  const perpX = -dirY;
  const perpY = dirX;
  const proj = dx * perpX + dy * perpY;
  const clamped = Phaser.Math.Clamp(proj, -KNIGHT_CURVE_MAX_DRAG, KNIGHT_CURVE_MAX_DRAG);
  return (clamped / KNIGHT_CURVE_MAX_DRAG) * MAX_ANG_VEL_RAD_PER_SEC;
}

function drawCurvedPath(
  g: Phaser.GameObjects.Graphics,
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
  length: number,
  curveAng: number,
): void {
  const steps = 24;
  const dt = 1 / steps;
  let x = startX;
  let y = startY;
  let angle = Math.atan2(dirY, dirX);
  const stepLen = length / steps;
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 0; i < steps; i++) {
    angle += curveAng * dt * 0.5; // preview shows half-strength curve so it doesn't look exaggerated
    x += Math.cos(angle) * stepLen;
    y += Math.sin(angle) * stepLen;
    g.lineTo(x, y);
  }
  g.strokePath();
}

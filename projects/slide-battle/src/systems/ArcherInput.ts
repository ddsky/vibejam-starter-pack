import Phaser from "phaser";
import type { Unit } from "../objects/Unit";
import { DragArrow } from "../ui/DragArrow";
import { ChargeRing } from "../ui/ChargeRing";
import { PowerBar } from "../ui/PowerBar";
import {
  ARROW_MAX_SPEED,
  ARROW_MIN_SPEED,
  MAX_DRAG_PIXELS,
  MAX_LAUNCH_SPEED,
  MIN_LAUNCH_SPEED,
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
import { ARCHER_INNER_RING_RATIO } from "../scenes/BootScene";
import {
  phaserPointerToWorld,
  startGlobalPointerTracking,
  type PointerWorldPosition,
} from "./PointerTracker";

export type ArcherMode = "move" | "shoot";
export type ArcherLaunchHandler = (
  unit: Unit,
  mode: ArcherMode,
  vx: number,
  vy: number,
) => void;
export type CanDragPredicate = (unit: Unit) => boolean;
export type ChargeModeProvider = () => ChargeMode;

type TrackingStop = () => void;

type State =
  | {
      kind: "radial";
      unit: Unit;
      actionMode: ArcherMode;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      stopTracking: TrackingStop;
    }
  | {
      kind: "aim-direction";
      unit: Unit;
      actionMode: ArcherMode;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      stopTracking: TrackingStop;
    }
  | {
      kind: "aim-power-pending";
      unit: Unit;
      actionMode: ArcherMode;
      dirX: number;
      dirY: number;
    }
  | {
      kind: "aim-power-charging";
      unit: Unit;
      actionMode: ArcherMode;
      dirX: number;
      dirY: number;
      startedAt: number;
      stopTracking: TrackingStop;
    }
  | {
      kind: "hold-wheel";
      unit: Unit;
      actionMode: ArcherMode;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      startedAt: number;
      stopTracking: TrackingStop;
    };

export class ArcherInput {
  private scene: Phaser.Scene;
  private arrow: DragArrow;
  private chargeRing: ChargeRing;
  private powerBar: PowerBar;
  private state: State | null = null;
  private canDrag: CanDragPredicate;
  private onLaunch: ArcherLaunchHandler;
  private getChargeMode: ChargeModeProvider;

  constructor(
    scene: Phaser.Scene,
    canDrag: CanDragPredicate,
    onLaunch: ArcherLaunchHandler,
    getChargeMode: ChargeModeProvider,
  ) {
    this.scene = scene;
    this.canDrag = canDrag;
    this.onLaunch = onLaunch;
    this.getChargeMode = getChargeMode;
    this.arrow = new DragArrow(scene);
    this.chargeRing = new ChargeRing(scene);
    this.powerBar = new PowerBar(scene);

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
      if (this.state) return;
      const actionMode = this.modeForPointer(unit, pointer);
      this.beginUnitGesture(unit, actionMode, pointer);
    });
  }

  isDragging(): boolean {
    return this.state !== null;
  }

  cancel(): void {
    this.arrow.hide();
    this.chargeRing.hide();
    this.powerBar.hide();
    if (this.state && "stopTracking" in this.state) this.state.stopTracking();
    this.state = null;
  }

  private modeForPointer(unit: Unit, pointer: Phaser.Input.Pointer): ArcherMode {
    const start = phaserPointerToWorld(this.scene, pointer);
    const dx = start.worldX - unit.x;
    const dy = start.worldY - unit.y;
    const innerRadius = unit.radius * ARCHER_INNER_RING_RATIO;
    return dx * dx + dy * dy < innerRadius * innerRadius ? "shoot" : "move";
  }

  private beginUnitGesture(unit: Unit, actionMode: ArcherMode, pointer: Phaser.Input.Pointer): void {
    const start = phaserPointerToWorld(this.scene, pointer);
    const mode = this.getChargeMode();
    if (mode === "aimPower") {
      this.beginAimDirection(unit, actionMode, pointer, start);
    } else if (mode === "holdWheel") {
      this.beginHoldWheel(unit, actionMode, pointer, start);
    } else {
      this.beginRadial(unit, actionMode, pointer, start);
    }
  }

  private beginRadial(
    unit: Unit,
    actionMode: ArcherMode,
    pointer: Phaser.Input.Pointer,
    start: PointerWorldPosition,
  ): void {
    const stopTracking = startGlobalPointerTracking(this.scene, pointer, {
      onMove: (position) => {
        if (this.state?.kind !== "radial") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.redrawRadial();
      },
      onUp: (position) => {
        if (this.state?.kind !== "radial") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.finishRadial();
      },
      onCancel: () => this.cancel(),
    });
    this.state = {
      kind: "radial",
      unit,
      actionMode,
      startX: start.worldX,
      startY: start.worldY,
      currentX: start.worldX,
      currentY: start.worldY,
      stopTracking,
    };
    this.redrawRadial();
  }

  private beginAimDirection(
    unit: Unit,
    actionMode: ArcherMode,
    pointer: Phaser.Input.Pointer,
    start: PointerWorldPosition,
  ): void {
    const stopTracking = startGlobalPointerTracking(this.scene, pointer, {
      onMove: (position) => {
        if (this.state?.kind !== "aim-direction") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.redrawAimDirection();
      },
      onUp: (position) => {
        if (this.state?.kind !== "aim-direction") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.finishAimDirection();
      },
      onCancel: () => this.cancel(),
    });
    this.state = {
      kind: "aim-direction",
      unit,
      actionMode,
      startX: start.worldX,
      startY: start.worldY,
      currentX: start.worldX,
      currentY: start.worldY,
      stopTracking,
    };
    this.redrawAimDirection();
  }

  private beginHoldWheel(
    unit: Unit,
    actionMode: ArcherMode,
    pointer: Phaser.Input.Pointer,
    start: PointerWorldPosition,
  ): void {
    const stopTracking = startGlobalPointerTracking(this.scene, pointer, {
      onMove: (position) => {
        if (this.state?.kind !== "hold-wheel") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.redrawHoldWheel();
      },
      onUp: (position) => {
        if (this.state?.kind !== "hold-wheel") return;
        this.state.currentX = position.worldX;
        this.state.currentY = position.worldY;
        this.finishHoldWheel();
      },
      onCancel: () => this.cancel(),
    });
    this.state = {
      kind: "hold-wheel",
      unit,
      actionMode,
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
    if (this.state?.kind !== "aim-power-pending") return;
    const { unit, actionMode, dirX, dirY } = this.state;
    const stopTracking = startGlobalPointerTracking(this.scene, pointer, {
      onUp: () => this.finishAimPowerCharge(),
      onCancel: () => this.cancel(),
    });
    this.state = {
      kind: "aim-power-charging",
      unit,
      actionMode,
      dirX,
      dirY,
      startedAt: this.scene.time.now,
      stopTracking,
    };
    this.redrawAimPowerCharge();
  }

  private handleUpdate(): void {
    if (this.state?.kind === "aim-power-charging") this.redrawAimPowerCharge();
    else if (this.state?.kind === "hold-wheel") this.redrawHoldWheel();
  }

  private finishRadial(): void {
    if (this.state?.kind !== "radial") return;
    const { unit, actionMode, startX, startY, currentX, currentY } = this.state;
    this.arrow.hide();
    this.chargeRing.hide();
    this.powerBar.hide();
    this.state = null;
    const dx = startX - currentX;
    const dy = startY - currentY;
    this.launchFromVector(unit, actionMode, dx, dy, Math.hypot(dx, dy));
  }

  private finishAimDirection(): void {
    if (this.state?.kind !== "aim-direction") return;
    const { unit, actionMode, startX, startY, currentX, currentY } = this.state;
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
      actionMode,
      dirX: dx / mag,
      dirY: dy / mag,
    };
    this.redrawAimPowerPending();
  }

  private finishAimPowerCharge(): void {
    if (this.state?.kind !== "aim-power-charging") return;
    const { unit, actionMode, dirX, dirY, startedAt } = this.state;
    const power = this.holdPower(startedAt);
    this.arrow.hide();
    this.chargeRing.hide();
    this.powerBar.hide();
    this.state = null;
    const speed = this.speedFor(actionMode, power);
    this.onLaunch(unit, actionMode, dirX * speed, dirY * speed);
  }

  private finishHoldWheel(): void {
    if (this.state?.kind !== "hold-wheel") return;
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
    const power = this.holdPower(state.startedAt);
    this.arrow.hide();
    this.chargeRing.hide();
    this.powerBar.hide();
    this.state = null;
    const speed = this.speedFor(state.actionMode, power);
    this.onLaunch(state.unit, state.actionMode, dir.x * speed, dir.y * speed);
  }

  private launchFromVector(
    unit: Unit,
    actionMode: ArcherMode,
    dx: number,
    dy: number,
    mag: number,
  ): void {
    if (mag < MIN_AIM_DISTANCE) return;
    const power = radialPower(mag, unit.radius);
    const speed = this.speedFor(actionMode, power);
    this.onLaunch(unit, actionMode, (dx / mag) * speed, (dy / mag) * speed);
  }

  private speedFor(actionMode: ArcherMode, power: number): number {
    return actionMode === "shoot"
      ? speedFromPower(power, ARROW_MIN_SPEED, ARROW_MAX_SPEED)
      : speedFromPower(power, MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED);
  }

  private redrawRadial(): void {
    if (this.state?.kind !== "radial") return;
    const { unit, actionMode, startX, startY, currentX, currentY } = this.state;
    const dx = startX - currentX;
    const dy = startY - currentY;
    const mag = Math.hypot(dx, dy);
    const power = radialPower(mag, unit.radius);
    this.drawFixedActionArrow(unit, dx, dy, mag);
    this.chargeRing.draw(unit.x, unit.y, unit.radius, power);
    this.powerBar.hide();
  }

  private redrawAimDirection(): void {
    if (this.state?.kind !== "aim-direction") return;
    const { unit, actionMode, startX, startY, currentX, currentY } = this.state;
    const dx = currentX - startX;
    const dy = currentY - startY;
    const mag = Math.hypot(dx, dy);
    const previewMag = Math.max(Math.min(mag, MAX_DRAG_PIXELS * 0.55), MIN_AIM_DISTANCE);
    this.drawActionArrow(unit, actionMode, dx, dy, previewMag);
    this.chargeRing.hide();
    this.powerBar.hide();
  }

  private redrawAimPowerPending(): void {
    if (this.state?.kind !== "aim-power-pending") return;
    const { unit, actionMode, dirX, dirY } = this.state;
    this.drawActionArrow(unit, actionMode, dirX, dirY, MAX_DRAG_PIXELS * 0.55);
    this.chargeRing.draw(unit.x, unit.y, unit.radius, 0);
    this.powerBar.hide();
  }

  private redrawAimPowerCharge(): void {
    if (this.state?.kind !== "aim-power-charging") return;
    const { unit, actionMode, dirX, dirY, startedAt } = this.state;
    const power = this.holdPower(startedAt);
    this.drawActionArrow(unit, actionMode, dirX, dirY, MAX_DRAG_PIXELS * power);
    this.chargeRing.draw(unit.x, unit.y, unit.radius, power);
    this.powerBar.hide();
  }

  private redrawHoldWheel(): void {
    if (this.state?.kind !== "hold-wheel") return;
    const { unit, actionMode, startX, startY, currentX, currentY, startedAt } = this.state;
    const dx = startX - currentX;
    const dy = startY - currentY;
    const mag = Math.hypot(dx, dy);
    const dirX = mag >= MIN_AIM_DISTANCE ? dx / mag : Math.cos(unit.facingAngle);
    const dirY = mag >= MIN_AIM_DISTANCE ? dy / mag : Math.sin(unit.facingAngle);
    const power = this.holdPower(startedAt);
    this.drawFixedActionArrow(unit, dirX, dirY, power);
    this.chargeRing.hide();
    this.powerBar.draw(unit.x, unit.y, unit.radius, power);
  }

  private drawActionArrow(
    unit: Unit,
    actionMode: ArcherMode,
    dirX: number,
    dirY: number,
    magnitude: number,
  ): void {
    this.arrow.draw(unit.x, unit.y, dirX, dirY, magnitude, {
      fixedLength: actionMode === "shoot" ? 130 : undefined,
    });
  }

  private drawFixedActionArrow(
    unit: Unit,
    dirX: number,
    dirY: number,
    magnitude: number,
  ): void {
    this.arrow.draw(unit.x, unit.y, dirX, dirY, magnitude, {
      fixedLength: fixedAimArrowLength(unit.radius),
      fixedPower: 0.45,
    });
  }

  private holdPower(startedAt: number): number {
    return cyclingHoldPower(this.scene.time.now - startedAt);
  }
}

import Phaser from "phaser";
import type { Unit } from "../objects/Unit";
import { DragArrow } from "../ui/DragArrow";
import {
  MAX_DRAG_PIXELS,
  MAX_LAUNCH_SPEED,
  MIN_LAUNCH_SPEED,
  KNIGHT_CURVE_MAX_DRAG,
} from "../config/balance";

const MAX_ANG_VEL_RAD_PER_SEC = 2.2;

export type KnightLaunchHandler = (
  unit: Unit,
  vx: number,
  vy: number,
  curveAngularVelocity: number,
) => void;
export type CanDragPredicate = (unit: Unit) => boolean;

type State =
  | { kind: "idle" }
  | {
      kind: "stage1-drag";
      unit: Unit;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
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
    };

export class KnightCurve {
  private scene: Phaser.Scene;
  private arrow: DragArrow;
  private preview: Phaser.GameObjects.Graphics;
  private state: State = { kind: "idle" };
  private canDrag: CanDragPredicate;
  private onLaunch: KnightLaunchHandler;

  constructor(scene: Phaser.Scene, canDrag: CanDragPredicate, onLaunch: KnightLaunchHandler) {
    this.scene = scene;
    this.canDrag = canDrag;
    this.onLaunch = onLaunch;
    this.arrow = new DragArrow(scene);
    this.preview = scene.add.graphics();
    this.preview.setDepth(19);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleScenePointerDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
  }

  attachUnit(unit: Unit): void {
    unit.setInteractive({ useHandCursor: true });
    unit.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!this.canDrag(unit)) return;
      if (this.state.kind !== "idle") return;
      this.state = {
        kind: "stage1-drag",
        unit,
        startX: pointer.worldX,
        startY: pointer.worldY,
        currentX: pointer.worldX,
        currentY: pointer.worldY,
      };
    });
  }

  isActive(): boolean {
    return this.state.kind !== "idle";
  }

  private handleScenePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state.kind !== "stage2-pending") return;
    const { unit, dirX, dirY, speed } = this.state;
    this.state = {
      kind: "stage2-drag",
      unit,
      dirX,
      dirY,
      speed,
      curveStartX: pointer.worldX,
      curveStartY: pointer.worldY,
      curveCurX: pointer.worldX,
      curveCurY: pointer.worldY,
    };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.state.kind === "stage1-drag") {
      this.state.currentX = pointer.worldX;
      this.state.currentY = pointer.worldY;
      this.redrawStage1();
    } else if (this.state.kind === "stage2-drag") {
      this.state.curveCurX = pointer.worldX;
      this.state.curveCurY = pointer.worldY;
      this.redrawStage2();
    }
  }

  private handlePointerUp(_pointer: Phaser.Input.Pointer): void {
    if (this.state.kind === "stage1-drag") {
      const { unit, startX, startY, currentX, currentY } = this.state;
      const dx = startX - currentX;
      const dy = startY - currentY;
      const mag = Math.hypot(dx, dy);
      if (mag < 16) {
        this.cancel();
        return;
      }
      const clamped = Math.min(mag, MAX_DRAG_PIXELS);
      const t = clamped / MAX_DRAG_PIXELS;
      const speed = Phaser.Math.Linear(MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED, t);
      const dirX = dx / mag;
      const dirY = dy / mag;
      this.state = { kind: "stage2-pending", unit, dirX, dirY, speed };
      // arrow stays visible, curve preview shows straight line + curve hints
      this.redrawStage2();
    } else if (this.state.kind === "stage2-drag") {
      const { unit, dirX, dirY, speed, curveStartX, curveStartY, curveCurX, curveCurY } = this.state;
      const curveAngularVelocity = computeCurveAngularVelocity(
        dirX,
        dirY,
        curveCurX - curveStartX,
        curveCurY - curveStartY,
      );
      this.arrow.hide();
      this.preview.clear();
      this.state = { kind: "idle" };
      this.onLaunch(unit, dirX * speed, dirY * speed, curveAngularVelocity);
    }
  }

  cancel(): void {
    this.arrow.hide();
    this.preview.clear();
    this.state = { kind: "idle" };
  }

  private redrawStage1(): void {
    if (this.state.kind !== "stage1-drag") return;
    const { unit, startX, startY, currentX, currentY } = this.state;
    const dx = startX - currentX;
    const dy = startY - currentY;
    const mag = Math.hypot(dx, dy);
    this.arrow.draw(unit.x, unit.y, dx, dy, mag);
  }

  private redrawStage2(): void {
    if (this.state.kind !== "stage2-pending" && this.state.kind !== "stage2-drag") return;
    const { unit, dirX, dirY, speed } = this.state;

    // base direction arrow (length scaled to speed)
    const t = (speed - MIN_LAUNCH_SPEED) / (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED);
    const baseLen = Phaser.Math.Linear(60, 220, Phaser.Math.Clamp(t, 0, 1));
    this.arrow.draw(unit.x, unit.y, dirX, dirY, MAX_DRAG_PIXELS * t * 0.9);

    // curve preview
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

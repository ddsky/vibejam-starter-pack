import Phaser from "phaser";
import type { Unit } from "../objects/Unit";
import { DragArrow } from "../ui/DragArrow";
import {
  FRICTION,
  MAX_DRAG_PIXELS,
  MAX_LAUNCH_SPEED,
  MIN_LAUNCH_SPEED,
} from "../config/balance";
import { sounds } from "../audio/SoundManager";

export type LaunchHandler = (unit: Unit, vx: number, vy: number) => void;
export type CanDragPredicate = (unit: Unit) => boolean;

interface DragState {
  unit: Unit;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export class DragInput {
  protected scene: Phaser.Scene;
  protected arrow: DragArrow;
  protected drag: DragState | null = null;
  protected canDrag: CanDragPredicate;
  protected onLaunch: LaunchHandler;

  constructor(scene: Phaser.Scene, canDrag: CanDragPredicate, onLaunch: LaunchHandler) {
    this.scene = scene;
    this.canDrag = canDrag;
    this.onLaunch = onLaunch;
    this.arrow = new DragArrow(scene);

    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
  }

  attachUnit(unit: Unit): void {
    unit.setInteractive({ useHandCursor: true });
    unit.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (!this.canDrag(unit)) return;
      if (this.drag) return;
      this.drag = {
        unit,
        startX: pointer.worldX,
        startY: pointer.worldY,
        currentX: pointer.worldX,
        currentY: pointer.worldY,
      };
    });
  }

  protected handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    this.drag.currentX = pointer.worldX;
    this.drag.currentY = pointer.worldY;
    this.redrawArrow();
  }

  protected handlePointerUp(_pointer: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const { unit, startX, startY, currentX, currentY } = this.drag;
    this.arrow.hide();
    this.drag = null;

    // launch direction is opposite the drag direction
    const dx = startX - currentX;
    const dy = startY - currentY;
    const mag = Math.hypot(dx, dy);
    if (mag < 8) return; // ignored — too small
    const clamped = Math.min(mag, MAX_DRAG_PIXELS);
    const t = clamped / MAX_DRAG_PIXELS;
    const speed = Phaser.Math.Linear(MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED, t);
    const vx = (dx / mag) * speed;
    const vy = (dy / mag) * speed;
    this.onLaunch(unit, vx, vy);
  }

  protected redrawArrow(): void {
    if (!this.drag) return;
    const { unit, startX, startY, currentX, currentY } = this.drag;
    const dx = startX - currentX;
    const dy = startY - currentY;
    const mag = Math.hypot(dx, dy);
    this.arrow.draw(unit.x, unit.y, dx, dy, mag);
  }

  cancel(): void {
    this.arrow.hide();
    this.drag = null;
  }

  isDragging(): boolean {
    return this.drag !== null;
  }
}

// helper for launch handler
export function launchUnit(unit: Unit, vx: number, vy: number): void {
  unit.isMoving = true;
  unit.knockedBack = false;
  unit.hasHitThisSlide = false; // critical: clear stale CCD-skip state from prior slides
  unit.lastHitBy = null;
  unit.curveAngularVelocity = 0;
  unit.setFacingFromVelocity(vx, vy); // unit immediately faces its slide direction
  const body = unit.body as Phaser.Physics.Arcade.Body;
  body.setVelocity(vx, vy);
  // NOTE: we do NOT set body.setDrag here. Phaser's drag is applied per-axis,
  // which makes the smaller velocity component hit 0 before the larger one
  // and the unit visibly curves toward the dominant axis. Instead,
  // GameScene.update applies drag along the velocity vector, preserving
  // the slide's direction perfectly.
  sounds.playLaunch();
}
// FRICTION import kept for future use; suppress unused warning.
void FRICTION;

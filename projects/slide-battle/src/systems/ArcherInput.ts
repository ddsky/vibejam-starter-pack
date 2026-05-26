import Phaser from "phaser";
import type { Unit } from "../objects/Unit";
import { DragArrow } from "../ui/DragArrow";
import {
  ARROW_MAX_SPEED,
  ARROW_MIN_SPEED,
  MAX_DRAG_PIXELS,
  MAX_LAUNCH_SPEED,
  MIN_LAUNCH_SPEED,
} from "../config/balance";
import { ARCHER_INNER_RING_RATIO } from "../scenes/BootScene";

export type ArcherMode = "move" | "shoot";
export type ArcherLaunchHandler = (
  unit: Unit,
  mode: ArcherMode,
  vx: number,
  vy: number,
) => void;
export type CanDragPredicate = (unit: Unit) => boolean;

interface DragState {
  unit: Unit;
  mode: ArcherMode;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export class ArcherInput {
  private scene: Phaser.Scene;
  private arrow: DragArrow;
  private drag: DragState | null = null;
  private canDrag: CanDragPredicate;
  private onLaunch: ArcherLaunchHandler;

  constructor(scene: Phaser.Scene, canDrag: CanDragPredicate, onLaunch: ArcherLaunchHandler) {
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
      const dx = pointer.worldX - unit.x;
      const dy = pointer.worldY - unit.y;
      const distSq = dx * dx + dy * dy;
      const innerRadius = unit.radius * ARCHER_INNER_RING_RATIO;
      const mode: ArcherMode = distSq < innerRadius * innerRadius ? "shoot" : "move";
      this.drag = {
        unit,
        mode,
        startX: pointer.worldX,
        startY: pointer.worldY,
        currentX: pointer.worldX,
        currentY: pointer.worldY,
      };
    });
  }

  isDragging(): boolean {
    return this.drag !== null;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    this.drag.currentX = pointer.worldX;
    this.drag.currentY = pointer.worldY;
    this.redrawArrow();
  }

  private handlePointerUp(_pointer: Phaser.Input.Pointer): void {
    if (!this.drag) return;
    const { unit, mode, startX, startY, currentX, currentY } = this.drag;
    this.arrow.hide();
    this.drag = null;

    const dx = startX - currentX;
    const dy = startY - currentY;
    const mag = Math.hypot(dx, dy);
    if (mag < 8) return;
    const clamped = Math.min(mag, MAX_DRAG_PIXELS);
    const t = clamped / MAX_DRAG_PIXELS;
    const speed =
      mode === "shoot"
        ? Phaser.Math.Linear(ARROW_MIN_SPEED, ARROW_MAX_SPEED, t)
        : Phaser.Math.Linear(MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED, t);
    const vx = (dx / mag) * speed;
    const vy = (dy / mag) * speed;
    this.onLaunch(unit, mode, vx, vy);
  }

  private redrawArrow(): void {
    if (!this.drag) return;
    const { unit, mode, startX, startY, currentX, currentY } = this.drag;
    const dx = startX - currentX;
    const dy = startY - currentY;
    const mag = Math.hypot(dx, dy);
    const fixed = mode === "shoot" ? 130 : undefined;
    this.arrow.draw(unit.x, unit.y, dx, dy, mag, { fixedLength: fixed });
  }
}

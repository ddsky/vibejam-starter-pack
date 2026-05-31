import Phaser from "phaser";

export interface PointerWorldPosition {
  worldX: number;
  worldY: number;
  clientX: number;
  clientY: number;
}

export interface PointerTrackingHandlers {
  onMove?: (position: PointerWorldPosition) => void;
  onUp?: (position: PointerWorldPosition) => void;
  onCancel?: () => void;
}

export function phaserPointerToWorld(
  scene: Phaser.Scene,
  pointer: Phaser.Input.Pointer,
): PointerWorldPosition {
  const event = pointer.event as Event | undefined;
  const client = event ? clientFromEvent(event, null, null, false) : null;
  if (client) return clientToWorld(scene, client.clientX, client.clientY);
  return { worldX: pointer.worldX, worldY: pointer.worldY, clientX: pointer.x, clientY: pointer.y };
}

export function startGlobalPointerTracking(
  scene: Phaser.Scene,
  pointer: Phaser.Input.Pointer,
  handlers: PointerTrackingHandlers,
): () => void {
  const nativeEvent = pointer.event as Event | undefined;
  const pointerId = getPointerId(nativeEvent);
  const touchId = getTouchIdentifier(nativeEvent);
  const canvas = scene.game.canvas;
  let active = true;

  if (pointerId !== null && "setPointerCapture" in canvas) {
    try {
      canvas.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is a nice-to-have; window listeners below still carry the gesture.
    }
  }

  const handleMove = (event: Event) => {
    if (!active) return;
    const client = clientFromEvent(event, pointerId, touchId, false);
    if (!client) return;
    preventDefault(event);
    handlers.onMove?.(clientToWorld(scene, client.clientX, client.clientY));
  };

  const handleUp = (event: Event) => {
    if (!active) return;
    const client = clientFromEvent(event, pointerId, touchId, true);
    if (!client) return;
    preventDefault(event);
    const position = clientToWorld(scene, client.clientX, client.clientY);
    cleanup();
    handlers.onUp?.(position);
  };

  const handleCancel = (_event: Event) => {
    if (!active) return;
    cleanup();
    handlers.onCancel?.();
  };

  window.addEventListener("pointermove", handleMove, { passive: false });
  window.addEventListener("pointerup", handleUp, { passive: false });
  window.addEventListener("pointercancel", handleCancel, { passive: false });
  window.addEventListener("mousemove", handleMove, { passive: false });
  window.addEventListener("mouseup", handleUp, { passive: false });
  window.addEventListener("touchmove", handleMove, { passive: false });
  window.addEventListener("touchend", handleUp, { passive: false });
  window.addEventListener("touchcancel", handleCancel, { passive: false });

  const cleanup = () => {
    if (!active) return;
    active = false;
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleCancel);
    window.removeEventListener("mousemove", handleMove);
    window.removeEventListener("mouseup", handleUp);
    window.removeEventListener("touchmove", handleMove);
    window.removeEventListener("touchend", handleUp);
    window.removeEventListener("touchcancel", handleCancel);
    if (pointerId !== null && "releasePointerCapture" in canvas) {
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {
        // Already released or never captured.
      }
    }
  };

  return cleanup;
}

function clientToWorld(scene: Phaser.Scene, clientX: number, clientY: number): PointerWorldPosition {
  const rect = scene.game.canvas.getBoundingClientRect();
  const gameSize = scene.scale.gameSize;
  const x = (clientX - rect.left) * (gameSize.width / rect.width);
  const y = (clientY - rect.top) * (gameSize.height / rect.height);
  const world = scene.cameras.main.getWorldPoint(x, y);
  return { worldX: world.x, worldY: world.y, clientX, clientY };
}

function getPointerId(event: Event | undefined): number | null {
  if (!event || !("pointerId" in event)) return null;
  const pointerId = (event as PointerEvent).pointerId;
  return typeof pointerId === "number" ? pointerId : null;
}

function getTouchIdentifier(event: Event | undefined): number | null {
  if (!event || !("changedTouches" in event)) return null;
  const touch = (event as TouchEvent).changedTouches[0];
  return touch ? touch.identifier : null;
}

function clientFromEvent(
  event: Event,
  pointerId: number | null,
  touchId: number | null,
  allowChangedTouch: boolean,
): { clientX: number; clientY: number } | null {
  if ("pointerId" in event) {
    const pointerEvent = event as PointerEvent;
    if (pointerId !== null && pointerEvent.pointerId !== pointerId) return null;
    return { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY };
  }

  if ("touches" in event || "changedTouches" in event) {
    const touchEvent = event as TouchEvent;
    const activeTouch = findTouch(touchEvent.touches, touchId);
    const changedTouch = allowChangedTouch ? findTouch(touchEvent.changedTouches, touchId) : null;
    const touch = activeTouch ?? changedTouch;
    return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
  }

  if ("clientX" in event && "clientY" in event) {
    const mouseEvent = event as MouseEvent;
    return { clientX: mouseEvent.clientX, clientY: mouseEvent.clientY };
  }

  return null;
}

function findTouch(touches: TouchList, touchId: number | null): Touch | null {
  if (touches.length === 0) return null;
  if (touchId === null) return touches[0] ?? null;
  for (let i = 0; i < touches.length; i++) {
    const touch = touches.item(i);
    if (touch?.identifier === touchId) return touch;
  }
  return null;
}

function preventDefault(event: Event): void {
  if (event.cancelable) event.preventDefault();
}

# CLAUDE.md

Guidance for Claude Code when working on this project.

## Commands

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Build production bundle to dist/
npm run preview  # Preview production build
npx tsc --noEmit # Type-check
```

No tests or linter are configured yet.

## Architecture

A Phaser 3 + TypeScript top-down tactics game. **No external art assets** — chips, icons, obstacles, and SFX are generated at runtime in `BootScene` (Graphics → texture) and `SoundManager` (WebAudio synth). The game runs at 1280×720, `Scale.FIT`, `Phaser.AUTO` renderer, Arcade physics with no gravity.

### Scene flow

```
BootScene → MainMenuScene → GameScene (+ HUDScene overlay) → GameOverScene
```

- **BootScene** ([src/scenes/BootScene.ts](src/scenes/BootScene.ts)): generates textures and immediately starts MainMenu.
- **MainMenuScene**: title, Play vs AI, Quit, decorative chips.
- **GameScene**: instantiates 8 units (4 per side), 3 obstacles, wires combat/input/AI/turn systems, launches HUDScene in parallel.
- **HUDScene**: top overlay showing turn label, AP dots, Mute and Give Up buttons. Subscribes to TurnManager events.
- **GameOverScene**: launched on game-over with `{ winner }`; modal overlay with Play Again / Main Menu.

### Config (tune balance here)

- [src/config/units.ts](src/config/units.ts) — unit stats, damage matrix, team colors.
- [src/config/balance.ts](src/config/balance.ts) — drag/launch speeds, friction, knockback factor, AI pacing, curve parameters.
- [src/config/layout.ts](src/config/layout.ts) — unit spawn positions, obstacle rects, field dimensions.

### Systems

- **DragInput** ([src/systems/DragInput.ts](src/systems/DragInput.ts)): generic drag-and-release for swordsmen. Scene-level `pointermove`/`pointerup` listeners + per-unit `pointerdown`.
- **ArcherInput** ([src/systems/ArcherInput.ts](src/systems/ArcherInput.ts)): inner-ring vs outer-ring hit test on pointerdown. Inner = shoot (fixed-length preview arrow), outer = move.
- **KnightCurve** ([src/systems/KnightCurve.ts](src/systems/KnightCurve.ts)): two-stage drag — `stage1-drag` → `stage2-pending` → `stage2-drag` → launch. Applies curve via per-frame angular velocity on the body.
- **CombatResolver** ([src/systems/CombatResolver.ts](src/systems/CombatResolver.ts)): wires `overlap(units, units)` and `collider(units, obstacles)`. Damage matrix + velocity-based knockback. Uses `hasHitThisSlide` guard to prevent multi-fire.
- **TurnManager** ([src/systems/TurnManager.ts](src/systems/TurnManager.ts)): state for current team, AP, at-rest, game-over. Emits `turn-changed`, `ap-changed`, `units-at-rest`, `game-over`.
- **AIController** ([src/systems/AIController.ts](src/systems/AIController.ts)): heuristic — per AP, score every melee + ranged action, pick the best with small RNG. Uses ray-vs-circle and ray-vs-rect to filter blocked paths. Adds ±5% speed and ±3° angle noise on execution.

### Objects

- **Unit** ([src/objects/Unit.ts](src/objects/Unit.ts)) extends `Arcade.Sprite`. Holds team, type, hp, isMoving/knockedBack/hasHitThisSlide flags, curveAngularVelocity. Owns its own HP bar and icon as scene children, repositioned in `preUpdate`.
- **Arrow** ([src/objects/Arrow.ts](src/objects/Arrow.ts)) extends `Arcade.Image`. **Construct → add to group → `launch()`**. Don't pass velocity to the constructor — adding to a physics group resets the body and the velocity is lost.
- **Obstacle** ([src/objects/Obstacle.ts](src/objects/Obstacle.ts)) — tinted static body with an outline overlay.

### Audio

[src/audio/SoundManager.ts](src/audio/SoundManager.ts) is a singleton `sounds` exported from the module. All SFX are WebAudio synth (no asset files). Music is a slow 110Hz/165Hz sine pad with a tremolo LFO. Started in `GameScene.create` (first click satisfies autoplay rules).

## Patterns

- **Physics group ordering pitfall**: adding a physics object to a `Phaser.Physics.Arcade.Group` can reset its body's velocity. Always set velocity *after* `group.add(...)`. Arrow uses a separate `launch()` method for this reason.
- **Settle loop in `GameScene.update`**: when a moving unit's body speed drops below `REST_SPEED`, zero its velocity and clear `isMoving`/`knockedBack`/`hasHitThisSlide`/`curveAngularVelocity`. This is the only place those flags reset.
- **Knight curve**: applied as `body.velocity.rotate(curveAngularVelocity * dt)` per frame. Friction reduces magnitude; the rotation just redirects.
- **Input controllers share scene-level pointer events**: each controller registers its own `pointermove`/`pointerup` listeners and gates on its own internal state. `canDragUnit` in GameScene also blocks all inputs while KnightCurve is in any non-idle state, to prevent cross-controller conflicts.
- **Dev hook**: `main.ts` exposes the Phaser game on `window.__game` for browser-devtools poking. Safe to remove for a production build.

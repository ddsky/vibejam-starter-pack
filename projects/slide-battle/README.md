# Slide Battle

A top-down 2D turn-based tactics game where you drag-and-release to slide chip-style units into enemies. Think Soccer Stars meets a tiny tactics game.

Built with [Phaser 3](https://phaser.io/) + TypeScript + [Vite](https://vitejs.dev/).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173 (or next free port)
npm run build    # production bundle to dist/
npm run preview  # serve the built bundle
```

No third-party art assets — chips, icons, obstacles, and SFX are all generated procedurally.

## How to play

You command 4 blue units against 4 red AI units. Each turn you get 3 action points (AP); each slide or arrow shot costs 1 AP. You win when every red unit is destroyed.

### Controls

| Unit | Action | How |
| --- | --- | --- |
| Swordsman | Slide attack | Press on the chip, drag in the opposite direction of where you want to go, release. The further you drag, the harder the slide. |
| Archer | Move | Press on the **outer** ring of the chip, drag, release. Slides like a swordsman. |
| Archer | Shoot arrow | Press on the **inner** ring of the chip, drag, release. The arrow flies in the direction you released. Arrows are blocked by obstacles and by friendly units. |
| Knight | Curved slide | Press on the chip, drag, release to set direction & power. Then press again **anywhere** and drag left/right to bend the curve. Release again to launch. |

The drag arrow's **color and thickness** indicates power (green → red, thin → thick). For archer shots the arrow's **length is fixed** so it doesn't obscure your shot.

### Damage matrix

| Attacker ↓ \ Defender → | Swordsman | Archer | Knight |
| --- | --- | --- | --- |
| Swordsman | 20 | 40 | 10 |
| Archer (arrow) | 15 | 30 | 10 |
| Knight | 30 | 50 | 20 |

Surviving defenders are knocked back; their knockback distance scales with the attacker's slide velocity at impact.

## Architecture

See [CLAUDE.md](CLAUDE.md) for a deeper tour. Short version:

```
src/
├── main.ts                # Phaser.Game config
├── config/                # tunable constants (units, damage matrix, balance, layout)
├── scenes/                # Boot, MainMenu, Game, HUD, GameOver
├── objects/               # Unit, Obstacle, Arrow
├── systems/               # DragInput, ArcherInput, KnightCurve, CombatResolver, TurnManager, AIController
├── ui/                    # Button, HealthBar, DragArrow
└── audio/SoundManager.ts  # WebAudio synth (no asset files needed)
```

## Credits

PRD and game design by the project author. Implementation generated through a Claude Code planning session.

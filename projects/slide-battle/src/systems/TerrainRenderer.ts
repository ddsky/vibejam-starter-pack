import Phaser from "phaser";
import type { Terrain } from "./Terrain";
import {
  PLAYFIELD_LEFT,
  PLAYFIELD_TOP,
  PLAYFIELD_RIGHT,
  PLAYFIELD_BOTTOM,
  TERRAIN_CELL_W,
  TERRAIN_CELL_H,
  MAX_ELEVATION,
} from "../config/balance";

/**
 * Depth bands. Everything terrain-related sits BELOW units (chips at depth 0,
 * icons 2-4). GameScene owns the outermost layers (dark margin behind, border
 * /tint chrome in front); the renderer fills the middle.
 */
export const TERRAIN_DEPTH_BG = -1000; // dark out-of-bounds margin + grass base (GameScene)
export const TERRAIN_DEPTH_FG = -5; // border, divider, team tints (GameScene)

const D_GRASS = -200;
const D_WATER = -190;
const D_HILL_SHADOW = -185;
const D_HILL_FILL = -180;
const D_CONTOUR = -170;
const D_DECOR = -60;
const D_TREE_BASE = -40; // + y * 0.01 for painter's-order y-sorting

/** Interior grass tile of Tilemap_color1.png's flat-grass block (col 1, row 1). */
const GRASS_FRAME = 1 * 9 + 1; // 10

interface Pt { x: number; y: number }

/**
 * Paints a {@link Terrain} with Tiny Swords art. The terrain model is a grid,
 * but nothing here draws cell rectangles: water and hill regions are traced
 * into smooth organic outlines (marching squares + Chaikin smoothing) and
 * filled as fluid shapes, grass tiles are randomly flipped to hide repetition,
 * and forests are scattered sprites — so no grid is visible.
 */
export class TerrainRenderer {
  constructor(private scene: Phaser.Scene, private terrain: Terrain) {}

  render(): void {
    this.renderGrass();
    this.renderWater();
    this.renderHills();
    this.renderDecorations();
    this.renderForests();
  }

  /** Smooth, world-space outline loops around every cell where `inside` holds. */
  private organicLoops(inside: (cx: number, cy: number) => boolean, smooth = 3): Pt[][] {
    const loops = traceLoops(this.terrain.cols, this.terrain.rows, inside);
    return loops.map((loop) =>
      chaikin(loop, smooth).map((p) => ({
        x: Phaser.Math.Clamp(PLAYFIELD_LEFT + (p.x + 0.5) * TERRAIN_CELL_W, PLAYFIELD_LEFT, PLAYFIELD_RIGHT),
        y: Phaser.Math.Clamp(PLAYFIELD_TOP + (p.y + 0.5) * TERRAIN_CELL_H, PLAYFIELD_TOP, PLAYFIELD_BOTTOM),
      })),
    );
  }

  private renderGrass(): void {
    const t = this.terrain;
    const rng = Phaser.Math.RND;
    for (let cy = 0; cy < t.rows; cy++) {
      for (let cx = 0; cx < t.cols; cx++) {
        const img = this.scene.add.image(t.cellCenterX(cx), t.cellCenterY(cy), "ts-tiles", GRASS_FRAME);
        img.setDisplaySize(TERRAIN_CELL_W + 1, TERRAIN_CELL_H + 1);
        // Random flips break up the tiling so the grid never reads as a pattern.
        img.setFlipX(rng.frac() < 0.5);
        img.setFlipY(rng.frac() < 0.5);
        img.setDepth(D_GRASS);
      }
    }
  }

  private renderWater(): void {
    const loops = this.organicLoops((cx, cy) => this.terrain.cell(cx, cy).kind === "water", 3);
    if (!loops.length) return;
    const g = this.scene.add.graphics().setDepth(D_WATER);
    for (const loop of loops) {
      // Water body.
      g.fillStyle(0x2f6aa0, 1);
      g.fillPoints(loop, true);
      // Darker deep-water core (scaled in toward the centroid).
      const c = centroid(loop);
      const inner = loop.map((p) => ({ x: c.x + (p.x - c.x) * 0.68, y: c.y + (p.y - c.y) * 0.68 }));
      g.fillStyle(0x255a8c, 0.55);
      g.fillPoints(inner, true);
      // Foam shoreline (soft light band straddling the edge) + a crisp rim.
      g.lineStyle(6, 0xc6e8f7, 0.45);
      g.strokePoints(loop, true, true);
      g.lineStyle(2, 0x163d61, 0.8);
      g.strokePoints(loop, true, true);
    }
  }

  private renderHills(): void {
    const shadow = this.scene.add.graphics().setDepth(D_HILL_SHADOW);
    const fill = this.scene.add.graphics().setDepth(D_HILL_FILL);
    const contour = this.scene.add.graphics().setDepth(D_CONTOUR);
    for (let level = 1; level <= MAX_ELEVATION; level++) {
      const loops = this.organicLoops((cx, cy) => this.terrain.cell(cx, cy).elevation >= level, 3);
      for (const loop of loops) {
        if (level === 1) {
          // Drop shadow offset down-right, on the grass below the slope.
          const sh = loop.map((p) => ({ x: p.x + 5, y: p.y + 7 }));
          shadow.fillStyle(0x0a1f10, 0.2);
          shadow.fillPoints(sh, true);
        }
        // Brighten — overlapping levels stack, so higher ground is more sunlit.
        fill.fillStyle(0xffffff, 0.1);
        fill.fillPoints(loop, true);
        // Smooth topographic contour at each elevation step.
        contour.lineStyle(2, 0x2c5a28, 0.8);
        contour.strokePoints(loop, true, true);
        // Faint sunlit rim just inside the contour (offset up).
        const rim = loop.map((p) => ({ x: p.x, y: p.y - 2 }));
        contour.lineStyle(1, 0xd6f0b4, 0.4);
        contour.strokePoints(rim, true, true);
      }
    }
  }

  /** Cosmetic rocks scattered on hilltops (no collision). */
  private renderDecorations(): void {
    const t = this.terrain;
    const rng = Phaser.Math.RND;
    for (let cy = 0; cy < t.rows; cy++) {
      for (let cx = 0; cx < t.cols; cx++) {
        if (t.cell(cx, cy).elevation <= 0) continue;
        if (rng.frac() >= 0.14) continue;
        const x = t.cellCenterX(cx) + rng.between(-12, 12);
        const y = t.cellCenterY(cy) + rng.between(-10, 10);
        const rock = this.scene.add.image(x, y, `rock-${rng.between(1, 4)}`);
        rock.setDisplaySize(TERRAIN_CELL_W * 0.45, TERRAIN_CELL_H * 0.45);
        rock.setDepth(D_DECOR + y * 0.01);
      }
    }
  }

  private renderForests(): void {
    for (const spec of this.terrain.forestTrees()) {
      const tree = this.scene.add.sprite(spec.x, spec.y, `tree-${spec.type}`);
      tree.setScale(spec.scale);
      tree.setOrigin(0.5, 0.82); // trunk near the cell, canopy overhangs upward
      tree.setDepth(D_TREE_BASE + spec.y * 0.01);
      tree.play(`tree-${spec.type}-sway`);
      tree.anims.setProgress(spec.animProgress);
    }
  }
}

// --- organic-outline helpers ------------------------------------------------

/** Average of a point loop. */
function centroid(loop: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of loop) {
    x += p.x;
    y += p.y;
  }
  return { x: x / loop.length, y: y / loop.length };
}

/**
 * Marching squares over the cell-center field of a boolean region. Returns
 * closed loops in cell-index space (vertices at cell-edge midpoints). The field
 * is padded with "outside" so regions touching the grid edge still close.
 */
function traceLoops(cols: number, rows: number, inside: (cx: number, cy: number) => boolean): Pt[][] {
  const val = (cx: number, cy: number) => (cx >= 0 && cy >= 0 && cx < cols && cy < rows && inside(cx, cy) ? 1 : 0);
  const key = (p: Pt) => `${Math.round(p.x * 2)}_${Math.round(p.y * 2)}`;
  const adj = new Map<string, string[]>();
  const pos = new Map<string, Pt>();
  const link = (a: Pt, b: Pt) => {
    const ka = key(a);
    const kb = key(b);
    pos.set(ka, a);
    pos.set(kb, b);
    (adj.get(ka) ?? adj.set(ka, []).get(ka)!).push(kb);
    (adj.get(kb) ?? adj.set(kb, []).get(kb)!).push(ka);
  };

  for (let cy = -1; cy < rows; cy++) {
    for (let cx = -1; cx < cols; cx++) {
      const tl = val(cx, cy);
      const tr = val(cx + 1, cy);
      const br = val(cx + 1, cy + 1);
      const bl = val(cx, cy + 1);
      const code = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (code === 0 || code === 15) continue;
      const top: Pt = { x: cx + 0.5, y: cy };
      const right: Pt = { x: cx + 1, y: cy + 0.5 };
      const bottom: Pt = { x: cx + 0.5, y: cy + 1 };
      const left: Pt = { x: cx, y: cy + 0.5 };
      switch (code) {
        case 1: link(left, bottom); break;
        case 2: link(bottom, right); break;
        case 3: link(left, right); break;
        case 4: link(top, right); break;
        case 5: link(left, top); link(bottom, right); break;
        case 6: link(top, bottom); break;
        case 7: link(left, top); break;
        case 8: link(top, left); break;
        case 9: link(top, bottom); break;
        case 10: link(top, right); link(left, bottom); break;
        case 11: link(top, right); break;
        case 12: link(left, right); break;
        case 13: link(bottom, right); break;
        case 14: link(left, bottom); break;
      }
    }
  }

  // Walk the degree-2 adjacency graph into closed loops.
  const loops: Pt[][] = [];
  const visited = new Set<string>();
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const loop: Pt[] = [];
    let cur: string | undefined = start;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      loop.push(pos.get(cur)!);
      cur = (adj.get(cur) ?? []).find((k) => !visited.has(k));
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Chaikin corner-cutting on a closed loop — turns a jagged outline into a fluid curve. */
function chaikin(loop: Pt[], iterations: number): Pt[] {
  let pts = loop;
  for (let it = 0; it < iterations; it++) {
    const out: Pt[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    pts = out;
  }
  return pts;
}

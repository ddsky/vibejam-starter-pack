import Phaser from "phaser";
import {
  PLAYFIELD_LEFT,
  PLAYFIELD_TOP,
  TERRAIN_COLS,
  TERRAIN_ROWS,
  TERRAIN_CELL_W,
  TERRAIN_CELL_H,
  TERRAIN_SPAWN_ROW_MARGIN,
  MAX_ELEVATION,
  WATER_BLOBS_MIN,
  WATER_BLOBS_MAX,
  WATER_BLOB_CELLS_MIN,
  WATER_BLOB_CELLS_MAX,
  FOREST_BLOBS_MIN,
  FOREST_BLOBS_MAX,
  FOREST_BLOB_CELLS_MIN,
  FOREST_BLOB_CELLS_MAX,
  HILL_BLOBS_MIN,
  HILL_BLOBS_MAX,
  HILL_BLOB_CELLS_MIN,
  HILL_BLOB_CELLS_MAX,
  MAX_BLOCKED_FRACTION,
} from "../config/balance";

export type TerrainKind = "grass" | "forest" | "water" | "hill";

/**
 * Width (in cells) of the guaranteed open lane between the two sides. A unit is
 * wider than one cell, so it needs an open cell of slack on each side to slide
 * through — three keeps a navigable centre column after footprint erosion.
 */
const CORRIDOR_WIDTH = 3;

export interface TerrainCell {
  kind: TerrainKind;
  /** 0 for grass/forest/water; >= 1 for hills. */
  elevation: number;
}

/** A merged collision rectangle (centered, world pixels). */
export interface BlockedRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Render/collision data for one visible forest tree. */
export interface ForestTree {
  x: number;
  y: number;
  type: number;
  scale: number;
  animProgress: number;
  collisionRadius: number;
}

export type TerrainCollisionShape =
  | { shape: "rect"; terrain: "water"; cx: number; cy: number; w: number; h: number }
  | { shape: "circle"; terrain: "forest"; cx: number; cy: number; r: number };

type Coord = [number, number];

const TREE_ART_WIDTH = 192;
const TREE_WIDTH_SCALE = 1.3;
const TREE_COLLISION_RADIUS_RATIO = 0.21;
const TREE_COLLISION_RADIUS_MIN = 12;
const TREE_COLLISION_RADIUS_MAX = 22;

/**
 * Procedural natural battlefield. A grid of cells over the playfield, each
 * grass / forest / water / hill with an integer elevation. Forest + water are
 * non-traversable at the pathfinding layer; the scene turns water cells into
 * static rectangles and visible forest trees into circular static bodies. Hills
 * are traversable but carry elevation, which the friction loop and the combat
 * resolver read via {@link elevationAt}.
 *
 * Generation is driven entirely by the injected RNG, so seeding it reproduces
 * a field (handy for debugging).
 */
export class Terrain {
  readonly cols = TERRAIN_COLS;
  readonly rows = TERRAIN_ROWS;
  readonly cells: TerrainCell[]; // row-major, length cols*rows

  private rng: Phaser.Math.RandomDataGenerator;
  private forestTreeCache: ForestTree[] | null = null;

  constructor(rng: Phaser.Math.RandomDataGenerator) {
    this.rng = rng;
    this.cells = new Array(this.cols * this.rows);
    this.generate();
  }

  // --- grid access -----------------------------------------------------------

  private index(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows;
  }

  /** Clamped cell access (never out of bounds). */
  cell(cx: number, cy: number): TerrainCell {
    const x = Phaser.Math.Clamp(cx, 0, this.cols - 1);
    const y = Phaser.Math.Clamp(cy, 0, this.rows - 1);
    return this.cells[this.index(x, y)];
  }

  worldToCol(x: number): number {
    return Phaser.Math.Clamp(Math.floor((x - PLAYFIELD_LEFT) / TERRAIN_CELL_W), 0, this.cols - 1);
  }

  worldToRow(y: number): number {
    return Phaser.Math.Clamp(Math.floor((y - PLAYFIELD_TOP) / TERRAIN_CELL_H), 0, this.rows - 1);
  }

  /** Cell center in world pixels. */
  cellCenterX(cx: number): number {
    return PLAYFIELD_LEFT + cx * TERRAIN_CELL_W + TERRAIN_CELL_W / 2;
  }

  cellCenterY(cy: number): number {
    return PLAYFIELD_TOP + cy * TERRAIN_CELL_H + TERRAIN_CELL_H / 2;
  }

  isBlocked(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    const k = this.cells[this.index(cx, cy)].kind;
    return k === "forest" || k === "water";
  }

  /**
   * Like {@link isBlocked} but treats out-of-bounds as NOT solid — the playfield
   * edge is a soft wall units bounce off, not an obstacle. Used by navigation so
   * the field can hug the field boundary.
   */
  private solid(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return false;
    const k = this.cells[this.index(cx, cy)].kind;
    return k === "forest" || k === "water";
  }

  /**
   * Can a unit's center sit at this cell without being too close to terrain?
   * The AI still treats forest/water as blocked terrain regions, then precise
   * obstacle shapes get a final line-clearance check before any slide.
   */
  private isNavigable(cx: number, cy: number, clearanceCells: number): boolean {
    if (this.solid(cx, cy) || !this.inBounds(cx, cy)) return false;
    for (let oy = -clearanceCells; oy <= clearanceCells; oy++) {
      for (let ox = -clearanceCells; ox <= clearanceCells; ox++) {
        if (this.solid(cx + ox, cy + oy)) return false;
      }
    }
    return true;
  }

  /** Elevation at a world position — the key API used by combat + friction. */
  elevationAt(x: number, y: number): number {
    return this.cell(this.worldToCol(x), this.worldToRow(y)).elevation;
  }

  /** Top/bottom rows reserved for unit spawns: always flat grass, never blocked. */
  private isProtected(cy: number): boolean {
    return cy < TERRAIN_SPAWN_ROW_MARGIN || cy >= this.rows - TERRAIN_SPAWN_ROW_MARGIN;
  }

  // --- generation ------------------------------------------------------------

  private generate(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = { kind: "grass", elevation: 0 };
    }

    // Track blocked blobs newest-last so we can revert if coverage is too high.
    const blockedBlobs: Coord[][] = [];
    const onGrass = (cx: number, cy: number) => this.cells[this.index(cx, cy)].kind === "grass";

    // Lakes (water).
    for (let i = 0; i < this.rng.between(WATER_BLOBS_MIN, WATER_BLOBS_MAX); i++) {
      const blob = this.growBlob(this.rng.between(WATER_BLOB_CELLS_MIN, WATER_BLOB_CELLS_MAX), onGrass);
      for (const [cx, cy] of blob) this.cells[this.index(cx, cy)].kind = "water";
      if (blob.length) blockedBlobs.push(blob);
    }

    // Forests.
    for (let i = 0; i < this.rng.between(FOREST_BLOBS_MIN, FOREST_BLOBS_MAX); i++) {
      const blob = this.growBlob(this.rng.between(FOREST_BLOB_CELLS_MIN, FOREST_BLOB_CELLS_MAX), onGrass);
      for (const [cx, cy] of blob) this.cells[this.index(cx, cy)].kind = "forest";
      if (blob.length) blockedBlobs.push(blob);
    }

    // Anti-wall-in: revert most-recent blocked blobs until under the cap.
    const maxBlocked = Math.floor(this.cols * this.rows * MAX_BLOCKED_FRACTION);
    while (this.countBlocked() > maxBlocked && blockedBlobs.length > 0) {
      const blob = blockedBlobs.pop()!;
      for (const [cx, cy] of blob) this.cells[this.index(cx, cy)] = { kind: "grass", elevation: 0 };
    }
    // Guarantee at least one fully open column so neither side is boxed in.
    this.ensureOpenCorridor();

    // Hills — grass only, concentric elevation (peak at the seed, lower outward).
    for (let i = 0; i < this.rng.between(HILL_BLOBS_MIN, HILL_BLOBS_MAX); i++) {
      const seed = this.randomCell(onGrass);
      if (!seed) continue;
      const blob = this.growBlobFrom(seed[0], seed[1], this.rng.between(HILL_BLOB_CELLS_MIN, HILL_BLOB_CELLS_MAX), onGrass);
      for (const [cx, cy] of blob) {
        const manhattan = Math.abs(cx - seed[0]) + Math.abs(cy - seed[1]);
        const elev = Phaser.Math.Clamp(MAX_ELEVATION - Math.floor(manhattan / 2), 1, MAX_ELEVATION);
        const cell = this.cells[this.index(cx, cy)];
        cell.kind = "hill";
        cell.elevation = Math.max(cell.elevation, elev);
      }
    }
  }

  private countBlocked(): number {
    let n = 0;
    for (const c of this.cells) if (c.kind === "forest" || c.kind === "water") n++;
    return n;
  }

  /** Pick a random unprotected cell satisfying `pred`, or null if none. */
  private randomCell(pred: (cx: number, cy: number) => boolean): Coord | null {
    const candidates: Coord[] = [];
    for (let cy = 0; cy < this.rows; cy++) {
      if (this.isProtected(cy)) continue;
      for (let cx = 0; cx < this.cols; cx++) {
        if (pred(cx, cy)) candidates.push([cx, cy]);
      }
    }
    return candidates.length ? this.rng.pick(candidates) : null;
  }

  private growBlob(size: number, pred: (cx: number, cy: number) => boolean): Coord[] {
    const seed = this.randomCell(pred);
    return seed ? this.growBlobFrom(seed[0], seed[1], size, pred) : [];
  }

  /** Random-walk flood from a seed, taking up to `size` cells that pass `pred`. */
  private growBlobFrom(
    seedCx: number,
    seedCy: number,
    size: number,
    pred: (cx: number, cy: number) => boolean,
  ): Coord[] {
    const out: Coord[] = [];
    const taken = new Set<number>();
    const frontier: Coord[] = [[seedCx, seedCy]];
    const accept = (cx: number, cy: number) =>
      this.inBounds(cx, cy) && !this.isProtected(cy) && !taken.has(this.index(cx, cy)) && pred(cx, cy);

    while (out.length < size && frontier.length > 0) {
      const [cx, cy] = frontier.splice(this.rng.between(0, frontier.length - 1), 1)[0];
      if (!accept(cx, cy)) continue;
      taken.add(this.index(cx, cy));
      out.push([cx, cy]);
      frontier.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return out;
  }

  /**
   * Guarantee a unit-passable lane between the two spawn bands. A single open
   * column isn't enough: a unit is wider than one cell, so it needs ~1 open cell
   * of slack on each side. We require (and if missing, carve) a band of
   * {@link CORRIDOR_WIDTH} consecutive fully-open columns, which leaves a
   * navigable centre column once the AI field erodes by the unit footprint.
   */
  private ensureOpenCorridor(): void {
    const columnOpen = (cx: number) => {
      for (let cy = 0; cy < this.rows; cy++) {
        if (!this.isProtected(cy) && this.solid(cx, cy)) return false;
      }
      return true;
    };
    const bandOpen = (startCx: number) => {
      for (let cx = startCx; cx < startCx + CORRIDOR_WIDTH; cx++) if (!columnOpen(cx)) return false;
      return true;
    };
    for (let cx = 0; cx + CORRIDOR_WIDTH <= this.cols; cx++) if (bandOpen(cx)) return;
    // None wide enough — carve a grass band at a random interior position.
    const startCx = this.rng.between(1, this.cols - CORRIDOR_WIDTH - 1);
    for (let cx = startCx; cx < startCx + CORRIDOR_WIDTH; cx++) {
      for (let cy = 0; cy < this.rows; cy++) {
        if (!this.isProtected(cy)) this.cells[this.index(cx, cy)] = { kind: "grass", elevation: 0 };
      }
    }
  }

  // --- collision shapes ------------------------------------------------------

  /**
   * Visible forest trees. Collision uses these exact placements, so a unit
   * no longer hits an invisible full-cell forest rectangle around sparse trees.
   */
  forestTrees(): readonly ForestTree[] {
    if (this.forestTreeCache) return this.forestTreeCache;

    const trees: ForestTree[] = [];
    const baseScale = (TERRAIN_CELL_W * TREE_WIDTH_SCALE) / TREE_ART_WIDTH;
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        if (this.cell(cx, cy).kind !== "forest") continue;
        const count = this.rng.frac() < 0.35 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const type = this.rng.between(1, 4);
          const x = this.cellCenterX(cx) + this.rng.between(-18, 18);
          const y = this.cellCenterY(cy) + this.rng.between(-16, 16);
          const scale = baseScale * this.rng.realInRange(0.8, 1.35);
          const visualWidth = TREE_ART_WIDTH * scale;
          trees.push({
            x,
            y,
            type,
            scale,
            animProgress: this.rng.frac(),
            collisionRadius: Phaser.Math.Clamp(
              visualWidth * TREE_COLLISION_RADIUS_RATIO,
              TREE_COLLISION_RADIUS_MIN,
              TREE_COLLISION_RADIUS_MAX,
            ),
          });
        }
      }
    }

    this.forestTreeCache = trees;
    return trees;
  }

  /**
   * Physics shapes for terrain blockers. Water remains broad rect coverage;
   * forests are per-tree circular footprints that match the rendered trees.
   */
  collisionShapes(): TerrainCollisionShape[] {
    return [
      ...this.rectsFor((cx, cy) => this.cell(cx, cy).kind === "water").map((r) => ({
        shape: "rect" as const,
        terrain: "water" as const,
        ...r,
      })),
      ...this.forestTrees().map((tree) => ({
        shape: "circle" as const,
        terrain: "forest" as const,
        cx: tree.x,
        cy: tree.y,
        r: tree.collisionRadius,
      })),
    ];
  }

  /**
   * Merge contiguous blocked cells per row into rectangles. Row-runs avoid the
   * many-tiny-bodies problem where units catch on seams between adjacent cells;
   * the remaining vertical seams run perpendicular to typical slide direction.
   */
  blockedRects(): BlockedRect[] {
    return this.rectsFor((cx, cy) => this.isBlocked(cx, cy));
  }

  private rectsFor(inside: (cx: number, cy: number) => boolean): BlockedRect[] {
    const rects: BlockedRect[] = [];
    for (let cy = 0; cy < this.rows; cy++) {
      let runStart = -1;
      for (let cx = 0; cx <= this.cols; cx++) {
        const blocked = cx < this.cols && inside(cx, cy);
        if (blocked && runStart < 0) {
          runStart = cx;
        } else if (!blocked && runStart >= 0) {
          const w = (cx - runStart) * TERRAIN_CELL_W;
          const h = TERRAIN_CELL_H;
          const x = PLAYFIELD_LEFT + runStart * TERRAIN_CELL_W;
          const y = PLAYFIELD_TOP + cy * TERRAIN_CELL_H;
          rects.push({ cx: x + w / 2, cy: y + h / 2, w, h });
          runStart = -1;
        }
      }
    }
    return rects;
  }

  // --- pathfinding -----------------------------------------------------------

  /**
   * BFS geodesic step-distance from the goal cell to every cell a unit can
   * actually occupy (8-connected). `clearanceCells` erodes the free space by the
   * unit's footprint so the field never routes through gaps too narrow to slide
   * through (see {@link isNavigable}). Returns a row-major array; cells a unit
   * can't reach are Infinity.
   *
   * The AI uses this to navigate *around* terrain walls: a unit makes progress
   * by moving to a cell with a lower field value, even when no straight line to
   * the target is clear. The goal cell itself is always seeded (the target may
   * stand right next to a wall), and diagonal steps that cut a solid corner are
   * disallowed.
   */
  distanceFieldFrom(goalX: number, goalY: number, clearanceCells = 0): number[] {
    const n = this.cols * this.rows;
    const navigable: boolean[] = new Array(n);
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        navigable[this.index(cx, cy)] = this.isNavigable(cx, cy, clearanceCells);
      }
    }
    const field: number[] = new Array(n).fill(Infinity);
    const start = this.index(this.worldToCol(goalX), this.worldToRow(goalY));
    navigable[start] = true; // the target's own cell is always a valid endpoint
    field[start] = 0;
    const queue: number[] = [start];
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const cx = idx % this.cols;
      const cy = (idx - cx) / this.cols;
      const d = field[idx];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (!this.inBounds(nx, ny)) continue;
          const nIdx = this.index(nx, ny);
          if (!navigable[nIdx]) continue;
          // No diagonal corner-cutting past a solid orthogonal neighbour.
          if (ox !== 0 && oy !== 0 && (this.solid(cx + ox, cy) || this.solid(cx, cy + oy))) continue;
          if (field[nIdx] <= d + 1) continue;
          field[nIdx] = d + 1;
          queue.push(nIdx);
        }
      }
    }
    return field;
  }

  /** Sample a precomputed distance field at a world position (Infinity if blocked/unreachable). */
  fieldAt(field: number[], x: number, y: number): number {
    return field[this.index(this.worldToCol(x), this.worldToRow(y))];
  }

  /**
   * Follow a distance field's steepest descent for up to `maxSteps` cells and
   * return the world-space center of the cell reached. This is a look-ahead
   * point that rounds terrain walls: the AI aims its repositioning moves toward
   * it instead of straight at a target it has no clear line to. Returns null if
   * the start position is unreachable (field is Infinity there).
   */
  flowLookahead(field: number[], x: number, y: number, maxSteps: number): { x: number; y: number } | null {
    let cx = this.worldToCol(x);
    let cy = this.worldToRow(y);
    if (!Number.isFinite(field[this.index(cx, cy)])) return null;
    for (let step = 0; step < maxSteps; step++) {
      let bestVal = field[this.index(cx, cy)];
      let bx = cx;
      let by = cy;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (!this.inBounds(nx, ny)) continue;
          // The field is already Infinity on non-navigable cells, so descending
          // it can never enter one; just block diagonal solid-corner cuts.
          if (ox !== 0 && oy !== 0 && (this.solid(cx + ox, cy) || this.solid(cx, cy + oy))) continue;
          const v = field[this.index(nx, ny)];
          if (v < bestVal) {
            bestVal = v;
            bx = nx;
            by = ny;
          }
        }
      }
      if (bx === cx && by === cy) break; // local minimum — goal reached or no descent
      cx = bx;
      cy = by;
    }
    return { x: this.cellCenterX(cx), y: this.cellCenterY(cy) };
  }

  /** ASCII dump for console sanity-checking (.=grass F=forest ~=water 1/2=hill). */
  debugString(): string {
    let s = "";
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const c = this.cells[this.index(cx, cy)];
        s += c.kind === "water" ? "~" : c.kind === "forest" ? "F" : c.kind === "hill" ? String(c.elevation) : ".";
      }
      s += "\n";
    }
    return s;
  }
}

/**
 * Max drag distance (game units) that maps to full launch power.
 * Kept small enough that the cursor can always travel that far inside the
 * canvas viewport even when the unit is at a field edge — otherwise the OS
 * Dock / screen edge cuts off the drag before full charge can be reached.
 */
export const MAX_DRAG_PIXELS = 100;
export const MAX_LAUNCH_SPEED = 900;
export const MIN_LAUNCH_SPEED = 140;
export const FRICTION = 700;
export const REST_SPEED = 8;

/**
 * Arc-flight arrow constants. Arrows are ballistic now:
 *   x, y advance at (vx, vy)  ← horizontal velocity, constant
 *   height advances at vh, vh decreases by ARROW_GRAVITY each second
 *
 * Charge maps to both horizontal speed and initial vertical (vh) velocity,
 * so heavier charges fly faster, further, and higher.
 */
export const ARROW_HSPEED_MIN = 320;
export const ARROW_HSPEED_MAX = 900;
export const ARROW_VH_MIN = 220;
export const ARROW_VH_MAX = 620;
export const ARROW_GRAVITY = 1100;
/** Arrow can only hit a unit when its height drops below this. */
export const ARROW_HIT_HEIGHT = 38;
// Aliases used by ArcherInput to map drag-charge to horizontal launch speed.
export const ARROW_MIN_SPEED = ARROW_HSPEED_MIN;
export const ARROW_MAX_SPEED = ARROW_HSPEED_MAX;
/** Legacy alias retained for any old references. */
export const ARROW_SPEED = ARROW_MAX_SPEED;
export const ARROW_LENGTH = 26;
export const ARROW_THICKNESS = 4;

export const KNOCKBACK_VELOCITY_FACTOR = 0.55;

export const KNIGHT_CURVE_DECAY = 0.965;
export const KNIGHT_CURVE_MAX_ACCEL = 1400;
/** Stage-2 curve drag — kept small for the same edge-usability reason. */
export const KNIGHT_CURVE_MAX_DRAG = 90;

export const STARTING_AP = 3;
export const AI_ACTION_PACING_MS = 700;

export const FIELD_WIDTH = 1280;
export const FIELD_HEIGHT = 720;

/**
 * Margins around the playable battlefield. The canvas stays at FIELD_WIDTH ×
 * FIELD_HEIGHT, but units are constrained to a smaller inner rectangle so
 * there's always at least MAX_DRAG_PIXELS of buffer space inside the canvas
 * for the player's cursor to extend into when launching from an edge unit.
 * The HUD overlays the top margin.
 */
export const PLAYFIELD_MARGIN_X = 110;
export const PLAYFIELD_MARGIN_TOP = 90;
export const PLAYFIELD_MARGIN_BOTTOM = 110;
export const PLAYFIELD_LEFT = PLAYFIELD_MARGIN_X;
export const PLAYFIELD_TOP = PLAYFIELD_MARGIN_TOP;
export const PLAYFIELD_RIGHT = FIELD_WIDTH - PLAYFIELD_MARGIN_X;
export const PLAYFIELD_BOTTOM = FIELD_HEIGHT - PLAYFIELD_MARGIN_BOTTOM;
export const PLAYFIELD_WIDTH = PLAYFIELD_RIGHT - PLAYFIELD_LEFT;
export const PLAYFIELD_HEIGHT = PLAYFIELD_BOTTOM - PLAYFIELD_TOP;

/**
 * Natural battlefield terrain. A logical grid is laid over the playfield;
 * Tiny Swords 64px tiles are scaled to the cell size when rendered.
 */
export const TERRAIN_COLS = 20;
export const TERRAIN_ROWS = 10;
export const TERRAIN_CELL_W = PLAYFIELD_WIDTH / TERRAIN_COLS; // 53
export const TERRAIN_CELL_H = PLAYFIELD_HEIGHT / TERRAIN_ROWS; // 52

/** Rows kept flat-grass at the top & bottom so units never spawn on/under terrain. */
export const TERRAIN_SPAWN_ROW_MARGIN = 2;
/** Hill peak height (number of elevation tiers above flat ground). */
export const MAX_ELEVATION = 2;

// Random feature counts and blob sizes (in cells).
export const WATER_BLOBS_MIN = 1;
export const WATER_BLOBS_MAX = 2;
export const WATER_BLOB_CELLS_MIN = 6;
export const WATER_BLOB_CELLS_MAX = 12;
export const FOREST_BLOBS_MIN = 2;
export const FOREST_BLOBS_MAX = 4;
export const FOREST_BLOB_CELLS_MIN = 4;
export const FOREST_BLOB_CELLS_MAX = 10;
export const HILL_BLOBS_MIN = 2;
export const HILL_BLOBS_MAX = 3;
export const HILL_BLOB_CELLS_MIN = 5;
export const HILL_BLOB_CELLS_MAX = 14;
/** Cap on blocked (forest + water) coverage so a side can never be walled in. */
export const MAX_BLOCKED_FRACTION = 0.3;

// Hill movement: effective friction scales with the elevation slope along travel.
export const HILL_FRICTION_COEFF = 0.35; // per elevation step (uphill +, downhill -)
export const HILL_FRICTION_MIN = 0.4; // clamp — steep downhill never glides forever
export const HILL_FRICTION_MAX = 2.0; // clamp — steep uphill never freezes mid-slide
export const HILL_SLOPE_LOOKAHEAD = TERRAIN_CELL_W; // px ahead to sample the slope

/** High ground deals +20% and takes −20% damage vs a lower-elevation opponent. */
export const ELEVATION_DAMAGE_BONUS = 0.2;

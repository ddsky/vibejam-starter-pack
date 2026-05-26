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

export const ARROW_MIN_SPEED = 380;
export const ARROW_MAX_SPEED = 1300;
export const ARROW_FRICTION = 360;
export const ARROW_REST_SPEED = 50;
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

// src/constants/pageLayout.js
export const PAGE_W = 800;
export const PAGE_H = 1100;
export const MARGIN_X = 64;          // left/right content margin
export const TITLE_Y = 36;
export const TITLE_RULE_Y = 84;
export const DATE_Y = 96;
export const GRID_TOP = 132;
export const LINE = 40;
export const GRID_BOTTOM = 1040;     // last line above the page number
export const BODY_SIZE = 26;
export const LINE_COUNT = Math.floor((GRID_BOTTOM - GRID_TOP) / LINE);  // ~22 lines
export const BASELINE_NUDGE = 8;
export const LINE_SPACING = LINE;    // compatibility alias

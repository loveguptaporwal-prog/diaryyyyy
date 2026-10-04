// src/utils/placement.js (page units, page = 800 x 1100)
import { PAGE_W, PAGE_H, MARGIN_X, GRID_TOP, GRID_BOTTOM, LINE } from '../constants/pageLayout.js';

export const AREA = { left: MARGIN_X, right: PAGE_W - MARGIN_X, top: GRID_TOP, bottom: GRID_BOTTOM };

const hit = (a, b, pad = 12) => {
  const bx = b.x ?? MARGIN_X;
  const by = b.y ?? (b.top || GRID_TOP);
  const bw = b.w ?? b.width ?? 300;
  const bh = b.h ?? b.height ?? 230;

  return (
    a.x < bx + bw + pad &&
    a.x + a.w + pad > bx &&
    a.y < by + bh + pad &&
    a.y + a.h + pad > by
  );
};

export function findFreeSpot(blocks = [], w, h, prefer = 'right') {
  const right = AREA.right - w;
  const left = AREA.left;
  const center = Math.round((AREA.left + AREA.right - w) / 2);
  const preferredXs = prefer === 'right' ? [right, left, center] : [left, right, center];

  // 1. Try preferred standard column positions
  for (let y = AREA.top; y + h <= AREA.bottom; y += LINE) {
    for (const x of preferredXs) {
      const r = { x, y, w, h };
      if (!blocks.some((b) => !b.mainText && hit(r, b))) {
        return r;
      }
    }
  }

  // 2. Scan across the full writable width in 40px steps to find any open gap
  for (let y = AREA.top; y + h <= AREA.bottom; y += LINE * 2) {
    for (let x = AREA.left; x + w <= AREA.right; x += 40) {
      const r = { x, y, w, h };
      if (!blocks.some((b) => !b.mainText && hit(r, b))) {
        return r;
      }
    }
  }

  return null;
}

export function clampToPage(b) {
  const w = b.w ?? b.width ?? 300;
  const h = b.h ?? b.height ?? 230;
  return {
    ...b,
    x: Math.min(Math.max(b.x, AREA.left), AREA.right - w),
    y: Math.min(Math.max(b.y, AREA.top), AREA.bottom - h),
  };
}

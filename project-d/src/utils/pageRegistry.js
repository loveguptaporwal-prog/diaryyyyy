// src/utils/pageRegistry.js
export const pageEls = new Map(); // pageId -> HTMLElement

export function registerPageEl(id, el) {
  if (el) {
    pageEls.set(id, el);
  } else {
    pageEls.delete(id);
  }
}

export function pageAtPoint(clientX, clientY) {
  // 1. Direct bounding rect hit
  for (const [id, el] of pageEls.entries()) {
    if (!el || !document.body.contains(el)) continue;
    const rect = el.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return { id, el };
    }
  }

  // 2. Proximity check for gutter and margins between pages
  let closest = null;
  let minDistance = Infinity;
  for (const [id, el] of pageEls.entries()) {
    if (!el || !document.body.contains(el)) continue;
    const rect = el.getBoundingClientRect();
    const dx = Math.max(0, rect.left - clientX, clientX - rect.right);
    const dy = Math.max(0, rect.top - clientY, clientY - rect.bottom);
    const dist = Math.hypot(dx, dy);
    if (dist < minDistance && dist < 200) {
      minDistance = dist;
      closest = { id, el };
    }
  }

  return closest;
}

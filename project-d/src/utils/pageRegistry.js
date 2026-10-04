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
  return null;
}

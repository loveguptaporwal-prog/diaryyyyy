// src/utils/cursorTools.js
import { useUI } from '../store/uiStore.js';
import { findFreeSpot } from './placement.js';

export function showCaretPulse(clientX, clientY) {
  const el = document.createElement('div');
  el.className = 'caret-pulse';
  el.style.left = `${clientX}px`;
  el.style.top = `${clientY}px`;
  document.body.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 2000);
}

export function pulseAtElement(domEl) {
  if (!domEl) return;
  const rect = domEl.getBoundingClientRect();
  const x = rect.left + 24;
  const y = rect.top + Math.min(28, rect.height / 2);
  showCaretPulse(x, y);
}

export async function locateCursor({ pages = [], activeIndex = 0, onTurnPage, onAddBlock, onSelectBlock }) {
  let ui = useUI.getState();

  const spreadLeft = Math.floor(activeIndex / 2) * 2;
  const leftPage = pages[spreadLeft];
  const rightPage = pages[spreadLeft + 1];
  const currentSpreadIds = [leftPage?.id, rightPage?.id].filter(Boolean);
  const lastPageId = ui.activeEditorPageId;

  if (lastPageId && ui.lastSelection) {
    if (!currentSpreadIds.includes(lastPageId)) {
      const targetIndex = pages.findIndex((p) => p.id === lastPageId);
      if (targetIndex >= 0 && onTurnPage) {
        onTurnPage(targetIndex);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        ui = useUI.getState();
      }
    }

    if (ui.activeEditorPageId === lastPageId && ui.activeEditor) {
      ui.activeEditor.commands.focus();
      pulseAtElement(ui.activeEditor.view.dom);
      return;
    }
  }

  // Fallback: start writing on active page
  const activePage = leftPage || rightPage || pages[0];
  if (!activePage) return;

  const textBlocks = (activePage.blocks || []).filter((b) => b.type === 'text');
  if (textBlocks.length > 0) {
    const lastBlock = textBlocks[textBlocks.length - 1];
    if (onSelectBlock) onSelectBlock(lastBlock.id);
    if (ui.activeEditorPageId === activePage.id && ui.activeEditor) {
      ui.activeEditor.commands.focus('end');
      pulseAtElement(ui.activeEditor.view.dom);
      return;
    }
    setTimeout(() => {
      const editor = useUI.getState().activeEditor;
      if (useUI.getState().activeEditorPageId === activePage.id && editor) {
        editor.commands.focus('end');
        pulseAtElement(editor.view.dom);
      }
    }, 100);
    return;
  }

  // Create a new text block at a free ruled spot
  const spot = findFreeSpot(activePage.blocks || [], 604, 60) || { x: 84, y: 260 };
  const newBlockId = crypto.randomUUID();
  if (onAddBlock) {
    onAddBlock(activePage.id, {
      id: newBlockId,
      type: 'text',
      x: spot.x,
      y: spot.y,
      width: 604,
      height: 110,
      text: '',
      fontSize: 24,
      style: 'body',
    });
    if (onSelectBlock) onSelectBlock(newBlockId);
    setTimeout(() => {
      const editor = useUI.getState().activeEditor;
      if (useUI.getState().activeEditorPageId === activePage.id && editor) {
        editor.commands.focus('end');
        pulseAtElement(editor.view.dom);
      }
    }, 100);
  }
}

import React from 'react';
import { useOverlay } from '../store/overlayStore.js';
import { PAGE_W, PAGE_H } from '../constants/page.js';
import PageLayer from './PageLayer.jsx';

export default function DiaryOverlay({
  opened,
  pages = [],
  activeIndex = 0,
  mode,
  readOnly = false,
  onBlockChange,
  onBlockDelete,
  onPageUpdate,
  onReplaceMedia,
  onMoveBlockToPage,
  spellCheck = false,
  inkColor,
  onContinueToNextPage,
}) {
  const rects = useOverlay((s) => s.rects);
  if (!opened) return null;

  const maxLeftIndex = Math.max(0, Math.floor((pages.length - 1) / 2) * 2);
  const leftIndex = Math.min(Math.floor(activeIndex / 2) * 2, maxLeftIndex);
  const leftPage = pages[leftIndex];
  const rightPage = pages[leftIndex + 1];

  return (
    <div
      className="diary-overlay-container"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {leftPage && leftPage.kind === 'memory' && rects.left && (
        <div
          key={leftPage.id}
          style={{
            position: 'absolute',
            left: rects.left.left,
            top: rects.left.top,
            width: PAGE_W,
            height: PAGE_H,
            transform: `scale(${rects.left.width / PAGE_W})`,
            transformOrigin: '0 0',
            '--page-scale-inverse': PAGE_W / rects.left.width,
            pointerEvents: 'auto',
          }}
        >
          <PageLayer
            page={leftPage}
            oppositePage={rightPage}
            side="left"
            mode={mode}
            readOnly={readOnly}
            pages={pages}
            onBlockChange={onBlockChange}
            onBlockDelete={onBlockDelete}
            onPageUpdate={onPageUpdate}
            onReplaceMedia={onReplaceMedia}
            onMoveBlockToPage={onMoveBlockToPage}
            spellCheck={spellCheck}
            inkColor={inkColor}
            onContinueToNextPage={onContinueToNextPage}
          />
        </div>
      )}

      {rightPage && rightPage.kind === 'memory' && rects.right && (
        <div
          key={rightPage.id}
          style={{
            position: 'absolute',
            left: rects.right.left,
            top: rects.right.top,
            width: PAGE_W,
            height: PAGE_H,
            transform: `scale(${rects.right.width / PAGE_W})`,
            transformOrigin: '0 0',
            '--page-scale-inverse': PAGE_W / rects.right.width,
            pointerEvents: 'auto',
          }}
        >
          <PageLayer
            page={rightPage}
            oppositePage={leftPage}
            side="right"
            mode={mode}
            readOnly={readOnly}
            pages={pages}
            onBlockChange={onBlockChange}
            onBlockDelete={onBlockDelete}
            onPageUpdate={onPageUpdate}
            onReplaceMedia={onReplaceMedia}
            onMoveBlockToPage={onMoveBlockToPage}
            spellCheck={spellCheck}
            inkColor={inkColor}
            onContinueToNextPage={onContinueToNextPage}
          />
        </div>
      )}
    </div>
  );
}

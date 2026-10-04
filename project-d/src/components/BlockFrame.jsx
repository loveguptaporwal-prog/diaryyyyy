import React, { useState, useRef } from 'react';
import { useUI } from '../store/uiStore.js';
import { clampToPage } from '../utils/placement.js';
import { pageAtPoint } from '../utils/pageRegistry.js';
import { PAGE_W } from '../constants/page.js';

export default function BlockFrame({
  block,
  pageId,
  isWriteMode,
  selected,
  onSelect,
  onBlockChange,
  onMoveToPage,
  onBringToFront,
  children,
  keepRatio = true,
}) {
  const elRef = useRef(null);
  const [live, setLive] = useState(null); // { x, y, w, h, rotation }
  const g = useRef(null);

  const frame = live || {
    x: block.x ?? 84,
    y: block.y ?? 260,
    w: block.w ?? block.width ?? 300,
    h: block.h ?? block.height ?? 230,
    rotation: block.rotation ?? 0,
  };

  function begin(e, mode) {
    if (mode === 'move' && e.target.closest('[data-no-drag]')) return;
    if (!isWriteMode || e.button !== 0) return;

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const pagePlane = elRef.current?.closest('.paper-overlay-plane');
    const planeRect = pagePlane?.getBoundingClientRect();
    const scale = planeRect ? planeRect.width / PAGE_W : 1;

    const rect = elRef.current.getBoundingClientRect();
    const currentW = block.w ?? block.width ?? 300;
    const currentH = block.h ?? block.height ?? 230;

    g.current = {
      mode,
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      scale,
      b: {
        x: block.x ?? 84,
        y: block.y ?? 260,
        w: currentW,
        h: currentH,
        rotation: block.rotation ?? 0,
      },
      moved: false,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
      grabX: (e.clientX - rect.left) / scale,
      grabY: (e.clientY - rect.top) / scale,
    };

    onSelect(block.id);
    if (onBringToFront) onBringToFront(pageId, block.id);
  }

  function move(e) {
    const s = g.current;
    if (!s || s.pointerId !== e.pointerId) return;

    const dx = (e.clientX - s.sx) / s.scale;
    const dy = (e.clientY - s.sy) / s.scale;

    if (!s.moved && Math.hypot(dx, dy) < 3) return;
    s.moved = true;

    if (s.mode === 'move') {
      setLive({
        ...s.b,
        x: Math.round(s.b.x + dx),
        y: Math.round(s.b.y + dy),
      });
    } else if (s.mode === 'resize') {
      const nw = Math.min(Math.max(Math.round(s.b.w + dx), 90), 680);
      const nh = keepRatio
        ? Math.round(nw * (s.b.h / s.b.w))
        : Math.max(Math.round(s.b.h + dy), 60);
      setLive({
        ...s.b,
        w: nw,
        h: nh,
      });
    } else if (s.mode === 'rotate') {
      const deg = Math.atan2(e.clientY - s.cy, e.clientX - s.cx) * (180 / Math.PI) + 90;
      const clampedDeg = Math.round(Math.max(-15, Math.min(15, deg)));
      setLive({
        ...s.b,
        rotation: clampedDeg,
      });
    }
  }

  function end(e) {
    const s = g.current;
    if (!s || s.pointerId !== e.pointerId) return;
    g.current = null;

    if (!s.moved) {
      setLive(null);
      return;
    }

    let next = live ? { ...live } : { ...s.b };

    if (s.mode === 'move') {
      const target = pageAtPoint(e.clientX, e.clientY);
      if (target && target.id !== pageId && onMoveToPage) {
        const r = target.el.getBoundingClientRect();
        const targetScale = r.width / PAGE_W;
        next = {
          ...next,
          x: Math.round((e.clientX - r.left) / targetScale - s.grabX),
          y: Math.round((e.clientY - r.top) / targetScale - s.grabY),
        };
        const clamped = clampToPage(next);
        onMoveToPage(pageId, target.id, block.id, {
          ...clamped,
          width: clamped.w,
          height: clamped.h,
        });
        setLive(null);
        return;
      }
    }

    const clamped = clampToPage(next);
    onBlockChange(pageId, block.id, {
      ...clamped,
      width: clamped.w,
      height: clamped.h,
      data: { ...(block.data || {}), placement: 'free' },
    });
    setLive(null);
  }

  const isDragging = Boolean(live && g.current?.moved);

  return (
    <div
      ref={elRef}
      id={`block-${block.id}`}
      className={`block-frame interactive-block ${selected ? 'is-selected' : ''} ${isWriteMode ? 'is-write' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        position: 'absolute',
        left: frame.x,
        top: frame.y,
        width: frame.w,
        height: frame.h,
        transform: `rotate(${frame.rotation}deg)`,
        transformOrigin: 'center center',
        zIndex: isDragging ? 100 : (block.z || (selected ? 20 : 5)),
        touchAction: 'none',
        cursor: isWriteMode ? 'move' : 'default',
      }}
      onPointerDown={(e) => begin(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {children}

      {/* Resize & Rotate handles in Write mode when selected */}
      {selected && isWriteMode && (
        <>
          <span
            className="handle-rotate"
            title="Rotate (−15° to 15°)"
            onPointerDown={(e) => begin(e, 'rotate')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
          <span
            className="handle-resize"
            title="Resize"
            onPointerDown={(e) => begin(e, 'resize')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        </>
      )}
    </div>
  );
}

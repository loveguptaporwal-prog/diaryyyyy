import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import {
  Mic,
  CheckSquare,
  Square,
  Trash2,
  ArrowLeftRight,
} from 'lucide-react';
import { useUI } from '../store/uiStore.js';
import { registerPageEl } from '../utils/pageRegistry.js';
import { findFreeSpot, clampToPage } from '../utils/placement.js';
import BlockFrame from './BlockFrame.jsx';
import PhotoBlock from './PhotoBlock.jsx';
import VideoBlock from './VideoBlock.jsx';
import TextBlock from './TextBlock.jsx';
import {
  PAGE_W,
  PAGE_H,
  MARGIN_X,
  TITLE_Y,
  TITLE_RULE_Y,
  DATE_Y,
  GRID_TOP,
  LINE,
  GRID_BOTTOM,
  BODY_SIZE,
  LINE_COUNT,
  BASELINE_NUDGE,
} from '../constants/pageLayout.js';
import { theme } from '../theme/theme.js';
import { useMediaUrl } from '../hooks/useMediaUrl.js';

function formatDisplayDate(dateStr) {
  if (!dateStr) return 'Set date';
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

/**
 * AudioBlock Component
 */
export function AudioBlock({ block, isSelected, isWrite, onSelect, onDelete, onMoveToOtherPage }) {
  const mediaId = block.data?.mediaId || block.mediaId || block.audioAssetId;
  const directUrl = block.data?.src || block.audioSrc || block.url;
  const { url: mediaUrl } = useMediaUrl(mediaId, directUrl);
  const displayUrl = directUrl || mediaUrl;
  const width = block.w || block.width || 320;
  const height = block.h || block.height || 90;

  return (
    <>
      <div
        style={{
          width,
          height,
          padding: '10px 14px',
          background: '#fffcf7',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(35,20,15,0.18)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          boxSizing: 'border-box',
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(block.id);
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: "italic 14px 'Cormorant Garamond', Georgia, serif", color: '#55413c' }}>
          <Mic size={16} /> <span>{block.title || 'Audio memory'}</span>
        </div>
        {displayUrl ? (
          <audio controls src={displayUrl} style={{ width: '100%', height: 32 }} />
        ) : (
          <span style={{ fontSize: 12, color: '#998' }}>Audio recording</span>
        )}
      </div>

      {isWrite && isSelected && (
        <div data-no-drag className="media-mini-bar" onPointerDown={(e) => e.stopPropagation()}>
          {onMoveToOtherPage && (
            <button
              type="button"
              className="media-mini-btn"
              title="Move to opposite page"
              onClick={(e) => {
                e.stopPropagation();
                onMoveToOtherPage(block);
              }}
            >
              <ArrowLeftRight size={16} /> Move Page
            </button>
          )}
          <button
            type="button"
            className="media-mini-btn danger"
            title="Delete Audio"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(block.id);
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * ChecklistBlock Component
 */
export function ChecklistBlock({ block, isSelected, isWrite, readOnly = false, onSelect, onChange, onDelete, onMoveToOtherPage }) {
  const x = block.x ?? MARGIN_X;
  const y = block.y ?? GRID_TOP;
  const width = block.width || (PAGE_W - MARGIN_X * 2);
  const items = block.items || [];

  const toggleItem = (itemId) => {
    if (readOnly) return;
    const updated = items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));
    onChange(block.id, { items: updated });
  };

  const changeText = (itemId, text) => {
    const updated = items.map((item) => (item.id === itemId ? { ...item, text } : item));
    onChange(block.id, { items: updated });
  };

  const addItem = () => {
    const newItem = { id: crypto.randomUUID(), text: '', done: false };
    onChange(block.id, { items: [...items, newItem] });
  };

  return (
    <div
      className={`interactive-block ${isWrite ? 'is-write' : ''} ${isSelected ? 'is-selected' : ''}`}
      style={{
        width: '100%',
        padding: '2px 4px',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
    >
      {isWrite && isSelected && (
        <div data-no-drag className="media-mini-bar" onPointerDown={(e) => e.stopPropagation()}>
          {onMoveToOtherPage && (
            <button
              type="button"
              className="media-mini-btn"
              title="Move to opposite page"
              onClick={(e) => {
                e.stopPropagation();
                onMoveToOtherPage(block);
              }}
            >
              <ArrowLeftRight size={16} /> Move Page
            </button>
          )}
          <button
            type="button"
            className="media-mini-btn danger"
            title="Delete Checklist"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(block.id);
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: LINE,
            font: "18px 'Cormorant Garamond', Georgia, serif",
            color: 'var(--ink)',
          }}
        >
          <span
            data-no-drag
            style={{ cursor: readOnly ? 'default' : 'pointer', display: 'flex', alignItems: 'center' }}
            onClick={(e) => {
              e.stopPropagation();
              toggleItem(item.id);
            }}
          >
            {item.done ? (
              <CheckSquare size={18} color="#8c2f39" strokeWidth={2} />
            ) : (
              <Square size={18} color="#755" strokeWidth={1.75} />
            )}
          </span>
          {isWrite ? (
            <input
              data-no-drag
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                font: "18px 'Cormorant Garamond', Georgia, serif",
                color: item.done ? 'var(--ink-soft)' : 'var(--ink)',
                textDecoration: item.done ? 'line-through' : 'none',
              }}
              value={item.text}
              placeholder="Checklist item..."
              onChange={(e) => changeText(item.id, e.target.value)}
            />
          ) : (
            <span
              style={{
                color: item.done ? 'var(--ink-soft)' : 'var(--ink)',
                textDecoration: item.done ? 'line-through' : 'none',
              }}
            >
              {item.text || 'Item'}
            </span>
          )}
        </div>
      ))}
      {isWrite && (
        <button
          data-no-drag
          style={{
            marginTop: 4,
            padding: '2px 8px',
            border: '1px dashed rgba(160,113,121,0.5)',
            borderRadius: 4,
            background: 'transparent',
            color: '#8c2f39',
            font: "italic 13px 'Cormorant Garamond', Georgia, serif",
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            addItem();
          }}
        >
          + Add item
        </button>
      )}
    </div>
  );
}

/**
 * Main PageLayer Component
 */
export default function PageLayer({
  page,
  oppositePage,
  side,
  mode,
  readOnly = false,
  pages = [],
  onBlockChange,
  onBlockDelete,
  onPageUpdate,
  onReplaceMedia,
  onMoveBlockToPage,
  spellCheck = false,
  inkColor = theme.ink,
  onContinueToNextPage,
}) {
  const { selectedBlockId, setSelectedBlock, showToast } = useUI();
  const containerRef = useRef(null);
  const dateInputRef = useRef(null);
  const isWrite = mode === 'write';

  // Register this page element in page registry for cross-page drop detection
  useEffect(() => {
    if (page?.id && containerRef.current) {
      registerPageEl(page.id, containerRef.current);
    }
    return () => {
      if (page?.id) registerPageEl(page.id, null);
    };
  }, [page?.id]);

  // Keyboard navigation / block deletion
  useEffect(() => {
    if (!isWrite) return;

    const handleKeyDown = (e) => {
      // Don't intercept when user is typing in input, textarea, or contenteditable
      if (e.target.closest('input, textarea, [contenteditable="true"], .ProseMirror')) {
        return;
      }

      if (selectedBlockId) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onBlockDelete(page.id, selectedBlockId);
          setSelectedBlock(null);
        } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const step = e.shiftKey ? LINE : 4;
          const block = (page.blocks || []).find((b) => b.id === selectedBlockId);
          if (!block) return;
          const curX = block.x ?? MARGIN_X;
          const curY = block.y ?? GRID_TOP;
          let nx = curX;
          let ny = curY;
          if (e.key === 'ArrowUp') ny -= step;
          if (e.key === 'ArrowDown') ny += step;
          if (e.key === 'ArrowLeft') nx -= step;
          if (e.key === 'ArrowRight') nx += step;

          const clamped = clampToPage({
            ...block,
            x: nx,
            y: ny,
          });
          onBlockChange(page.id, selectedBlockId, clamped);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWrite, selectedBlockId, page?.id, page?.blocks, onBlockDelete, onBlockChange, setSelectedBlock]);

  // Bring block to front
  const handleBringToFront = (pageId, blockId) => {
    const blocks = page.blocks || [];
    const maxZ = Math.max(1, ...blocks.map((b) => b.z || 1));
    onBlockChange(pageId, blockId, { z: maxZ + 1 });
  };

  // Move block to opposite spread page (LEFT <-> RIGHT)
  const handleMoveToOtherPage = (block) => {
    // 1. Resolve opposite page on the current physical two-page spread
    let otherPage = oppositePage;

    if (!otherPage || otherPage.id === page.id) {
      const currentIdx = pages.findIndex((p) => p.id === page.id);
      if (currentIdx !== -1) {
        const oppositeIdx = side === 'left' ? currentIdx + 1 : currentIdx - 1;
        if (oppositeIdx >= 0 && oppositeIdx < pages.length) {
          otherPage = pages[oppositeIdx];
        }
      }
    }

    // Fallback if not found by index
    if (!otherPage || otherPage.kind !== 'memory') {
      otherPage = pages.find((p) => p.id !== page.id && p.kind === 'memory');
    }

    if (!otherPage) {
      showToast('No opposite page available');
      return;
    }

    const bw = block.w || block.width || 300;
    const bh = block.h || block.height || 230;
    const targetX = block.x ?? MARGIN_X;
    const targetY = block.y ?? (block.top || GRID_TOP);

    // Keep page-local position, clamped to writable destination page area
    const clamped = clampToPage({
      ...block,
      x: targetX,
      y: targetY,
      w: bw,
      h: bh,
      width: bw,
      height: bh,
    });

    // If moving a mainText block to a page that already has one, convert to a movable text block
    const destinationHasMainText = (otherPage.blocks || []).some(
      (b) => b.mainText && b.id !== block.id
    );

    const finalBlock = {
      ...block,
      x: clamped.x,
      y: clamped.y,
      w: bw,
      h: bh,
      width: bw,
      height: bh,
      ...(block.mainText && destinationHasMainText ? { mainText: false } : {}),
    };

    if (onMoveBlockToPage) {
      onMoveBlockToPage(page.id, otherPage.id, block.id, finalBlock);
      const destPageNum = pages.findIndex((p) => p.id === otherPage.id) + 1;
      showToast(destPageNum > 0 ? `Moved to page ${String(destPageNum).padStart(2, '0')}` : 'Moved to page');
    }
  };

  // Quick Placement handler
  const handlePlacement = (block, mode) => {
    const el = document.getElementById(`block-${block.id}`);
    const blocks = page.blocks || [];

    if (mode === 'left') {
      const targetX = MARGIN_X;
      const targetW = 310;
      const targetH = Math.round(targetW / ((block.width || 300) / (block.height || 230)));
      const targetY = block.y || GRID_TOP;

      if (el) {
        gsap.to(el, {
          left: targetX,
          top: targetY,
          width: targetW,
          height: targetH,
          duration: 0.35,
          ease: 'power2.out',
          onComplete: () => {
            const updated = blocks.map((b) => {
              if (b.id === block.id) {
                return { ...b, x: targetX, y: targetY, width: targetW, height: targetH, data: { ...b.data, placement: 'left' } };
              }
              if (b.type === 'text') {
                const bY = b.y || b.top || GRID_TOP;
                const bH = b.height || 120;
                if (bY < targetY + targetH && bY + bH > targetY) {
                  return { ...b, x: 394, width: 310 };
                }
              }
              return b;
            });
            onPageUpdate(page.id, { blocks: updated });
          },
        });
      }
    } else if (mode === 'right') {
      const targetX = 394;
      const targetW = 310;
      const targetH = Math.round(targetW / ((block.width || 300) / (block.height || 230)));
      const targetY = block.y || GRID_TOP;

      if (el) {
        gsap.to(el, {
          left: targetX,
          top: targetY,
          width: targetW,
          height: targetH,
          duration: 0.35,
          ease: 'power2.out',
          onComplete: () => {
            const updated = blocks.map((b) => {
              if (b.id === block.id) {
                return { ...b, x: targetX, y: targetY, width: targetW, height: targetH, data: { ...b.data, placement: 'right' } };
              }
              if (b.type === 'text') {
                const bY = b.y || b.top || GRID_TOP;
                const bH = b.height || 120;
                if (bY < targetY + targetH && bY + bH > targetY) {
                  return { ...b, x: MARGIN_X, width: 310 };
                }
              }
              return b;
            });
            onPageUpdate(page.id, { blocks: updated });
          },
        });
      }
    } else if (mode === 'top') {
      const targetX = MARGIN_X;
      const targetW = 640;
      const targetH = 280;
      const targetY = GRID_TOP;

      if (el) {
        gsap.to(el, {
          left: targetX,
          top: targetY,
          width: targetW,
          height: targetH,
          duration: 0.35,
          ease: 'power2.out',
          onComplete: () => {
            const updated = blocks.map((b) => {
              if (b.id === block.id) {
                return { ...b, x: targetX, y: targetY, width: targetW, height: targetH, data: { ...b.data, placement: 'top' } };
              }
              if (b.type === 'text') {
                const bY = b.y || b.top || GRID_TOP;
                if (bY < targetY + targetH + LINE) {
                  return { ...b, y: targetY + targetH + LINE, top: targetY + targetH + LINE, x: MARGIN_X, width: 640 };
                }
              }
              return b;
            });
            onPageUpdate(page.id, { blocks: updated });
          },
        });
      }
    } else {
      onBlockChange(page.id, block.id, { data: { ...block.data, placement: 'free' } });
    }
  };

  if (!page) return null;

  return (
    <div
      ref={containerRef}
      id={`page-layer-${page.id}`}
      className="paper-overlay-plane page-layer"
      style={{
        pointerEvents: 'auto',
        position: 'relative',
        width: PAGE_W,
        height: PAGE_H,
        '--ink': inkColor,
        '--ink-soft': theme.inkSoft,
        '--rule': theme.rule,
        '--print-paper': theme.printPaper,
        '--print-edge': theme.printEdge,
        '--accent': theme.accent,
        '--line': `${LINE}px`,
        '--body-size': `${BODY_SIZE}px`,
        '--grid-top': `${GRID_TOP}px`,
        '--grid-height': `${LINE_COUNT * LINE}px`,
        '--baseline-nudge': `${BASELINE_NUDGE}px`,
        '--font-body': theme.fontBody,
        '--font-hand': theme.fontHand,
      }}
    >
      <svg
        className="ruled-lines"
        width={PAGE_W}
        height={PAGE_H}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {Array.from({ length: LINE_COUNT }, (_, index) => GRID_TOP + (index + 1) * LINE).map((y) => (
          <line
            key={y}
            x1={MARGIN_X}
            x2={PAGE_W - MARGIN_X}
            y1={y}
            y2={y}
            stroke="var(--rule)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            shapeRendering="crispEdges"
          />
        ))}
        <line
          x1={MARGIN_X - 14}
          x2={MARGIN_X - 14}
          y1={GRID_TOP}
          y2={GRID_BOTTOM}
          stroke="rgba(181, 86, 106, 0.35)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Inline editable header for Title */}
      <div
        className="page-header-layer"
        style={{ top: TITLE_Y }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isWrite ? (
          <input
            className="page-title-input"
            value={page.title || ''}
            placeholder="Untitled"
            spellCheck={spellCheck}
            onChange={(e) => onPageUpdate(page.id, { title: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          page.title ? <div className="page-title-display">{page.title}</div> : null
        )}
      </div>
      <div
        className="page-title-rule"
        style={{ top: TITLE_RULE_Y, left: MARGIN_X, right: MARGIN_X }}
        aria-hidden="true"
      />

      {/* Date displayed as text, e.g. "3 October 2026", clicking it opens native picker */}
      <div
        className="page-date-wrapper"
        style={{ top: DATE_Y }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (isWrite && dateInputRef.current) {
            try {
              dateInputRef.current.showPicker?.() || dateInputRef.current.focus();
            } catch {
              dateInputRef.current.focus();
            }
          }
        }}
      >
        <span className="page-date-text">
          {formatDisplayDate(page.date)}
        </span>
        {isWrite && (
          <input
            ref={dateInputRef}
            type="date"
            className="page-date-input"
            value={page.date || ''}
            spellCheck={spellCheck}
            onChange={(e) => onPageUpdate(page.id, { date: e.target.value })}
          />
        )}
      </div>

      {(page.blocks || []).map((block) => {
        const isSelected = selectedBlockId === block.id;

        switch (block.type) {
          case 'text':
            return (
              <TextBlock
                key={block.id}
                block={block}
                pageId={page.id}
                isSelected={isSelected}
                isWrite={isWrite}
                spellCheck={spellCheck}
                onContinueToNextPage={onContinueToNextPage}
                onSelect={setSelectedBlock}
                onChange={(id, changes) => onBlockChange(page.id, id, changes)}
                onDelete={(id) => onBlockDelete(page.id, id)}
                onMoveToOtherPage={handleMoveToOtherPage}
              />
            );

          case 'photo':
            return (
              <BlockFrame
                key={block.id}
                block={block}
                pageId={page.id}
                isWriteMode={isWrite}
                selected={isSelected}
                onSelect={setSelectedBlock}
                onBlockChange={onBlockChange}
                onMoveToPage={onMoveBlockToPage}
                onBringToFront={handleBringToFront}
              >
                <PhotoBlock
                  block={block}
                  isSelected={isSelected}
                  isWrite={isWrite}
                  readOnly={readOnly}
                  onSelect={setSelectedBlock}
                  onChange={(id, changes) => onBlockChange(page.id, id, changes)}
                  onDelete={(id) => onBlockDelete(page.id, id)}
                  onPlacement={handlePlacement}
                  onReplace={onReplaceMedia}
                  onMoveToOtherPage={handleMoveToOtherPage}
                />
              </BlockFrame>
            );

          case 'video':
            return (
              <BlockFrame
                key={block.id}
                block={block}
                pageId={page.id}
                isWriteMode={isWrite}
                selected={isSelected}
                onSelect={setSelectedBlock}
                onBlockChange={onBlockChange}
                onMoveToPage={onMoveBlockToPage}
                onBringToFront={handleBringToFront}
              >
                <VideoBlock
                  block={block}
                  isSelected={isSelected}
                  isWrite={isWrite}
                  onSelect={setSelectedBlock}
                  onChange={(id, changes) => onBlockChange(page.id, id, changes)}
                  onDelete={(id) => onBlockDelete(page.id, id)}
                  onPlacement={handlePlacement}
                  onReplace={onReplaceMedia}
                  onMoveToOtherPage={handleMoveToOtherPage}
                />
              </BlockFrame>
            );

          case 'audio':
            return (
              <BlockFrame
                key={block.id}
                block={block}
                pageId={page.id}
                isWriteMode={isWrite}
                selected={isSelected}
                onSelect={setSelectedBlock}
                onBlockChange={onBlockChange}
                onMoveToPage={onMoveBlockToPage}
                onBringToFront={handleBringToFront}
              >
                <AudioBlock
                  block={block}
                  isSelected={isSelected}
                  isWrite={isWrite}
                  onSelect={setSelectedBlock}
                  onDelete={(id) => onBlockDelete(page.id, id)}
                  onMoveToOtherPage={handleMoveToOtherPage}
                />
              </BlockFrame>
            );

          case 'checklist':
            return (
              <BlockFrame
                key={block.id}
                block={block}
                pageId={page.id}
                isWriteMode={isWrite}
                selected={isSelected}
                onSelect={setSelectedBlock}
                onBlockChange={onBlockChange}
                onMoveToPage={onMoveBlockToPage}
                onBringToFront={handleBringToFront}
                keepRatio={false}
              >
                <ChecklistBlock
                  block={block}
                  isSelected={isSelected}
                  isWrite={isWrite}
                  readOnly={readOnly}
                  onSelect={setSelectedBlock}
                  onChange={(id, changes) => onBlockChange(page.id, id, changes)}
                  onDelete={(id) => onBlockDelete(page.id, id)}
                  onMoveToOtherPage={handleMoveToOtherPage}
                />
              </BlockFrame>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

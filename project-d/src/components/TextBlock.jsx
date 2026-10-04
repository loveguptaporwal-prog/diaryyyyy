import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { GripVertical, ArrowLeftRight, Trash2 } from 'lucide-react';
import { useUI } from '../store/uiStore.js';
import { pageAtPoint } from '../utils/pageRegistry.js';
import { GRID_TOP, LINE, LINE_COUNT, BASELINE_NUDGE, BODY_SIZE, PAGE_W, MARGIN_X } from '../constants/pageLayout.js';
import { ParagraphSize, SIZES } from '../editor/ParagraphSize.js';

// Extend Highlight so it writes the color into CSS variable --hl
const MarkerHighlight = Highlight.extend({
  renderHTML({ HTMLAttributes }) {
    const color = HTMLAttributes['data-color'] || HTMLAttributes.color || '#fbe3a6';
    return ['mark', { ...HTMLAttributes, style: `--hl:${color}` }, 0];
  },
}).configure({ multicolor: true });

export default function TextBlock({
  block,
  pageId,
  isSelected,
  isWrite,
  spellCheck = false,
  onContinueToNextPage,
  onSelect,
  onChange,
  onDelete,
  onMoveToOtherPage,
}) {
  const [isFocused, setIsFocused] = useState(false);

  const legacyFontSize = Number(block.fontSize) || BODY_SIZE;
  const legacySize = legacyFontSize === 19 || legacyFontSize === 24
    ? 'normal'
    : SIZES.reduce((closest, size) =>
      Math.abs(size.px - legacyFontSize) < Math.abs(closest.px - legacyFontSize) ? size : closest,
    SIZES[0]).id;
  const content = block.html || (block.text ? block.text.split('\n').map((p) => `<p>${p || ''}</p>`).join('') : '<p></p>');
  const initialContent = content.replace(
    /<(p|h[23])\b(?![^>]*\bdata-size\s*=)([^>]*)>/gi,
    (_, tag, attributes) => `<${tag}${attributes} data-size="${legacySize}">`,
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        history: true,
        underline: false,
      }),
      TextStyle,
      Color,
      MarkerHighlight,
      Underline,
      ParagraphSize,
      Placeholder.configure({
        placeholder: 'Write here...',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    editorProps: {
      attributes: { spellcheck: String(spellCheck) },
    },
    content: initialContent,
    editable: isWrite,
    onUpdate({ editor: ed }) {
      onChange(block.id, {
        html: ed.getHTML(),
        text: ed.getText(),
      });
    },
    onSelectionUpdate({ editor: ed }) {
      useUI.getState().setActiveEditor(ed, pageId);
      useUI.getState().setLastSelection({
        from: ed.state.selection.from,
        to: ed.state.selection.to,
      });
    },
    onFocus({ editor: ed }) {
      setIsFocused(true);
      onSelect(block.id);
      useUI.getState().setActiveEditor(ed, pageId);
      useUI.getState().setLastSelection({
        from: ed.state.selection.from,
        to: ed.state.selection.to,
      });
    },
    onBlur({ editor: ed, event }) {
      setIsFocused(false);
      // If blurring because user clicked inside toolbar or popovers, do not delete or reset
      if (event?.relatedTarget?.closest?.('.format-bar, .format-bar-wrap, .fmt-popover, .fmt-color-palette, .fmt-color-wrap')) {
        return;
      }
      // When an empty text block loses focus, delete it automatically
      const text = ed.getText().trim();
      if (!text && !block.mainText) {
        onDelete(block.id);
      }
    },
  }, [block.id]);

  useEffect(() => {
    if (editor) {
      editor.setOptions({ editorProps: { attributes: { spellcheck: String(spellCheck) } } });
    }
  }, [spellCheck, editor]);

  // Keep editable state synced with write mode
  useEffect(() => {
    if (editor) {
      editor.setEditable(isWrite);
    }
  }, [isWrite, editor]);

  // Focus when selected in write mode
  useEffect(() => {
    if (isSelected && isWrite && editor && !editor.isFocused) {
      editor.commands.focus('end');
      setIsFocused(true);
    }
  }, [isSelected, isWrite, editor]);

  // Handle drag via top-left grip handle
  const handleGripPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startX = e.clientX;
    const origY = block.y ?? (block.top || GRID_TOP);
    const origX = block.x ?? MARGIN_X;

    const onPointerMove = (me) => {
      const dy = me.clientY - startY;
      const dx = me.clientX - startX;
      const rawY = origY + dy;
      const rawX = origX + dx;
      const snappedY = GRID_TOP + Math.max(0, Math.round((rawY - GRID_TOP) / LINE)) * LINE;
      onChange(block.id, {
        x: Math.max(MARGIN_X, Math.min(PAGE_W - 200, rawX)),
        y: snappedY,
        top: snappedY,
      });
    };

    const onPointerUp = (ue) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      const target = pageAtPoint(ue.clientX, ue.clientY);
      if (target && target.id !== pageId && onMoveToOtherPage) {
        onMoveToOtherPage(block);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const x = block.x ?? MARGIN_X;
  const y = block.y ?? (block.top || GRID_TOP);
  const width = block.width || (PAGE_W - MARGIN_X * 2);
  const fontFamily = block.fontFamily === 'handwritten' ? 'var(--font-hand)' : 'var(--font-body)';
  const mainLinesUsed = block.mainText && editor
    ? Math.max(1, Math.round(editor.view.dom.scrollHeight / LINE))
    : 0;

  return (
    <div
      id={`block-${block.id}`}
      className={`interactive-block text-block ${block.mainText ? 'main-text-block' : ''} ${isWrite ? 'is-write' : ''} ${isSelected ? 'is-selected' : ''} ${isFocused ? 'is-focused' : ''}`}
      style={{
        position: 'absolute',
        left: x,
        top: y + BASELINE_NUDGE,
        width,
        ...(block.mainText ? { height: LINE * LINE_COUNT } : {}),
        zIndex: block.mainText ? 1 : (isSelected ? 15 : 2),
        fontFamily,
        textAlign: block.align || 'left',
        color: block.color || 'var(--ink)',
      }}
      onClick={(e) => {
        onSelect(block.id);
        if (isWrite && editor && !editor.isFocused) {
          editor.commands.focus();
        }
        if (!block.mainText || !isWrite || !editor) {
          e.stopPropagation();
          return;
        }

        const pageScale = e.currentTarget.closest('.paper-overlay-plane')?.getBoundingClientRect().width / PAGE_W || 1;
        const localY = (e.clientY - e.currentTarget.getBoundingClientRect().top) / pageScale;
        const targetLine = Math.max(0, Math.floor((localY + BASELINE_NUDGE) / LINE));
        if (targetLine < mainLinesUsed) return;

        const missing = targetLine - mainLinesUsed;
        const paragraphsToInsert = missing + (
          mainLinesUsed === 1 && editor.isEmpty ? 2 : 1
        );
        editor.chain()
          .focus('end')
          .insertContent(Array.from({ length: paragraphsToInsert }, () => ({ type: 'paragraph' })))
          .focus('end')
          .run();
      }}
    >
      {isWrite && (isSelected || (!block.mainText && isFocused)) && (
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
          {!block.mainText && (
            <button
              type="button"
              className="media-mini-btn danger"
              title="Delete text block"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(block.id);
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}

      {isWrite && !block.mainText && (isSelected || isFocused) && (
        <div
          className="text-block-grip"
          title="Drag to move on ruled lines"
          onPointerDown={handleGripPointerDown}
        >
          <GripVertical size={13} />
        </div>
      )}
      <EditorContent editor={editor} />
      {block.mainText && isWrite && mainLinesUsed >= LINE_COUNT && (
        <button
          type="button"
          className="continue-writing-link"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onContinueToNextPage?.(pageId);
          }}
        >
          Continue on next page →
        </button>
      )}
    </div>
  );
}

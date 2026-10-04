import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserRound } from 'lucide-react';
import { PAGE_W, PAGE_H } from '../constants/page.js';
import { useMediaUrl } from '../hooks/useMediaUrl.js';
import { useOverlay } from '../store/overlayStore.js';
import { theme } from '../theme/theme.js';

const FRAME = { x: 216, y: 205, width: 336, height: 356 };

export default function ProfilePhotoLayer({ page, side, mode, opened, visible, inkColor = theme.ink, onUpload, onUpdate, onRemove }) {
  const isWrite = mode === 'write';
  const rect = useOverlay((state) => state.rects[side]);
  const photo = Object.prototype.hasOwnProperty.call(page.data || {}, 'profilePhoto')
    ? page.data.profilePhoto
    : page.fields?.photoAssetId
      ? { mediaId: page.fields.photoAssetId, src: page.fields.photoSrc, focusX: 50, focusY: 50, zoom: 1 }
      : page.fields?.photoSrc
        ? { src: page.fields.photoSrc, focusX: 50, focusY: 50, zoom: 1 }
      : null;
  const { url } = useMediaUrl(photo?.mediaId, photo?.src);
  const inputRef = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [adjusting, setAdjusting] = useState(false);
  const [draft, setDraft] = useState({
    focusX: photo?.focusX ?? 50,
    focusY: photo?.focusY ?? 50,
    zoom: photo?.zoom ?? 1,
  });

  useEffect(() => {
    if (!adjusting) return undefined;
    const finishAdjusting = (event) => {
      if (frameRef.current?.contains(event.target)) return;
      onUpdate(page.id, draft);
      setAdjusting(false);
    };
    document.addEventListener('pointerdown', finishAdjusting);
    return () => document.removeEventListener('pointerdown', finishAdjusting);
  }, [adjusting, draft, onUpdate, page.id]);

  if (!opened || !visible || !rect || (!isWrite && !photo)) return null;

  const pageScale = rect.width / PAGE_W;
  const position = {
    left: FRAME.x,
    top: FRAME.y,
    width: FRAME.width,
    height: FRAME.height,
  };

  const startPan = (event) => {
    if (!adjusting || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event) => {
    if (!dragRef.current || !adjusting) return;
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    const zoom = draft.zoom || 1;
    const dx = (event.clientX - dragRef.current.x) / pageScale / zoom;
    const dy = (event.clientY - dragRef.current.y) / pageScale / zoom;
    dragRef.current = { x: event.clientX, y: event.clientY };
    setDraft((current) => ({
      ...current,
      focusX: Math.max(0, Math.min(100, current.focusX - (dx / (bounds.width / pageScale)) * 100)),
      focusY: Math.max(0, Math.min(100, current.focusY - (dy / (bounds.height / pageScale)) * 100)),
    }));
  };

  const endPan = (event) => {
    if (!dragRef.current) return;
    event.stopPropagation();
    dragRef.current = null;
    onUpdate(page.id, draft);
  };

  const upload = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setDraft({ focusX: 50, focusY: 50, zoom: 1 });
      setAdjusting(false);
      onUpload(page.id, file);
    }
    event.target.value = '';
  };

  return createPortal(
    <div
      className="profile-photo-overlay"
      style={{
        position: 'fixed',
        left: rect.left,
        top: rect.top,
        width: PAGE_W,
        height: PAGE_H,
        transform: `scale(${pageScale})`,
        transformOrigin: '0 0',
        pointerEvents: 'none',
        zIndex: 11,
        '--ink': inkColor,
        '--ink-soft': theme.inkSoft,
        '--print-paper': theme.printPaper,
        '--print-edge': theme.printEdge,
      }}
    >
      <div className="paper-overlay-plane profile-photo-plane">
        <div
          ref={frameRef}
          className={`profile-photo-frame${isWrite ? ' is-write' : ''}${adjusting ? ' is-adjusting' : ''}`}
          style={position}
          onClick={(event) => {
            event.stopPropagation();
            if (isWrite && !photo) inputRef.current?.click();
            else if (isWrite && photo) setAdjusting(true);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            startPan(event);
          }}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
        >
          <div className="profile-photo-window">
            {photo && url ? (
              <img
                src={url}
                alt="Profile"
                draggable={false}
                style={{
                  objectPosition: `${adjusting ? draft.focusX : photo.focusX ?? 50}% ${adjusting ? draft.focusY : photo.focusY ?? 50}%`,
                  transform: `scale(${adjusting ? draft.zoom : photo.zoom ?? 1})`,
                }}
              />
            ) : isWrite && !photo ? (
              <div className="profile-photo-placeholder">
                <UserRound size={54} strokeWidth={1.2} />
              </div>
            ) : null}
          </div>
          {!photo && isWrite && (
            <span className="profile-photo-prompt">a place for your photograph</span>
          )}
          {isWrite && photo && !adjusting && (
            <div className="profile-photo-actions" data-no-drag>
                <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>Change photo</button>
                <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(page.id); }}>Remove</button>
            </div>
          )}
          {isWrite && adjusting && (
            <div className="profile-photo-adjust" data-no-drag onPointerDown={(event) => event.stopPropagation()}>
              <label>
                Zoom
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={draft.zoom}
                  onChange={(event) => {
                    const zoom = Number(event.target.value);
                    const next = { ...draft, zoom };
                    setDraft(next);
                    onUpdate(page.id, next);
                  }}
                />
              </label>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                Change photo
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdate(page.id, draft);
                  setAdjusting(false);
                }}
              >
                Done
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            className="profile-photo-file"
            type="file"
            accept="image/*"
            onChange={upload}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

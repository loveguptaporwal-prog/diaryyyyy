import React, { useState } from 'react';
import {
  PanelLeft,
  PanelRight,
  PanelTop,
  Move,
  Type,
  RefreshCw,
  Trash2,
  ArrowLeftRight,
  Sparkles,
} from 'lucide-react';
import { useMediaUrl } from '../hooks/useMediaUrl.js';

export default function PhotoBlock({
  block,
  isSelected,
  isWrite,
  onSelect,
  onChange,
  onDelete,
  onPlacement,
  onReplace,
  onMoveToOtherPage,
  onAutoFormat,
}) {
  const mediaId = block.data?.mediaId || block.mediaId || block.imageAssetId;
  const directUrl = block.data?.src || block.imageSrc || block.url;
  const { url: mediaUrl, error, loading } = useMediaUrl(mediaId, directUrl);
  const displayUrl = directUrl || mediaUrl;

  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState(block.caption || '');

  const placement = block.data?.placement || 'free';

  const handleCaptionBlur = () => {
    setEditingCaption(false);
    onChange(block.id, { caption: captionText });
  };

  return (
    <>
      <div className="block-tape" />

      <div className="block-photo-frame" style={{ width: '100%', height: '100%' }}>
        <div className="block-photo-img-wrap">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt={block.caption || 'Memory photograph'}
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div className="media-placeholder">
              {loading ? 'Loading photo...' : error ? 'Photo unavailable' : 'No photo'}
            </div>
          )}
        </div>

        {/* Caption */}
        {editingCaption && isWrite ? (
          <input
            data-no-drag
            autoFocus
            className="block-caption-input"
            value={captionText}
            placeholder="Write a caption..."
            onChange={(e) => setCaptionText(e.target.value)}
            onBlur={handleCaptionBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCaptionBlur();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            data-no-drag
            className="block-caption"
            title={block.caption || (isWrite ? 'Click to add caption' : '')}
            onClick={(e) => {
              if (isWrite) {
                e.stopPropagation();
                setEditingCaption(true);
              }
            }}
          >
            {block.caption || (isWrite && isSelected ? '✎ Add caption' : '')}
          </div>
        )}
      </div>

      {/* Write-Mode Floating Mini-Bar */}
      {isWrite && isSelected && (
        <div data-no-drag className="media-mini-bar" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={`media-mini-btn ${placement === 'left' ? 'active' : ''}`}
            title="Align Left Column"
            onClick={(e) => {
              e.stopPropagation();
              onPlacement && onPlacement(block, 'left');
            }}
          >
            <PanelLeft size={16} /> Left
          </button>
          <button
            type="button"
            className={`media-mini-btn ${placement === 'right' ? 'active' : ''}`}
            title="Align Right Column"
            onClick={(e) => {
              e.stopPropagation();
              onPlacement && onPlacement(block, 'right');
            }}
          >
            <PanelRight size={16} /> Right
          </button>
          <button
            type="button"
            className={`media-mini-btn ${placement === 'top' ? 'active' : ''}`}
            title="Span Top"
            onClick={(e) => {
              e.stopPropagation();
              onPlacement && onPlacement(block, 'top');
            }}
          >
            <PanelTop size={16} /> Top
          </button>
          <button
            type="button"
            className={`media-mini-btn ${placement === 'free' ? 'active' : ''}`}
            title="Free Placement"
            onClick={(e) => {
              e.stopPropagation();
              onPlacement && onPlacement(block, 'free');
            }}
          >
            <Move size={16} /> Free
          </button>

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

          <span className="media-mini-sep" />

          <button
            type="button"
            className="media-mini-btn"
            title="Edit Caption"
            onClick={(e) => {
              e.stopPropagation();
              setEditingCaption(true);
            }}
          >
            <Type size={16} />
          </button>

          <label className="media-mini-btn" title="Replace Photo" style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
            <RefreshCw size={16} />
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (onReplace) onReplace(e, block.id, 'photo');
                e.target.value = '';
              }}
            />
          </label>

          <button
            type="button"
            className="media-mini-btn danger"
            title="Delete Photo"
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

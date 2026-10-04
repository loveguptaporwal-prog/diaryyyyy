import React, { useState, useRef } from 'react';
import {
  PanelLeft,
  PanelRight,
  PanelTop,
  Move,
  Type,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  ArrowLeftRight,
  Sparkles,
} from 'lucide-react';
import { useMediaUrl } from '../hooks/useMediaUrl.js';

export default function VideoBlock({
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
  const mediaId = block.data?.mediaId || block.mediaId || block.assetId;
  const directUrl = block.data?.src || block.videoSrc || block.url;
  const { url: mediaUrl, error, loading } = useMediaUrl(mediaId, directUrl);
  const posterMediaId = block.data?.posterMediaId || block.posterMediaId;
  const posterDirectUrl = block.data?.posterSrc || block.posterSrc;
  const { url: posterMediaUrl } = useMediaUrl(posterMediaId, posterDirectUrl);
  const displayUrl = directUrl || mediaUrl;

  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState(block.caption || '');

  const placement = block.data?.placement || 'free';

  const toggle = (e) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play()
        .then(() => setPlaying(true))
        .catch(console.error);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const handleCaptionBlur = () => {
    setEditingCaption(false);
    onChange(block.id, { caption: captionText });
  };

  return (
    <>
      <div className="block-tape" />

      <div className="block-video-frame" style={{ width: '100%', height: '100%' }}>
        <div className="block-photo-img-wrap">
          {displayUrl ? (
            <>
              <video
                ref={videoRef}
                src={displayUrl}
                playsInline
                preload="metadata"
                loop
                poster={posterDirectUrl || posterMediaUrl}
                onLoadedMetadata={(e) => {
                  try {
                    if (e.target.currentTime === 0) e.target.currentTime = 0.1;
                  } catch {}
                }}
                onEnded={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <button
                data-no-drag
                className="video-play block-video-play-btn"
                title={playing ? 'Pause' : 'Play'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={toggle}
              >
                {playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
              </button>
            </>
          ) : (
            <div className="media-placeholder">
              {loading ? 'Loading video...' : error ? 'Video unavailable' : 'No video attached'}
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

          <label className="media-mini-btn" title="Replace Video" style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
            <RefreshCw size={16} />
            <input
              type="file"
              accept="video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (onReplace) onReplace(e, block.id, 'video');
                e.target.value = '';
              }}
            />
          </label>

          <button
            type="button"
            className="media-mini-btn danger"
            title="Delete Video"
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

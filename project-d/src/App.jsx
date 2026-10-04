import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { gsap } from "gsap";
import {
  BookOpen,
  PenLine,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
  Minus,
  Plus,
  Type,
  Image as ImageIcon,
  Video as VideoIcon,
  Mic,
  ListChecks,
  Highlighter,
  ChevronDown,
} from "lucide-react";
import deskPhotoUrl from "../image/Romantic Cherry Blossom Writing Desk.png";
import { deleteVideoAsset, deleteMediaAsset, loadDiary, makeMemoryPage, saveDiary, saveImageAsset, saveVideoAsset, saveMedia } from "./diaryModel";
import { releaseMediaUrl } from "./db/mediaUrls";
import { useUI } from "./store/uiStore";
import PageRectReporter from "./components/PageRectReporter";
import DiaryOverlay from "./components/DiaryOverlay";
import ProfilePhotoLayer from "./components/ProfilePhotoLayer";
import { findFreeSpot, clampToPage } from "./utils/placement";
import { locateCursor } from "./utils/cursorTools.js";
import {
  MARGIN_X,
  GRID_TOP,
  LINE,
  TITLE_RULE_Y,
  BODY_SIZE,
} from "./constants/pageLayout";
import { INK_PALETTE, HIGHLIGHT_PALETTE, INK_THEMES } from "./theme/theme";
import { SIZES } from "./editor/ParagraphSize";
import { emptyPublishedPages, exportDiary, loadPublishedDiary } from "./publishing/publishDiary.js";
import "./index.css";
import "./App.css";

const PAGE_W = 3.05;
const PAGE_H = 4.22;
const PAGE_DEPTH = 0.04;
const COVER_W = 3.34;
const COVER_H = 4.52;
const COVER_DEPTH = 0.04;
const GUTTER_W = 0.2;
const SPINE_W = 0.18;

const paper = new THREE.MeshStandardMaterial({
  color: "#fbf7ee",
  roughness: 0.97,
  side: THREE.DoubleSide,
});
const leather = new THREE.MeshStandardMaterial({
  color: "#17171b",
  roughness: 0.86,
  metalness: 0.04,
});

const gold = new THREE.MeshStandardMaterial({
  color: "#cfad86",
  roughness: 0.48,
  metalness: 0.38,
});


/* =========================================================
   PAGE GEOMETRY
   A heavily subdivided plane lets us physically bend it.
========================================================= */

function createPageGeometry(side) {
  const geometry = new THREE.BoxGeometry(PAGE_W, PAGE_H, PAGE_DEPTH, 48, 36, 1);
  const position = geometry.attributes.position;
  const offset = side === "right" ? PAGE_W / 2 : -PAGE_W / 2;
  geometry.translate(offset, 0, 0);

  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const u = THREE.MathUtils.clamp(
      (side === "right" ? x : -x) / PAGE_W,
      0,
      1
    );
    const outerLift = 0.038 * u * u;
    position.setZ(index, position.getZ(index) + outerLift);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createRoundedShape(width, height, radius) {
  const shape = new THREE.Shape();
  shape.moveTo(radius, -height / 2);
  shape.lineTo(width - radius, -height / 2);
  shape.quadraticCurveTo(width, -height / 2, width, -height / 2 + radius);
  shape.lineTo(width, height / 2 - radius);
  shape.quadraticCurveTo(width, height / 2, width - radius, height / 2);
  shape.lineTo(radius, height / 2);
  shape.quadraticCurveTo(0, height / 2, 0, height / 2 - radius);
  shape.lineTo(0, -height / 2 + radius);
  shape.quadraticCurveTo(0, -height / 2, radius, -height / 2);
  return shape;
}

function createCoverGeometry() {
  const shape = createRoundedShape(COVER_W, COVER_H, 0.09);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: COVER_DEPTH,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -COVER_DEPTH / 2);
  return geometry;
}

function createPanelGeometry(width, height, radius) {
  const geometry = new THREE.ShapeGeometry(createRoundedShape(width, height, radius), 6);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let index = 0; index < position.count; index++) {
    uv.setXY(
      index,
      position.getX(index) / width,
      (position.getY(index) + height / 2) / height
    );
  }
  uv.needsUpdate = true;
  return geometry;
}

function createPaperTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  // Warm cream paper base â€” no ruled lines here, they live in createDiaryPageTexture
  context.fillStyle = "#f7f0df";
  context.fillRect(0, 0, canvas.width, canvas.height);
  // Subtle paper grain noise
  for (let index = 0; index < 1200; index++) {
    const x = (index * 137) % canvas.width;
    const y = (index * 223) % canvas.height;
    context.fillStyle = index % 2 ? "rgba(102,75,57,0.028)" : "rgba(255,255,255,0.15)";
    context.fillRect(x, y, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const diaryTextureCache = new Map();
const videoTextureSources = new Map();
const profileFields = [
  ["name", "Name"], ["nickname", "Nickname"], ["birthday", "Birthday"], ["flower", "Favorite flower"],
  ["place", "Favorite place"], ["song", "Favorite song"], ["food", "Favorite food"],
  ["loves", "Things I love"], ["happy", "Things that make me happy"], ["other", "Other personal information"],
];

function drawRule(context, y, start = 82, end = 686) {
  context.strokeStyle = "rgba(145, 91, 104, 0.32)";
  context.lineWidth = 1.3;
  context.beginPath();
  context.moveTo(start, y);
  context.lineTo(end, y);
  context.stroke();
}

function drawTextAndRule(context, text, y) {
  context.fillStyle = "#514742";
  context.font = "italic 31px Georgia, serif";
  context.textAlign = "center";
  const lines = wrapPageText(text, 38).slice(0, 2);
  lines.forEach((line, index) => context.fillText(line, 384, y + index * 36));
  drawRule(context, y + Math.max(24, lines.length * 36 - 8), 160, 608);
}

function drawPageNumber(context, pageNumber, side, width, height) {
  context.fillStyle = "#947d70";
  context.font = "24px Georgia, serif";
  context.textAlign = side === "left" ? "left" : "right";
  context.fillText(String(pageNumber).padStart(2, "0"), side === "left" ? 70 : width - 70, height - 42);
}

function createDiaryPageTexture(page, pageNumber, side, pages) {
  const mediaVersion = [page.fields?.photoSrc || "", ...(page.blocks || []).filter(block => block.type === "video" || block.type === "photo").map(block => `${block.id}:${block.videoSrc || block.imageSrc || block.url || ""}`)].join(",");
  const pageVersion = page.id ? `${page.id}:${page.revision || 0}:${mediaVersion}` : `blank:${pageNumber}`;
  const indexVersion = page.kind === "index" ? pages.map((item, index) => `${index + 1}:${item.id}:${item.title}`).join("|") : "";
  const key = `${pageVersion}-${pageNumber}-${side}-${indexVersion}`;
  if (diaryTextureCache.has(key)) return diaryTextureCache.get(key);

  const canvas = document.createElement("canvas");
  const width = 768;
  const height = 1080;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const deferredImages = [];
  const deferredVideos = [];
  context.fillStyle = "#fbf7ee";
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 1800; index++) {
    const x = (index * 137) % width;
    const y = (index * 223) % height;
    context.fillStyle = index % 2 ? "rgba(102,75,57,0.035)" : "rgba(255,255,255,0.2)";
    context.fillRect(x, y, 1 + index % 2, 1);
  }

  const variation = page.variation ?? (pageNumber % 5);
  const tones = ["#fbf7ee", "#faf5eb", "#f8f2e7", "#fcf7f0", "#f9f4eb"];
  context.fillStyle = tones[variation % tones.length];
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 1800; index++) {
    const x = (index * 137) % width; const y = (index * 223) % height;
    context.fillStyle = index % 2 ? "rgba(102,75,57,0.028)" : "rgba(255,255,255,0.19)";
    context.fillRect(x, y, 1 + index % 2, 1);
  }
  context.strokeStyle = ["rgba(145,91,104,.25)", "rgba(126,139,125,.23)", "rgba(181,145,106,.24)"][variation % 3];
  context.lineWidth = 1;
  if (page.kind !== "memory") {
    for (let y = 260; y < height - 75; y += 54) {
      context.beginPath(); context.moveTo(76, y); context.lineTo(width - 64, y); context.stroke();
    }
  }
  if (page.kind === "memory") {
  } else {
    context.fillStyle = page.title ? "#70434f" : "rgba(128, 80, 92, 0.22)";
    context.font = "italic 40px Georgia, serif";
    context.textAlign = "center";
    context.fillText((page.title || "").slice(0, 38), width / 2, 70);
    context.strokeStyle = "rgba(191, 151, 115, 0.72)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(82, TITLE_RULE_Y);
    context.lineTo(width - 82, TITLE_RULE_Y);
    context.stroke();
  }
  // Soft gutter shadow â€” dark gradient fading from spine edge into each page
  const gutterSide = (side === "left") ? "right" : "left";
  if (gutterSide === "left") {
    const gutterGrad = context.createLinearGradient(0, 0, 90, 0);
    gutterGrad.addColorStop(0, "rgba(60,35,25,.28)");
    gutterGrad.addColorStop(1, "rgba(60,35,25,0)");
    context.fillStyle = gutterGrad;
    context.fillRect(0, 0, 90, height);
  } else {
    const gutterGrad = context.createLinearGradient(width, 0, width - 90, 0);
    gutterGrad.addColorStop(0, "rgba(60,35,25,.28)");
    gutterGrad.addColorStop(1, "rgba(60,35,25,0)");
    context.fillStyle = gutterGrad;
    context.fillRect(width - 90, 0, 90, height);
  }

  if (page.kind === "ownership") {
    drawTextAndRule(context, page.fields?.name || "Your name", 620);
    drawTextAndRule(context, page.fields?.introduction || "A little introduction", 716);
  } else if (page.kind === "profile") {
    profileFields.forEach(([key, label], i) => { const y = 222 + i * 77; context.textAlign = "left"; context.fillStyle = "#754756"; context.font = "22px Georgia, serif"; context.fillText(`${label}:`, 82, y); context.fillStyle = "#49403b"; context.font = "italic 20px Georgia, serif"; context.fillText(String(page.fields?.[key] || "").slice(0, 28), 300, y); drawRule(context, y + 22, 82, 680); });
  } else if (page.kind === "index") {
    context.textAlign = "left";
    context.fillStyle = "#80505c";
    context.font = "22px Georgia, serif";
    context.fillText("PAGE", 82, 205); context.fillText("CHAPTER", 190, 205);
    const rows = Math.ceil(pages.length / 2);
    const rowStep = Math.min(56, 750 / Math.max(rows, 1));
    pages.forEach((entry, index) => {
      const column = index >= rows ? 1 : 0;
      const row = column ? index - rows : index;
      const x = column ? 398 : 76;
      const y = 238 + row * rowStep;
      if (y > height - 92) return;
      context.fillStyle = "#514742";
      context.font = `italic ${Math.max(11, Math.min(24, rowStep * 0.48))}px Georgia, serif`;
      context.fillText(String(index + 1).padStart(2, "0"), x, y);
      context.fillText((entry.title || "Untitled page").slice(0, 22), x + 52, y);
      drawRule(context, y + 14, x, x + 300);
    });
  } else if (page.kind === "dates") {
    const dateStep = Math.min(96, 730 / Math.max((page.dates || []).length, 1));
    (page.dates || []).forEach((date, index) => {
      const y = 220 + index * dateStep;
      if (y > height - 150) return;
      context.textAlign = "left";
      context.fillStyle = "#754756";
      context.font = `italic ${Math.max(16, Math.min(26, dateStep * 0.27))}px Georgia, serif`;
      context.fillText(date.date || "Date", 82, y);
      context.fillText(date.title || "Special day", 275, y);
      drawRule(context, y + Math.min(32, dateStep * 0.42)); if (date.note) context.fillText(date.note, 90, y + Math.min(62, dateStep * 0.78));
    });
    context.fillStyle = "#a16c7d"; context.font = "italic 22px Georgia, serif"; context.fillText("+ Add a date", width / 2, height - 92);
  } else if (page.kind !== "memory") {
    context.textAlign = "left";
    context.fillStyle = page.date ? "#89796f" : "rgba(137,121,111,0.38)";
    context.font = "italic 21px Georgia, serif";
    const dateLabel = page.date ? new Date(`${page.date}T00:00:00`).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" }).toUpperCase() : "DATE";
    const moodLabel = page.mood ? `MOOD: ${page.mood.toUpperCase()}` : "";
    context.fillText(`${dateLabel}${moodLabel ? "     " + moodLabel : ""}`, 84, 205);
    if (page.kind !== "memory") {
      let y = 278;
      (page.blocks || []).forEach(block => {
        y = Math.max(y, block.top || block.y || 0);
        if (block.type === "text" && block.text) {
          const fontSize = block.fontSize || 24;
          context.fillStyle = block.color || "#3d302c";
          context.font = `${fontSize}px Georgia, serif`;
          wrapPageText(block.text, 44).forEach(line => {
            context.fillText(line, 84, y);
            y += 54;
          });
        }
      });
    }
  }

  const vignette = context.createRadialGradient(width / 2, height / 2, height * 0.18, width / 2, height / 2, height * 0.72);
  vignette.addColorStop(0, "rgba(90,60,40,0)");
  vignette.addColorStop(1, "rgba(90,60,40,.12)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  drawPageNumber(context, pageNumber, side, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  deferredImages.forEach(({ src, x, y, width: imageWidth, height: imageHeight, rotation = 0 }) => {
    const image = new Image();
    image.onload = () => {
      context.save(); context.translate(x + imageWidth / 2, y + imageHeight / 2); context.rotate(THREE.MathUtils.degToRad(rotation)); context.beginPath(); context.rect(-imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight); context.clip();
      const scale = Math.max(imageWidth / image.width, imageHeight / image.height);
      const drawWidth = image.width * scale; const drawHeight = image.height * scale;
      context.drawImage(image, (imageWidth - drawWidth) / 2, (imageHeight - drawHeight) / 2, drawWidth, drawHeight);
      context.restore(); texture.needsUpdate = true;
    };
    image.src = src;
  });
  const videoIdsOnPage = new Set(deferredVideos.map(item => item.key));
  for (const [key, entry] of videoTextureSources) {
    if (key.startsWith(`${page.id}:`) && !videoIdsOnPage.has(key)) { entry.video.pause(); videoTextureSources.delete(key); }
  }
  deferredVideos.forEach(surface => {
    let entry = videoTextureSources.get(surface.key);
    if (!entry) {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous"; video.muted = true; video.loop = true; video.playsInline = true; video.preload = "auto";
      entry = { video, src: surface.src, surfaces: new Map() };
      videoTextureSources.set(surface.key, entry);
      video.addEventListener("loadeddata", () => { for (const target of entry.surfaces.values()) drawVideoSurface(entry.video, target); });
      video.src = surface.src;
      video.load();
    } else if (entry.src !== surface.src) {
      entry.video.pause(); entry.src = surface.src; entry.video.src = surface.src; entry.video.load();
    }
    surface.context = context; surface.texture = texture;
    entry.surfaces.set(surface.surfaceKey, surface);
    if (entry.video.readyState >= 2) drawVideoSurface(entry.video, surface);
  });
  diaryTextureCache.set(key, texture);
  if (diaryTextureCache.size > 36) diaryTextureCache.delete(diaryTextureCache.keys().next().value);
  return texture;
}

function drawVideoSurface(video, surface) {
  if (video.readyState < 2) return;
  const { context, texture, x, y, width, height, rotation = 0 } = surface;
  context.save(); context.translate(x + width / 2, y + height / 2); context.rotate(THREE.MathUtils.degToRad(rotation));
  context.fillStyle = "#332a2d"; context.fillRect(-width / 2, -height / 2, width, height);
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const drawWidth = video.videoWidth * scale; const drawHeight = video.videoHeight * scale;
  context.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  if (video.paused) {
    context.fillStyle = "rgba(50,32,40,.62)"; context.beginPath(); context.arc(0, 0, 27, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#fff8f0"; context.beginPath(); context.moveTo(-7, -12); context.lineTo(13, 0); context.lineTo(-7, 12); context.closePath(); context.fill();
  }
  context.restore(); texture.needsUpdate = true;
}

function toggleDiaryVideo(pageId, blockId) {
  const entry = videoTextureSources.get(`${pageId}:${blockId}`);
  if (!entry) return;
  if (entry.video.paused) entry.video.play().catch(() => {});
  else { entry.video.pause(); for (const surface of entry.surfaces.values()) drawVideoSurface(entry.video, surface); }
}

function LiveDiaryVideos() {
  useFrame(() => {
    for (const entry of videoTextureSources.values()) {
      if (!entry.video.paused && entry.video.readyState >= 2) for (const surface of entry.surfaces.values()) drawVideoSurface(entry.video, surface);
    }
  });
  return null;
}

function createDiaryPageMaterial(page, pageNumber, side, pages) {
  return new THREE.MeshStandardMaterial({
    map: createDiaryPageTexture(page, pageNumber, side, pages),
    color: "#fffdf8",
    roughness: 0.97,
  });
}

function pagePoint(event) {
  return { x: Math.round((event.uv?.x ?? 0.5) * 768), y: Math.round((1 - (event.uv?.y ?? 0.5)) * 1080) };
}

function wrapPageText(value, maxChars = 48) {
  const wrapped = [];
  String(value || "").split("\n").forEach(paragraph => {
    if (!paragraph) { wrapped.push(""); return; }
    let line = "";
    paragraph.split(/\s+/).forEach(word => {
      const next = line ? line + " " + word : word;
      if (next.length > maxChars && line) { wrapped.push(line); line = word; }
      else line = next;
    });
    wrapped.push(line);
  });
  return wrapped;
}

function getMemoryBlockRects(page) {
  let cursor = 278;
  return (page.blocks || []).map(block => {
    const top = Math.max(cursor, block.top || 0);
    let height = 64;
    if (block.type === "text") height = Math.max(52, wrapPageText(block.text).length * ((block.fontSize || 24) * (block.lineSpacing || 1.55)) + 18);
    if (block.type === "photo") {
      const mediaY = block.y ?? (top - 30);
      const rect = { block, top: mediaY, bottom: mediaY + (block.height || 170) + (block.caption ? 45 : 0) };
      cursor = rect.bottom + 22;
      return rect;
    }
    if (block.type === "video") {
      const mediaY = block.y ?? (top - 30);
      const rect = { block, top: mediaY, bottom: mediaY + (block.height || 170) + (block.caption ? 45 : 0) };
      cursor = rect.bottom + 22;
      return rect;
    }
    if (block.type === "checklist") height = Math.max(70, (block.items || []).length * 40 + 20);
    const rect = { block, top, bottom: top + height };
    cursor = rect.bottom + 22;
    return rect;
  });
}

function PageCanvasEditor({ side, page, editor, onField, onBlock, onAdd, onImage, onDeleteBlock, onVideoToggle, onVideoUpload, onVideoUrlChange, onClose, mode, spellCheck = false }) {
  const dragRef = useRef(null);
  if (!page || !editor || editor.pageId !== page.id) return null;
  // In read mode: never show any editing overlays
  if (mode === 'read') return null;
  const regionStyle = (x, y, width, height) => ({ left: x, top: y, width, height });
  const value = (key) => page.fields?.[key] || "";
  const edit = (x, y, width, height, text, change, className = "page-edit-input", placeholder = "") => (
    <input
      autoFocus
      className={className}
      style={regionStyle(x, y, width, height)}
      value={text || ""}
      placeholder={placeholder}
      spellCheck={spellCheck}
      onChange={event => change(event.target.value)}
      onKeyDown={event => {
        if (event.key === "Enter") onClose();
      }}
      onBlur={onClose}
    />
  );
  const beginMediaGesture = (event, mode, block) => {
    event.preventDefault(); event.stopPropagation();
    const plane = event.currentTarget.closest(".paper-overlay-plane");
    const bounds = plane?.getBoundingClientRect();
    if (!bounds) return;
    dragRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      scaleX: 768 / bounds.width, scaleY: 1080 / bounds.height,
      x: block.x ?? 84, y: block.y ?? ((block.top || 300) - 30), width: block.width || 300,
      height: block.height || 170, rotation: block.rotation || 0, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveMediaGesture = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) * drag.scaleX;
    const dy = (event.clientY - drag.startY) * drag.scaleY;
    drag.moved = true;
    const frame = event.currentTarget.closest(".page-media-frame");
    if (!frame) return;
    if (drag.mode === "move") { frame.style.left = `${drag.x + dx}px`; frame.style.top = `${drag.y + dy}px`; }
    if (drag.mode === "resize") { frame.style.width = `${Math.max(70, drag.width + dx)}px`; frame.style.height = `${Math.max(60, drag.height + dy)}px`; }
    if (drag.mode === "rotate") frame.style.transform = `rotate(${drag.rotation + dx * 0.2}deg)`;
  };
  const endMediaGesture = (event, block) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) * drag.scaleX;
    const dy = (event.clientY - drag.startY) * drag.scaleY;
    if (drag.moved) {
      const changes = drag.mode === "move" ? { x: Math.round(drag.x + dx), y: Math.round(drag.y + dy), top: Math.round(drag.y + dy + 30) }
        : drag.mode === "resize" ? { width: Math.max(70, Math.round(drag.width + dx)), height: Math.max(60, Math.round(drag.height + dy)) }
          : { rotation: Math.max(-12, Math.min(12, Math.round(drag.rotation + dx * 0.2))) };
      onBlock(page.id, block.id, changes);
    }
    dragRef.current = null;
  };
  let control = null;
  if (editor.kind === "title") {
    control = edit(126, 24, 516, 62, page.title, text => onField(page.id, "title", text), "page-edit-title", "Untitled");
  } else if (editor.kind === "owner-name") {
    control = edit(158, 584, 452, 56, value("name"), text => onField(page.id, "name", text), "page-edit-input", "Your name");
  } else if (editor.kind === "owner-intro") {
    control = <textarea autoFocus className="page-edit-input page-edit-multiline" style={regionStyle(94, 674, 580, 116)} placeholder="A little introduction..." value={value("introduction")} spellCheck={spellCheck} onChange={event => onField(page.id, "introduction", event.target.value)} onBlur={onClose} />;
  } else if (editor.kind === "profile-field") {
    const row = profileFields.findIndex(([key]) => key === editor.field);
    const [key] = profileFields[Math.max(0, row)];
    control = edit(294, 222 + Math.max(0, row) * 77 - 34, 382, 48, value(key), text => onField(page.id, key, text));
  } else if (editor.kind === "photo") {
    const block = page.blocks?.find(item => item.id === editor.blockId);
    if (block) {
      const blockRect = getMemoryBlockRects(page).find(rect => rect.block.id === block.id);
      const x = block.x ?? 84; const y = block.y ?? ((blockRect?.top || 320) - 30);
      const width = block.width || 300; const height = block.height || 170;
      control = <>
        <div className="page-media-frame" style={{ ...regionStyle(x, y, width, height), transform: `rotate(${block.rotation || 0}deg)` }} onPointerDown={event => beginMediaGesture(event, "move", block)} onPointerMove={moveMediaGesture} onPointerUp={event => endMediaGesture(event, block)}>
          <button className="media-delete" aria-label="Delete photo" onPointerDown={event => event.stopPropagation()} onClick={() => onDeleteBlock(page.id, block.id)}>✕</button>
          <button className="media-rotate" aria-label="Rotate photo" onPointerDown={event => beginMediaGesture(event, "rotate", block)} onPointerMove={moveMediaGesture} onPointerUp={event => endMediaGesture(event, block)}>â†»</button>
          <button className="media-resize" aria-label="Resize photo" onPointerDown={event => beginMediaGesture(event, "resize", block)} onPointerMove={moveMediaGesture} onPointerUp={event => endMediaGesture(event, block)} />
          <label className="media-replace" onPointerDown={event => event.stopPropagation()}>Replace<input type="file" accept="image/*" onChange={event => onImage(event, "block", block.id)} /></label>
        </div>
        <input className="page-edit-input media-caption" style={regionStyle(x, y + height + 6, width, 38)} value={block.caption || ""} placeholder="Caption" onChange={event => onBlock(page.id, block.id, { caption: event.target.value })} />
      </>;
    } else {
      control = <label className="page-photo-picker" style={regionStyle(editor.x, editor.y, 260, 42)}>Choose a photograph<input type="file" accept="image/*" onChange={event => onImage(event, editor.field || "photo", editor.blockId)} /></label>;
    }
  } else if (editor.kind === "memory-date") {
    control = <input autoFocus className="page-edit-input" type="date" style={regionStyle(78, 171, 255, 48)} value={page.date || ""} onChange={event => onField(page.id, "date", event.target.value)} onBlur={onClose} />;
  } else if (editor.kind === "memory-mood") {
    control = edit(350, 171, 330, 48, page.mood, text => onField(page.id, "mood", text), "page-edit-input", "Your mood");
  } else if (editor.kind === "memory-text") {
    const block = (page.blocks || []).find(item => item.id === editor.blockId);
    if (block) {
      const fontSize = block.fontSize || (block.style === "heading" ? 32 : block.style === "subheading" ? 27 : 24);
      const lineSpacing = block.lineSpacing || 1.55;
      const lineHeight = Math.round(fontSize * lineSpacing);
      const textX = block.x ?? 78;
      const textY = editor.y ?? block.y ?? block.top ?? 260;
      const textW = block.width || 612;
      const textH = Math.max(lineHeight * 2, editor.height || 140);
      const toolY = Math.max(170, textY - 38);

      const handleBlur = (e) => {
        if (e.relatedTarget && e.relatedTarget.closest(".page-format-tools")) {
          return;
        }
        if (!block.text || !block.text.trim()) {
          onDeleteBlock(page.id, block.id);
        }
        onClose();
      };

      control = (
        <>
          <div className="page-format-tools" style={regionStyle(textX, toolY, textW, 34)} onPointerDown={e => e.stopPropagation()}>
            <button onPointerDown={e => e.preventDefault()} onClick={() => onBlock(page.id, block.id, { bold: !block.bold })} aria-pressed={Boolean(block.bold)} title="Bold">B</button>
            <button onPointerDown={e => e.preventDefault()} onClick={() => onBlock(page.id, block.id, { italic: !block.italic })} aria-pressed={Boolean(block.italic)} title="Italic"><i>I</i></button>
            <button onPointerDown={e => e.preventDefault()} onClick={() => onBlock(page.id, block.id, { underline: !block.underline })} aria-pressed={Boolean(block.underline)} title="Underline"><u>U</u></button>
            <select value={block.style || "body"} onPointerDown={e => e.stopPropagation()} onChange={e => {
              const style = e.target.value;
              const fSize = style === "heading" ? 32 : style === "subheading" ? 27 : 24;
              onBlock(page.id, block.id, { style, fontSize: fSize });
            }}>
              <option value="body">Body</option>
              <option value="heading">Heading</option>
              <option value="subheading">Subheading</option>
              <option value="quote">Quote</option>
            </select>
            <select value={block.fontSize || 24} onPointerDown={e => e.stopPropagation()} onChange={e => onBlock(page.id, block.id, { fontSize: Number(e.target.value) })}>
              <option value="18">Small (18)</option>
              <option value="24">Regular (24)</option>
              <option value="30">Large (30)</option>
              <option value="36">Title (36)</option>
            </select>
            <select value={block.align || "left"} onPointerDown={e => e.stopPropagation()} onChange={e => onBlock(page.id, block.id, { align: e.target.value })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
            <select aria-label="Line spacing" value={block.lineSpacing || 1.55} onPointerDown={e => e.stopPropagation()} onChange={e => onBlock(page.id, block.id, { lineSpacing: Number(e.target.value) })}>
              <option value="1.25">Tight</option>
              <option value="1.55">Airy</option>
              <option value="1.85">Loose</option>
            </select>
            <button className="format-done" onPointerDown={e => e.preventDefault()} onClick={onClose} title="Save text">âœ“ Done</button>
            <button className="format-delete" onPointerDown={e => e.preventDefault()} onClick={() => onDeleteBlock(page.id, block.id)} title="Delete text">✕</button>
          </div>
          <textarea
            autoFocus
            className="page-edit-input page-edit-writing"
            placeholder="Write here..."
            spellCheck={spellCheck}
            style={{
              ...regionStyle(textX, textY, textW, textH),
              fontSize: `${fontSize}px`,
              lineHeight: `${lineHeight}px`,
              fontWeight: block.bold ? "bold" : "normal",
              fontStyle: (block.italic || block.style === "quote") ? "italic" : "normal",
              textDecoration: block.underline ? "underline" : "none",
              textAlign: block.align || "left",
            }}
            value={block.text || ""}
            onChange={e => onBlock(page.id, block.id, { text: e.target.value })}
            onBlur={handleBlur}
          />
        </>
      );
    }
  } else if (editor.kind === "date-entry") {
    const row = page.dates?.find(item => item.id === editor.dateId);
    const dateStep = Math.min(96, 730 / Math.max((page.dates || []).length, 1));
    if (row) control = <div className="page-date-controls" style={regionStyle(72, 188 + editor.row * dateStep, 624, 70)}>
      <input type="date" value={row.date} onChange={event => onField(page.id, "dates", page.dates.map(item => item.id === row.id ? { ...item, date: event.target.value } : item))} />
      <input value={row.title} placeholder="Birthday or special day" onChange={event => onField(page.id, "dates", page.dates.map(item => item.id === row.id ? { ...item, title: event.target.value } : item))} />
      <select value={row.type} onChange={event => onField(page.id, "dates", page.dates.map(item => item.id === row.id ? { ...item, type: event.target.value } : item))}><option>Birthday</option><option>Anniversary</option><option>Special date</option><option>Custom date</option></select>
      <button onClick={() => onField(page.id, "dates", page.dates.filter(item => item.id !== row.id))}>Ã—</button>
    </div>;
  } else if (editor.kind === "date-add") {
    control = <button className="page-add-date" style={regionStyle(278, 946, 220, 48)} onClick={() => onAdd(page.id, "date")}>+ Add a date</button>;
  } else if (editor.kind === "video") {
    const block = page.blocks?.find(item => item.id === editor.blockId);
    if (block) {
      const rect = getMemoryBlockRects(page).find(item => item.block.id === block.id);
      const x = block.x ?? 84; const y = block.y ?? ((rect?.top || editor.y || 350) - 30);
      const width = block.width || 300; const height = block.height || 170;
      control = <>
        <div className="page-media-frame" style={{ ...regionStyle(x, y, width, height), transform: `rotate(${block.rotation || 0}deg)` }} onPointerDown={event => beginMediaGesture(event, "move", block)} onPointerMove={moveMediaGesture} onPointerUp={event => endMediaGesture(event, block)}>
          <button className="media-delete" aria-label="Delete video" onPointerDown={event => event.stopPropagation()} onClick={() => onDeleteBlock(page.id, block.id)}>Ã—</button>
          <button className="media-rotate" aria-label="Rotate video" onPointerDown={event => beginMediaGesture(event, "rotate", block)} onPointerMove={moveMediaGesture} onPointerUp={event => endMediaGesture(event, block)}>â†»</button>
          <button className="media-resize" aria-label="Resize video" onPointerDown={event => beginMediaGesture(event, "resize", block)} onPointerMove={moveMediaGesture} onPointerUp={event => endMediaGesture(event, block)} />
        </div>
        <div className="page-video-tools" style={regionStyle(x, y + height + 4, width, 44)}>
          <input type="url" defaultValue={block.url || ""} placeholder={block.assetId ? "Video saved on this page" : "Paste a video link"} onBlur={event => { const next = event.currentTarget.value.trim(); if (next !== (block.url || "")) onVideoUrlChange(page.id, block.id, next); }} />
          {block.url || block.videoSrc ? <button onClick={() => onVideoToggle(page.id, block.id)}>Play / pause</button> : null}
          <label>Upload<input type="file" accept="video/*" onChange={event => onVideoUpload(event, block.id)} /></label>
          <input className="video-caption" value={block.caption || ""} placeholder="Caption" onChange={event => onBlock(page.id, block.id, { caption: event.target.value })} />
        </div>
      </>;
    }
  } else if (editor.kind === "check-item") {
    const block = page.blocks?.find(item => item.id === editor.blockId);
    const item = block?.items?.find(entry => entry.id === editor.itemId);
    if (block && item) control = edit(120, editor.y || 320, 550, 48, item.text, text => onBlock(page.id, block.id, { items: block.items.map(entry => entry.id === item.id ? { ...entry, text } : entry) }));
  } else if (editor.kind === "add-menu") {
    control = <div className="page-add-menu" style={regionStyle(editor.x, editor.y, 310, 55)}><button onClick={() => onAdd(page.id, "text")}>Text</button><label>Photo<input type="file" accept="image/*" onChange={event => onImage(event, "block")} /></label><button onClick={() => onAdd(page.id, "video")}>Video</button><button onClick={() => onAdd(page.id, "checklist")}>Checklist</button></div>;
  }
  if (!control) return null;
  const centerX = side === "left" ? -GUTTER_W / 2 - PAGE_W / 2 : GUTTER_W / 2 + PAGE_W / 2;
  return <Html transform sprite={false} occlude={false} position={[centerX, 0, 0.22]}><div className="paper-overlay-plane">{control}</div></Html>;
}

/* =========================================================
   FORMAT BAR â€” slides in/out when mode changes
========================================================= */

/* =========================================================
   FORMAT BAR — slides in/out when mode changes
========================================================= */

function runOnSelection(fn) {
  const { activeEditor: ed, lastSelection: sel } = useUI.getState();
  if (!ed) return;
  let chain = ed.chain().focus();
  if (sel && typeof sel.from === 'number' && typeof sel.to === 'number') {
    chain = chain.setTextSelection(sel);
  }
  fn(chain).run();
}

function FormatBar({
  mode,
  activeBlock,
  onBlockChange,
  onAddContent,
  onAddMedia,
  activePageId,
  savedStatus,
}) {
  const barRef = useRef(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [inkOpen, setInkOpen] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);
  const block = activeBlock;

  const ed = useUI((s) => s.activeEditor);

  useEffect(() => {
    if (!barRef.current) return;
    if (mode === 'write') {
      gsap.fromTo(barRef.current,
        { y: -64, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' });
    } else {
      gsap.to(barRef.current, { y: -64, opacity: 0, duration: 0.25, ease: 'power2.in' });
    }
  }, [mode]);

  // Close all popovers on outside click or Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setStyleOpen(false);
        setFontOpen(false);
        setAlignOpen(false);
        setInkOpen(false);
        setHlOpen(false);
      }
    };
    const handlePointerDown = (e) => {
      if (!e.target.closest('.fmt-popover-wrap, .fmt-color-wrap')) {
        setStyleOpen(false);
        setFontOpen(false);
        setAlignOpen(false);
        setInkOpen(false);
        setHlOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const run = (changes) => {
    if (!block) return;
    onBlockChange(activePageId, block.id, changes);
  };
  const off = !block || block.type !== 'text';

  const pickInk = (c) => {
    if (c) {
      runOnSelection((chain) => chain.setColor(c));
      run({ color: c });
    } else {
      runOnSelection((chain) => chain.unsetColor());
      run({ color: undefined });
    }
    setInkOpen(false);
  };

  const pickHl = (c) => {
    if (c) {
      runOnSelection((chain) => chain.setHighlight({ color: c }));
      run({ highlight: c });
    } else {
      runOnSelection((chain) => chain.unsetHighlight());
      run({ highlight: undefined });
    }
    setHlOpen(false);
  };

  const pickStyle = (st) => {
    if (st === 'heading') runOnSelection((c) => c.setHeading({ level: 2 }));
    else if (st === 'subheading') runOnSelection((c) => c.setHeading({ level: 3 }));
    else if (st === 'quote') runOnSelection((c) => c.toggleBlockquote());
    else runOnSelection((c) => c.setParagraph());
    run({ style: st });
    setStyleOpen(false);
  };

  const pickFont = (ff) => {
    run({ fontFamily: ff });
    setFontOpen(false);
  };

  const pickAlign = (al) => {
    run({ align: al });
    setAlignOpen(false);
  };

  const handleMediaChange = (e, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onAddMedia(activePageId, kind, file);
    e.target.value = '';
  };

  const activeColor = ed?.getAttributes('textStyle')?.color || block?.color || INK_PALETTE[0];
  const activeHl = ed?.getAttributes('highlight')?.color || block?.highlight || HIGHLIGHT_PALETTE[1];
  const currentStyleLabel = block?.style ? (block.style[0].toUpperCase() + block.style.slice(1)) : 'Body';
  const currentFontLabel = block?.fontFamily === 'handwritten' ? 'Handwritten' : 'Serif';
  const currentAlignLabel = block?.align ? (block.align[0].toUpperCase() + block.align.slice(1)) : 'Left';
  const sizeId = ed?.state.selection.$from.parent.attrs.size;
  const currentSize = SIZES.find((size) => size.id === sizeId) || SIZES[1];
  const currentSizeIndex = SIZES.indexOf(currentSize);

  return (
    <div className="format-bar-wrap">
      <div ref={barRef} className="format-bar" style={{ opacity: 0, transform: 'translateY(-64px)' }}>
        {/* Style popover menu */}
        <div className="fmt-popover-wrap">
          <button
            className="fmt-select"
            disabled={off}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: off ? 'default' : 'pointer' }}
            onMouseDown={(e) => {
              e.preventDefault();
              setStyleOpen((v) => !v);
              setFontOpen(false);
              setAlignOpen(false);
              setInkOpen(false);
              setHlOpen(false);
            }}
          >
            <span>{currentStyleLabel}</span>
            <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.7 }} />
          </button>
          {styleOpen && (
            <div className="fmt-popover">
              <button className={`fmt-popover-item ${block?.style === 'body' || !block?.style ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickStyle('body'); }}>Body</button>
              <button className={`fmt-popover-item ${block?.style === 'heading' ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickStyle('heading'); }}>Heading</button>
              <button className={`fmt-popover-item ${block?.style === 'subheading' ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickStyle('subheading'); }}>Subheading</button>
              <button className={`fmt-popover-item ${block?.style === 'quote' ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickStyle('quote'); }}>Quote</button>
            </div>
          )}
        </div>

        {/* Font family popover menu */}
        <div className="fmt-popover-wrap">
          <button
            className="fmt-select"
            disabled={off}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: off ? 'default' : 'pointer' }}
            onMouseDown={(e) => {
              e.preventDefault();
              setFontOpen((v) => !v);
              setStyleOpen(false);
              setAlignOpen(false);
              setInkOpen(false);
              setHlOpen(false);
            }}
          >
            <span>{currentFontLabel}</span>
            <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.7 }} />
          </button>
          {fontOpen && (
            <div className="fmt-popover">
              <button className={`fmt-popover-item ${block?.fontFamily !== 'handwritten' ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickFont('serif'); }}>Serif</button>
              <button className={`fmt-popover-item ${block?.fontFamily === 'handwritten' ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickFont('handwritten'); }}>Handwritten</button>
            </div>
          )}
        </div>

        <span className="fmt-sep" />

        {/* Font size */}
        <button
          className="fmt-btn"
          disabled={off || currentSizeIndex === 0}
          onMouseDown={(e) => {
            e.preventDefault();
            if (!off && currentSizeIndex > 0) {
              runOnSelection((chain) => chain.setParagraphSize(SIZES[currentSizeIndex - 1].id));
            }
          }}
          title="Smaller"
          aria-label="Smaller paragraph text"
        >
          <Minus size={14} strokeWidth={2} />
        </button>
        <span className={`fmt-size-label${off ? ' fmt-disabled' : ''}`} aria-live="polite">{currentSize.label}</span>
        <button
          className="fmt-btn"
          disabled={off || currentSizeIndex === SIZES.length - 1}
          onMouseDown={(e) => {
            e.preventDefault();
            if (!off && currentSizeIndex < SIZES.length - 1) {
              runOnSelection((chain) => chain.setParagraphSize(SIZES[currentSizeIndex + 1].id));
            }
          }}
          title="Larger"
          aria-label="Larger paragraph text"
        >
          <Plus size={14} strokeWidth={2} />
        </button>

        <span className="fmt-sep" />

        {/* B I U S */}
        <button
          className={`fmt-btn${block?.bold ? ' fmt-active' : ''}`}
          disabled={off}
          title="Bold"
          onMouseDown={(e) => {
            e.preventDefault();
            runOnSelection((c) => c.toggleBold());
            run({ bold: !block?.bold });
          }}
        >
          <b>B</b>
        </button>
        <button
          className={`fmt-btn${block?.italic ? ' fmt-active' : ''}`}
          disabled={off}
          title="Italic"
          onMouseDown={(e) => {
            e.preventDefault();
            runOnSelection((c) => c.toggleItalic());
            run({ italic: !block?.italic });
          }}
        >
          <i>I</i>
        </button>
        <button
          className={`fmt-btn${block?.underline ? ' fmt-active' : ''}`}
          disabled={off}
          title="Underline"
          onMouseDown={(e) => {
            e.preventDefault();
            runOnSelection((c) => c.toggleUnderline());
            run({ underline: !block?.underline });
          }}
        >
          <u>U</u>
        </button>
        <button
          className={`fmt-btn${block?.strikethrough ? ' fmt-active' : ''}`}
          disabled={off}
          title="Strikethrough"
          onMouseDown={(e) => {
            e.preventDefault();
            runOnSelection((c) => c.toggleStrike());
            run({ strikethrough: !block?.strikethrough });
          }}
        >
          <s>S</s>
        </button>

        <span className="fmt-sep" />

        {/* Ink color button with underline swatch */}
        <div className="fmt-color-wrap">
          <button
            className="fmt-btn fmt-color-btn"
            disabled={off}
            title="Ink color"
            onMouseDown={(e) => {
              e.preventDefault();
              setInkOpen((v) => !v);
              setHlOpen(false);
              setStyleOpen(false);
              setFontOpen(false);
              setAlignOpen(false);
            }}
          >
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', fontSize: 13, lineHeight: 1 }}>A</span>
              <span style={{ width: 12, height: 3, borderRadius: 1.5, background: activeColor, marginTop: 2 }} />
            </span>
            <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.7 }} />
          </button>
          {inkOpen && (
            <div className="fmt-color-palette">
              {INK_PALETTE.map((c) => (
                <button
                  key={c}
                  className="fmt-swatch"
                  style={{ background: c }}
                  title={c}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickInk(c);
                  }}
                />
              ))}
              <button
                className="fmt-swatch fmt-swatch-none"
                title="None (remove color)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickInk(undefined);
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Highlighter button with underline swatch */}
        <div className="fmt-color-wrap">
          <button
            className="fmt-btn fmt-color-btn"
            disabled={off}
            title="Highlight"
            onMouseDown={(e) => {
              e.preventDefault();
              setHlOpen((v) => !v);
              setInkOpen(false);
              setStyleOpen(false);
              setFontOpen(false);
              setAlignOpen(false);
            }}
          >
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
              <Highlighter size={14} strokeWidth={2} />
              <span style={{ width: 14, height: 3, borderRadius: 1.5, background: activeHl, marginTop: 1 }} />
            </span>
            <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.7 }} />
          </button>
          {hlOpen && (
            <div className="fmt-color-palette">
              {HIGHLIGHT_PALETTE.map((c) => (
                <button
                  key={c}
                  className="fmt-swatch"
                  style={{ background: c }}
                  title={c}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickHl(c);
                  }}
                />
              ))}
              <button
                className="fmt-swatch fmt-swatch-none"
                title="None (remove highlight)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickHl(undefined);
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <span className="fmt-sep" />

        {/* Alignment popover menu */}
        <div className="fmt-popover-wrap">
          <button
            className="fmt-select fmt-select-sm"
            disabled={off}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: off ? 'default' : 'pointer' }}
            onMouseDown={(e) => {
              e.preventDefault();
              setAlignOpen((v) => !v);
              setStyleOpen(false);
              setFontOpen(false);
              setInkOpen(false);
              setHlOpen(false);
            }}
          >
            <span>{currentAlignLabel}</span>
            <ChevronDown size={11} strokeWidth={2} style={{ opacity: 0.7 }} />
          </button>
          {alignOpen && (
            <div className="fmt-popover">
              <button className={`fmt-popover-item ${block?.align === 'left' || !block?.align ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickAlign('left'); }}>Left</button>
              <button className={`fmt-popover-item ${block?.align === 'center' ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickAlign('center'); }}>Center</button>
              <button className={`fmt-popover-item ${block?.align === 'right' ? 'is-active' : ''}`} onMouseDown={(e) => { e.preventDefault(); pickAlign('right'); }}>Right</button>
            </div>
          )}
        </div>

        <span className="fmt-sep" />

        {/* Insert text */}
        <button
          className="fmt-btn"
          title="Add text"
          onMouseDown={(e) => {
            e.preventDefault();
            if (activePageId) onAddContent(activePageId, 'text');
          }}
        >
          <Type size={18} strokeWidth={1.75} />
        </button>

        {/* Insert photo */}
        <label className="fmt-btn" title="Add photo" style={{ cursor: 'pointer' }}>
          <ImageIcon size={18} strokeWidth={1.75} />
          <input
            type="file"
            accept="image/*"
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
            onChange={(e) => handleMediaChange(e, 'photo')}
          />
        </label>

        {/* Insert video */}
        <label className="fmt-btn" title="Add video" style={{ cursor: 'pointer' }}>
          <VideoIcon size={18} strokeWidth={1.75} />
          <input
            type="file"
            accept="video/*"
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
            onChange={(e) => handleMediaChange(e, 'video')}
          />
        </label>

        {/* Insert audio */}
        <label className="fmt-btn" title="Add audio" style={{ cursor: 'pointer' }}>
          <Mic size={18} strokeWidth={1.75} />
          <input
            type="file"
            accept="audio/*"
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
            onChange={(e) => handleMediaChange(e, 'audio')}
          />
        </label>

        {/* Insert checklist */}
        <button
          className="fmt-btn"
          title="Add checklist"
          onMouseDown={(e) => {
            e.preventDefault();
            if (activePageId) onAddContent(activePageId, 'checklist');
          }}
        >
          <ListChecks size={18} strokeWidth={1.75} />
        </button>

        <span className="fmt-right">
          <span className={`fmt-saved ${savedStatus === 'saving' ? 'fmt-saving' : ''}`}>
            {savedStatus === 'saving' ? 'Saving…' : 'Saved ✓'}
          </span>
        </span>
      </div>
    </div>
  );
}

function createContactShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(256, 256, 34, 256, 256, 248);
  gradient.addColorStop(0, "rgba(9, 5, 7, 0.54)");
  gradient.addColorStop(0.46, "rgba(9, 5, 7, 0.26)");
  gradient.addColorStop(1, "rgba(9, 5, 7, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(canvas);
}

function createDeskFadeTexture() {
  const canvas = document.createElement("canvas");
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const image = context.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      const alpha = Math.min(1, edge / 56);
      const offset = (y * size + x) * 4;
      const channel = Math.round(alpha * 255);
      image.data[offset] = channel;
      image.data[offset + 1] = channel;
      image.data[offset + 2] = channel;
      image.data[offset + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function createCoverTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1400;
  const context = canvas.getContext("2d");
  context.fillStyle = "#17171b";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 7200; index++) {
    const x = (index * 97) % canvas.width;
    const y = (index * 193) % canvas.height;
    context.fillStyle = index % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.11)";
    context.fillRect(x, y, 1 + index % 2, 1);
  }

  context.strokeStyle = "rgba(203, 163, 135, 0.7)";
  context.lineWidth = 3;
  context.strokeRect(54, 54, canvas.width - 108, canvas.height - 108);
  context.strokeStyle = "rgba(188, 112, 141, 0.64)";
  context.lineWidth = 2;
  context.strokeRect(73, 73, canvas.width - 146, canvas.height - 146);
  context.fillStyle = "rgba(233, 213, 194, 0.92)";
  context.font = "32px Georgia, serif";
  context.textAlign = "center";
  context.letterSpacing = "5px";
  context.fillText("MEMORIES", canvas.width / 2, canvas.height * 0.55);
  context.beginPath();
  context.moveTo(canvas.width / 2 - 25, canvas.height * 0.59);
  context.lineTo(canvas.width / 2, canvas.height * 0.57);
  context.lineTo(canvas.width / 2 + 25, canvas.height * 0.59);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLiningTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  context.fillStyle = "#553747";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(209, 169, 141, 0.58)";
  context.lineWidth = 3;
  context.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);
  context.strokeStyle = "rgba(201, 134, 157, 0.44)";
  context.lineWidth = 1.5;
  context.strokeRect(48, 48, canvas.width - 96, canvas.height - 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const paperTexture = createPaperTexture();
paper.map = paperTexture;
paper.needsUpdate = true;
const coverMaterial = new THREE.MeshStandardMaterial({
  map: createCoverTexture(),
  roughness: 0.86,
  metalness: 0.04,
});
const liningMaterial = new THREE.MeshStandardMaterial({
  map: createLiningTexture(),
  roughness: 0.92,
  metalness: 0.01,
  side: THREE.DoubleSide,
});
const contactShadowTexture = createContactShadowTexture();
const deskFadeTexture = createDeskFadeTexture();
const deskPhotoTexture = new THREE.TextureLoader().load(deskPhotoUrl);
deskPhotoTexture.colorSpace = THREE.SRGBColorSpace;
deskPhotoTexture.wrapS = THREE.ClampToEdgeWrapping;
deskPhotoTexture.wrapT = THREE.ClampToEdgeWrapping;
deskPhotoTexture.repeat.set(0.405, 0.64);
deskPhotoTexture.offset.set(0.2975, 0.18);


/* =========================================================
   PAGE
========================================================= */

function DiaryPage({ side, page, pageNumber, backPage, backPageNumber, pages, onTurn, onPageClick, editor, pageEvents, visible = true }) {
  const geometry = useMemo(() => createPageGeometry(side), [side]);
  const meshRef = useRef(null);
  const materials = useMemo(() => [
    paper,
    paper,
    paper,
    paper,
    createDiaryPageMaterial(page || { kind: "memory", title: "", blocks: [] }, pageNumber, side, pages),
    createDiaryPageMaterial(backPage || { kind: "memory", title: "", blocks: [] }, backPageNumber, side === "right" ? "left" : "right", pages),
  ], [page, pageNumber, backPage, backPageNumber, side, pages]);

  return <group visible={visible}>
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={materials}
      position={[side === "right" ? GUTTER_W / 2 : -GUTTER_W / 2, 0, 0.146]}
      castShadow
      onClick={event => {
        event.stopPropagation();
        onPageClick(page, event, side, onTurn, pageNumber);
      }}
    />
    <PageRectReporter meshRef={meshRef} side={side} visible={visible} />
    {page && page.kind !== "memory" && (
      <PageCanvasEditor side={side} page={page} editor={editor} {...pageEvents} />
    )}
  </group>;
}

function TurningPage({ direction, progressRef, frontPage, backPage, frontPageNumber, backPageNumber, pages }) {
  const meshRef = useRef(null);
  const shadowRef = useRef(null);

  // Allocate fresh subdivided deformable page geometry with pristine rest coordinates
  const geometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(PAGE_W, PAGE_H, 0.016, 64, 40, 1);
    // Base translation: anchor x=0 at the center spine/gutter hinge, x=PAGE_W at outer free edge
    geo.translate(PAGE_W / 2, 0, 0);
    // Save immutable rest positions
    geo.userData.restPositions = Float32Array.from(geo.attributes.position.array);
    return geo;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const materials = useMemo(() => {
    const rightMat = createDiaryPageMaterial(
      (direction === 1 ? frontPage : backPage) || { kind: "memory", title: "", blocks: [] },
      direction === 1 ? frontPageNumber : backPageNumber,
      "right",
      pages
    );
    const leftMat = createDiaryPageMaterial(
      (direction === 1 ? backPage : frontPage) || { kind: "memory", title: "", blocks: [] },
      direction === 1 ? backPageNumber : frontPageNumber,
      "left",
      pages
    );
    return [
      paper, // +X
      paper, // -X
      paper, // +Y
      paper, // -Y
      rightMat, // +Z face (up on right stack)
      leftMat,  // -Z face (up on left stack)
    ];
  }, [frontPage, backPage, frontPageNumber, backPageNumber, direction, pages]);

  useFrame(() => {
    if (!meshRef.current || !geometry?.userData?.restPositions) return;
    const position = geometry.attributes.position;
    const rest = geometry.userData.restPositions;
    const rawProgress = THREE.MathUtils.clamp(progressRef.current.value, 0, 1);

    // Natural smoothstep easing (acceleration and deceleration)
    const p = rawProgress * rawProgress * (3 - 2 * rawProgress);
    const sinPiP = Math.sin(Math.PI * p);

    if (direction === 1) {
      // ==========================================
      // RIGHT -> LEFT TURN
      // Inner edge remains attached to gutter hinge
      // Outer edge lifts first, curls over spine, settles on left
      // ==========================================
      const spineX = THREE.MathUtils.lerp(GUTTER_W / 2, -GUTTER_W / 2, p);
      const A = 1.72 * sinPiP;
      const c = 0.28 + 0.44 * p;
      const theta0 = Math.PI * p - A * c;

      for (let i = 0; i < position.count; i++) {
        const idx = i * 3;
        const lx = rest[idx];     // 0 (spine hinge) to PAGE_W (outer edge)
        const ly = rest[idx + 1]; // -PAGE_H/2 to +PAGE_H/2
        const lz = rest[idx + 2]; // -PAGE_DEPTH/2 to +PAGE_DEPTH/2

        const u = THREE.MathUtils.clamp(lx / PAGE_W, 0, 1);
        const cornerLift = 0.16 * sinPiP * Math.pow(u, 1.3) * (ly / (PAGE_H * 0.5));
        const theta = theta0 + A * u + 0.20 * sinPiP * u * (ly / (PAGE_H * 0.5));

        // Exact closed-form arc-length integration (inextensible paper sheet)
        let deltaX, deltaZ;
        if (Math.abs(A) < 0.001) {
          deltaX = u * PAGE_W * Math.cos(Math.PI * p);
          deltaZ = u * PAGE_W * Math.sin(Math.PI * p);
        } else {
          deltaX = (PAGE_W / A) * (Math.sin(theta0 + A * u) - Math.sin(theta0));
          deltaZ = (PAGE_W / A) * (-Math.cos(theta0 + A * u) + Math.cos(theta0));
        }

        // Physical paper thickness along local surface normal
        const normalX = -Math.sin(theta) * lz;
        const normalZ = Math.cos(theta) * lz;

        // Subtle stack curvature when landing/resting
        const restCurv = (-0.016 * Math.exp(-u * 8) + 0.022 * u * u) * (1 - sinPiP);

        const vx = spineX + deltaX + normalX;
        const vy = ly;
        const vz = 0.146 + deltaZ + normalZ + cornerLift + restCurv;

        position.setXYZ(i, vx, vy, vz);
      }
    } else {
      // ==========================================
      // LEFT -> RIGHT TURN (exact reverse physics)
      // Inner edge remains attached to gutter hinge
      // Outer edge on left lifts first, curls over spine, settles on right
      // ==========================================
      const spineX = THREE.MathUtils.lerp(-GUTTER_W / 2, GUTTER_W / 2, p);
      const A = 1.72 * sinPiP;
      const c = 0.28 + 0.44 * (1 - p);
      const theta0 = Math.PI * (1 - p) + A * c;

      for (let i = 0; i < position.count; i++) {
        const idx = i * 3;
        const lx = rest[idx];     // 0 (spine hinge) to PAGE_W (outer edge)
        const ly = rest[idx + 1];
        const lz = rest[idx + 2];

        const u = THREE.MathUtils.clamp(lx / PAGE_W, 0, 1);
        const cornerLift = 0.16 * sinPiP * Math.pow(u, 1.3) * (ly / (PAGE_H * 0.5));
        const theta = theta0 - A * u - 0.20 * sinPiP * u * (ly / (PAGE_H * 0.5));

        // Exact closed-form arc-length integration
        let deltaX, deltaZ;
        if (Math.abs(A) < 0.001) {
          deltaX = -u * PAGE_W * Math.cos(Math.PI * (1 - p));
          deltaZ = u * PAGE_W * Math.sin(Math.PI * (1 - p));
        } else {
          deltaX = -(PAGE_W / A) * (Math.sin(theta0 - A * u) - Math.sin(theta0));
          deltaZ = (PAGE_W / A) * (Math.cos(theta0 - A * u) - Math.cos(theta0));
        }

        const normalX = Math.sin(theta) * lz;
        const normalZ = -Math.cos(theta) * lz;

        const restCurv = (-0.016 * Math.exp(-u * 8) + 0.022 * u * u) * (1 - sinPiP);

        const vx = spineX + deltaX + normalX;
        const vy = ly;
        const vz = 0.146 + deltaZ + normalZ + cornerLift + restCurv;

        position.setXYZ(i, vx, vy, vz);
      }
    }

    position.needsUpdate = true;
    geometry.computeVertexNormals();

    // Moving dynamic underside shadow cast across the book and desk
    if (shadowRef.current) {
      const shadowX = direction === 1
        ? THREE.MathUtils.lerp(PAGE_W / 2 + GUTTER_W / 2, -PAGE_W / 2 - GUTTER_W / 2, p)
        : THREE.MathUtils.lerp(-PAGE_W / 2 - GUTTER_W / 2, PAGE_W / 2 + GUTTER_W / 2, p);
      shadowRef.current.position.x = shadowX;
      shadowRef.current.material.opacity = 0.42 * sinPiP;
    }
  });

  return (
    <group position={[0, 0, 0.146]} visible={Boolean(direction)}>
      {/* Moving page underside shadow */}
      <mesh ref={shadowRef} position={[PAGE_W / 2, 0, 0.002]}>
        <planeGeometry args={[PAGE_W * 0.88, PAGE_H * 0.94]} />
        <meshBasicMaterial color="#1a1114" transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* Real physical turning page mesh */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={materials}
        castShadow
        receiveShadow
      />
    </group>
  );
}
/* =========================================================
   COVER
========================================================= */

function Cover({ opened, onToggle, openProgress }) {
  const pivot = useRef();
  const claspRef = useRef();
  const coverGeometry = useMemo(() => createCoverGeometry(), []);
  const frontGeometry = useMemo(
    () => createPanelGeometry(COVER_W - 0.12, COVER_H - 0.12, 0.055),
    []
  );
  const liningGeometry = useMemo(
    () => createPanelGeometry(COVER_W - 0.24, COVER_H - 0.24, 0.045),
    []
  );

  useFrame(() => {
    if (!pivot.current) return;
    const p = openProgress.current.value;
    // Cubic smoothstep for natural acceleration and deceleration
    const s = p * p * (3 - 2 * p);
    
    // The spine is the fixed hinge at X=0.
    // Negative half-turn swings front cover from right to left above desk
    pivot.current.rotation.y = -Math.PI * s;
    
    // Physical parabolic lift: lifts upward in mid-flight to clear the spine and cushion landing
    const midLift = 0.10 * Math.sin(Math.PI * p);
    pivot.current.position.z = THREE.MathUtils.lerp(0.166, 0.022, s) + midLift;

    // Subtle clasp disengagement on open, re-engagement on close
    if (claspRef.current) {
      const claspVisible = p < 0.12;
      claspRef.current.visible = claspVisible;
      if (claspVisible) {
        const claspScale = THREE.MathUtils.clamp((0.12 - p) / 0.12, 0, 1);
        claspRef.current.scale.set(claspScale, 1, claspScale);
      }
    }
  });

  const toggle = event => {
    event.stopPropagation();
    onToggle();
  };

  return (
    <group ref={pivot} position={[0, 0, 0.166]}>
      <mesh geometry={coverGeometry} material={leather} castShadow receiveShadow />
      <mesh
        geometry={liningGeometry}
        material={liningMaterial}
        position={[0.12, 0, -COVER_DEPTH / 2 - 0.016]}
        onClick={toggle}
      />
      <mesh
        geometry={frontGeometry}
        material={coverMaterial}
        position={[0.06, 0, COVER_DEPTH / 2 + 0.016]}
        onClick={toggle}
      />
      <mesh
        ref={claspRef}
        position={[COVER_W - 0.16, 0, COVER_DEPTH / 2 + 0.024]}
        castShadow
      >
        <boxGeometry args={[0.12, 0.34, 0.025]} />
        <primitive object={gold} attach="material" />
      </mesh>
    </group>
  );
}

/* =========================================================
   SPINE
========================================================= */

function Spine() {
  return (
    <group position={[0, 0, 0.08]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[SPINE_W, COVER_H - 0.12, 0.156]} />
        <meshStandardMaterial color="#252027" roughness={0.9} />
      </mesh>
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * (SPINE_W / 2 - 0.035), 0, 0.078]}>
          <boxGeometry args={[0.008, COVER_H - 0.34, 0.008]} />
          <primitive object={gold} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* =========================================================
   PAGE BLOCK
========================================================= */

function PageBlock({ side, visible = true }) {
  const centerX = side === "right"
    ? GUTTER_W / 2 + PAGE_W / 2
    : -GUTTER_W / 2 - PAGE_W / 2;
  const outerX = centerX + (side === "right" ? PAGE_W / 2 : -PAGE_W / 2);
  return (
    <group visible={visible}>
      <mesh position={[centerX, 0, 0.092]} receiveShadow castShadow>
        <boxGeometry args={[PAGE_W, PAGE_H, 0.10]} />
        <meshStandardMaterial color="#ded5c5" roughness={0.96} />
      </mesh>
      {Array.from({ length: 4 }, (_, index) => (
        <mesh key={index} position={[outerX, 0, 0.13 - index * 0.018]}>
          <boxGeometry args={[0.009, PAGE_H - 0.14, 0.004]} />
          <meshStandardMaterial color={index % 2 ? "#cfc3ae" : "#eee6d7"} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function BackCover({ side = "right", visible = true }) {
  const geometry = useMemo(() => createCoverGeometry(), []);
  return (
    <mesh
      geometry={geometry}
      material={leather}
      position={[side === "right" ? 0 : -COVER_W, 0, 0.022]}
      visible={visible}
      castShadow
      receiveShadow
    />
  );
}

/* =========================================================
   BOOKMARK
========================================================= */

function Bookmark() {
  const geometry = useMemo(() => {
    const width = 0.053;
    const top = PAGE_H / 2 - 0.03;
    const bottom = -PAGE_H / 2 - 0.16;
    const shape = new THREE.Shape();
    shape.moveTo(0.035, top);
    shape.lineTo(0.035 + width, top);
    shape.lineTo(0.035 + width + 0.07, bottom + 0.08);
    shape.lineTo(0.035 + width / 2 + 0.07, bottom);
    shape.lineTo(0.035 + 0.07, bottom + 0.08);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);
  const edgeGeometry = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  return (
    <group position={[0, 0, 0.19]} rotation={[0, 0, -0.012]}>
      <mesh geometry={geometry} castShadow raycast={() => null}>
        <meshStandardMaterial color="#b5566a" roughness={0.72} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={edgeGeometry} position={[0, 0, 0.001]} raycast={() => null}>
        <lineBasicMaterial color="#843d4c" transparent opacity={0.72} />
      </lineSegments>
    </group>
  );
}


/* =========================================================
   DIARY
========================================================= */

function Diary({ opened, setOpened, openProgress, pages, activeIndex, setActiveIndex, editor, pageEvents, turnControlRef }) {
  const maxLeftIndex = Math.max(0, Math.floor((pages.length - 1) / 2) * 2);
  const page = Math.min(Math.floor(activeIndex / 2) * 2, maxLeftIndex);
  const [turning, setTurning] = useState(null);
  const isTurningRef = useRef(false);
  const progressRef = useRef({ value: 0 });

  useEffect(() => {
    if (!turning) {
      isTurningRef.current = false;
      return undefined;
    }
    const progress = progressRef.current;
    progress.value = 0;
    const tween = gsap.to(progress, {
      value: 1,
      duration: 1.35,
      ease: "power2.inOut",
      onComplete: () => {
        if (turning.targetIndex !== undefined) {
          setActiveIndex(turning.targetIndex);
        } else {
          setActiveIndex(current => THREE.MathUtils.clamp(current + turning.direction * 2, 0, maxLeftIndex));
        }
        progress.value = 0;
        isTurningRef.current = false;
        setTurning(null);
      },
    });
    return () => {
      tween.kill();
      progress.value = 0;
      isTurningRef.current = false;
    };
  }, [turning]);

  const turnPage = useCallback((direction, targetIdx) => {
    if (!opened || turning || isTurningRef.current) return;
    if (direction > 0 && page >= maxLeftIndex) return;
    if (direction < 0 && page <= 0) return;

    // Pause all playing HTML video and audio elements before page turn
    try {
      document.querySelectorAll('video, audio').forEach((el) => {
        try { el.pause(); } catch {}
      });
    } catch {}

    isTurningRef.current = true;
    progressRef.current.value = 0;
    setTurning({ direction, targetIndex: targetIdx, id: Math.random().toString(36).slice(2) });
  }, [opened, turning, page, maxLeftIndex]);

  useEffect(() => {
    if (turnControlRef) turnControlRef.current = turnPage;
    return () => { if (turnControlRef) turnControlRef.current = null; };
  }, [turnControlRef, turnPage]);

  const leftPage = pages[page];
  const rightPage = pages[page + 1];
  const followingPage = pages[page + 2];
  const previousPage = pages[page - 1];

  const leftGroupRef = useRef();
  const [leftOpenVisible, setLeftOpenVisible] = useState(opened);
  const [rightOpenVisible, setRightOpenVisible] = useState(opened);

  useFrame(() => {
    const p = openProgress.current.value;
    // Left open pages become visible once the front cover swings past vertical towards the left
    const shouldLeftBeVisible = p >= 0.35;
    if (shouldLeftBeVisible !== leftOpenVisible) {
      setLeftOpenVisible(shouldLeftBeVisible);
    }
    // Right page leaf only needs to render when the cover is opening/open
    const shouldRightBeVisible = p >= 0.03;
    if (shouldRightBeVisible !== rightOpenVisible) {
      setRightOpenVisible(shouldRightBeVisible);
    }

    // Physical settling of the left page stack onto the desk during opening / lifting on close
    if (leftGroupRef.current && shouldLeftBeVisible) {
      const t = THREE.MathUtils.clamp((p - 0.35) / 0.65, 0, 1);
      const e = 1 - t;
      const settleZ = 0.05 * e * e;
      const settleRotY = 0.10 * e * e;
      leftGroupRef.current.position.z = settleZ;
      leftGroupRef.current.rotation.y = settleRotY;
    }
  });

  return (
    <group
      position={[0, -0.36, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <BackCover side="right" />
      {/* Left side: lands and settles cushion-soft as cover opens, lifts back when closing */}
      <group ref={leftGroupRef}>
        <PageBlock side="left" visible={leftOpenVisible} />
        <DiaryPage
          side="left"
          page={turning?.direction === -1 ? (pages[page - 2] || leftPage) : leftPage}
          backPage={previousPage}
          pageNumber={turning?.direction === -1 ? Math.max(1, page - 1) : page + 1}
          backPageNumber={Math.max(1, page - 1)}
          pages={pages}
          editor={editor}
          pageEvents={pageEvents}
          onPageClick={pageEvents.onPageClick}
          visible={leftOpenVisible}
          onTurn={() => turnPage(-1)}
        />
      </group>
      <PageBlock side="right" />
      <Spine />
      <DiaryPage
        side="right"
        page={turning?.direction === 1 ? (pages[page + 3] || rightPage) : rightPage}
        backPage={followingPage}
        pageNumber={turning?.direction === 1 ? page + 4 : page + 2}
        backPageNumber={page + 3}
        pages={pages}
        editor={editor}
        pageEvents={pageEvents}
        onPageClick={pageEvents.onPageClick}
        visible={rightOpenVisible}
        onTurn={() => turnPage(1)}
      />
      {turning && (
        <TurningPage
          key={`turning-${turning.id}`}
          direction={turning.direction}
          progressRef={progressRef}
          frontPage={turning.direction === 1 ? rightPage : leftPage}
          backPage={turning.direction === 1 ? (pages[page + 2] || followingPage) : (pages[page - 1] || previousPage)}
          frontPageNumber={turning.direction === 1 ? page + 2 : page + 1}
          backPageNumber={turning.direction === 1 ? page + 3 : Math.max(1, page - 1)}
          pages={pages}
        />
      )}
      <Cover
        opened={opened}
        openProgress={openProgress}
        onToggle={() => setOpened(value => !value)}
      />
      <Bookmark />
    </group>
  );
}


/* =========================================================
   DESK
========================================================= */

function ContactShadow({ openProgress }) {
  const leftShadowRef = useRef();
  const rightShadowRef = useRef();

  useFrame(() => {
    const progress = openProgress?.current?.value ?? 0;
    if (leftShadowRef.current) {
      const s = THREE.MathUtils.clamp((progress - 0.35) / 0.65, 0, 1);
      leftShadowRef.current.material.opacity = THREE.MathUtils.lerp(0, 0.42, s);
      const scale = THREE.MathUtils.lerp(0.92, 1.0, s);
      leftShadowRef.current.scale.set(scale, scale, 1);
    }
    if (rightShadowRef.current) {
      rightShadowRef.current.material.opacity = THREE.MathUtils.lerp(0.44, 0.40, progress);
    }
  });

  return (
    <group
      position={[0, -0.358, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <mesh
        ref={rightShadowRef}
        position={[COVER_W / 2, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[COVER_W * 1.25, COVER_H * 1.18]} />
        <meshBasicMaterial
          map={contactShadowTexture}
          color="#160c0c"
          transparent
          opacity={0.44}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        ref={leftShadowRef}
        position={[-COVER_W / 2, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[COVER_W * 1.25, COVER_H * 1.18]} />
        <meshBasicMaterial
          map={contactShadowTexture}
          color="#160c0c"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function WorldDesk() {
  return (
    <group>
      <mesh
        position={[0, -0.36, -1]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[18, 16]} />
        <meshBasicMaterial
          map={deskPhotoTexture}
          alphaMap={deskFadeTexture}
          transparent
          opacity={0.94}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        position={[0, -0.357, -1]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[18, 16]} />
        <shadowMaterial color="#170c0b" opacity={0.28} />
      </mesh>
    </group>
  );
}

function CameraRig({ openProgress }) {
  const { camera, size } = useThree();

  useFrame(() => {
    if (!camera) return;
    const progress = THREE.MathUtils.clamp(openProgress.current.value, 0, 1);
    const aspect = size.width / Math.max(size.height, 1);

    // Natural smoothstep curve for physically continuous camera acceleration & deceleration
    const s = progress * progress * (3 - 2 * progress);

    // Target coordinates:
    // Closed target: center of the closed book on the desk (X = COVER_W / 2 = 1.67, Y = -0.204, Z = 0)
    // Open target: center spine of the open spread (X = 0, Y = -0.204, Z = 0)
    const targetX = THREE.MathUtils.lerp(COVER_W / 2, 0, s);
    const targetY = -0.204;
    const targetZ = 0;

    // FOV: 34 deg closed, 30 deg open for a calm, crisp, distortion-free top-down writing perspective
    const fov = THREE.MathUtils.lerp(34, 30, s);

    // Distance calculation for open writing view:
    const halfFovRad = THREE.MathUtils.degToRad(30 / 2);
    const spreadW = PAGE_W * 2 + GUTTER_W + 0.8;
    const spreadH = COVER_H + 0.7;
    const fitH = (spreadH / 2) / Math.tan(halfFovRad);
    const fitW = (spreadW / 2) / (Math.tan(halfFovRad) * Math.max(aspect, 0.4));
    const openDist = THREE.MathUtils.clamp(Math.max(fitH, fitW) * 1.06, 9.2, 24);

    // Closed distance & cinematic elevation:
    // Closed elevation: 54 deg (cinematic perspective framing cover, thickness, spine, bookmark ribbon and desk)
    // Open elevation: EXACTLY 90 deg (true perpendicular top-down writing view)
    const closedElevation = THREE.MathUtils.degToRad(54);
    const openElevation = Math.PI / 2;
    const elevation = THREE.MathUtils.lerp(closedElevation, openElevation, s);

    const closedDist = 7.6;
    const distance = THREE.MathUtils.lerp(closedDist, openDist, s);

    if (progress >= 0.999) {
      // TRUE 90Â° TOP-DOWN VIEW: strictly perpendicular to page surface
      camera.position.set(0, targetY + openDist, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, targetY, 0);
    } else {
      camera.position.set(
        targetX,
        targetY + distance * Math.sin(elevation),
        targetZ + distance * Math.cos(elevation)
      );
      camera.up.set(0, Math.cos(elevation), -Math.sin(elevation));
      camera.lookAt(targetX, targetY, targetZ);
    }

    camera.fov = fov;
    camera.updateProjectionMatrix();
  });

  return null;
}

/* =========================================================
   SCENE
========================================================= */

function Scene({ opened, setOpened, pages, activeIndex, setActiveIndex, editor, pageEvents, turnControlRef }) {
  const openProgress = useRef({ value: 0 });

  useEffect(() => {
    const tween = gsap.to(openProgress.current, {
      value: opened ? 1 : 0,
      duration: 1.85,
      delay: opened ? 0.04 : 0,
      ease: "power2.inOut",
    });
    return () => tween.kill();
  }, [opened]);

  return (
    <Canvas
      shadows="variance"
      dpr={[1, 2]}
      camera={{
        position: [1.67, 5.95, 4.47],
        fov: 34,
      }}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference:
          "high-performance"
      }}
    >
      <ambientLight intensity={0.52} />
      <directionalLight
        position={[-4, 8, 6]}
        color="#ffd8b2"
        intensity={2.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[4, 3, -3]} intensity={2.8} distance={12} color="#bd718d" />
      <pointLight position={[1, 4, 6]} intensity={4.2} distance={14} color="#f1d9bd" />
      <WorldDesk />
      <CameraRig openProgress={openProgress} />
      <ContactShadow openProgress={openProgress} />
      <LiveDiaryVideos />
      <Diary opened={opened} setOpened={setOpened} openProgress={openProgress} pages={pages} activeIndex={activeIndex} setActiveIndex={setActiveIndex} editor={editor} pageEvents={pageEvents} turnControlRef={turnControlRef} />
    </Canvas>
  );
}


/* =========================================================
   APP
========================================================= */

export default function App() {
  const [pages, setPages] = useState(() => import.meta.env.PROD ? [] : loadDiary());
  const [activeIndex, setActiveIndex] = useState(0);
  const [opened, setOpened] = useState(false);
  const [editor, setEditor] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewPublished, setPreviewPublished] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const previewReturnIndex = useRef(0);
  const [spellCheck, setSpellCheck] = useState(() => {
    if (import.meta.env.PROD) return false;
    try {
      return localStorage.getItem('project-d-spell-check-v1') === 'true';
    } catch {
      return false;
    }
  });
  const [inkColor, setInkColor] = useState(() => {
    if (import.meta.env.PROD) return INK_THEMES[0].color;
    try {
      return localStorage.getItem('project-d-ink-v1') || INK_THEMES[0].color;
    } catch {
      return INK_THEMES[0].color;
    }
  });
  const [videoAssetUrls, setVideoAssetUrls] = useState({});
  const videoObjectUrlsRef = useRef(new Set());
  const turnControl = useRef(null);
  const isReadOnly = import.meta.env.PROD || previewPublished;
  const displayPages = previewPublished && previewDocument ? previewDocument.pages : pages;
  const displayInkColor = previewPublished
    ? previewDocument?.inkColor || inkColor
    : inkColor;
  const current = displayPages[activeIndex];

  useEffect(() => {
    if (import.meta.env.PROD) return;
    try {
      localStorage.setItem('project-d-spell-check-v1', String(spellCheck));
    } catch {
      // Keep the current setting for this session if storage is unavailable.
    }
  }, [spellCheck]);

  useEffect(() => {
    if (import.meta.env.PROD) return;
    try {
      localStorage.setItem('project-d-ink-v1', inkColor);
    } catch {
      // Keep the current setting for this session if storage is unavailable.
    }
  }, [inkColor]);

  // UI mode store
  const {
    mode,
    activePageId,
    setMode,
    setActivePage,
    selectedBlockId,
    setSelectedBlock,
    toast,
    showToast,
    cursorHidden,
    toggleCursorHidden,
  } = useUI();
  const surfaceMode = isReadOnly ? 'read' : mode;

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let active = true;
    loadPublishedDiary()
      .then((published) => {
        if (!active) return;
        setPages(published.pages);
        if (published.inkColor) setInkColor(published.inkColor);
      })
      .catch((error) => {
        console.error('Failed to load published diary:', error);
        if (!active) return;
        setPages(emptyPublishedPages());
        showToast(error.message);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    const spreadLeft = Math.floor(activeIndex / 2) * 2;
    setActivePage(displayPages[spreadLeft]?.id || current?.id || null);
  }, [activeIndex, displayPages, setActivePage, current]);

  const scenePages = useMemo(() => displayPages.map(page => ({
    ...page,
    fields: page.fields?.photoAssetId
      ? { ...page.fields, photoSrc: videoAssetUrls[page.fields.photoAssetId] || page.fields.photoSrc || "" }
      : page.fields?.photoSrc || page.data?.profilePhoto?.src
        ? { ...page.fields, photoSrc: page.fields?.photoSrc || page.data?.profilePhoto?.src }
        : page.fields,
    blocks: (page.blocks || []).map(block => ({
      ...block,
      ...(block.assetId ? { videoSrc: videoAssetUrls[block.assetId] || block.data?.src || "" } : {}),
      ...(block.imageAssetId ? { imageSrc: videoAssetUrls[block.imageAssetId] || block.data?.src || "" } : {}),
      ...(block.type === 'video' && block.data?.src ? { videoSrc: block.data.src } : {}),
      ...(block.type === 'photo' && block.data?.src ? { imageSrc: block.data.src } : {}),
    })),
  })), [displayPages, videoAssetUrls]);

  useEffect(() => {
    if (!import.meta.env.PROD) saveDiary(pages);
  }, [pages]);

  const handleExportForPublishing = async () => {
    setActionsOpen(false);
    setExportStatus('Starting export…');
    let mediaWarning = '';
    const updateExportStatus = (status) => {
      if (status.startsWith('Large media over 50 MB:') || status.startsWith('Media over 50 MB:')) {
        mediaWarning = status;
      }
      setExportStatus(mediaWarning && status !== mediaWarning
        ? `${status}\n${mediaWarning}`
        : status);
    };
    try {
      const message = await exportDiary(pages, inkColor, updateExportStatus);
      setExportStatus(message);
    } catch (error) {
      console.error('Failed to export diary for publishing:', error);
      setExportStatus(`Export failed: ${error.message}${mediaWarning ? `\n${mediaWarning}` : ''}`);
    }
  };

  const handlePreviewPublished = async () => {
    setActionsOpen(false);
    setExportStatus('Loading published version…');
    try {
      const published = await loadPublishedDiary();
      previewReturnIndex.current = activeIndex;
      setPreviewDocument(published);
      setPreviewPublished(true);
      setActiveIndex(0);
      setEditor(null);
      setSelectedBlock(null);
      setMode('read');
      setExportStatus('');
    } catch (error) {
      console.error('Failed to load published diary preview:', error);
      setExportStatus('');
      showToast(error.message);
    }
  };

  const handleReturnToEditing = () => {
    setPreviewPublished(false);
    setActiveIndex(Math.min(previewReturnIndex.current, Math.max(0, pages.length - 1)));
    setMode('read');
    setActionsOpen(false);
  };

  const warnForLargeVideo = (file) => {
    if (import.meta.env.DEV && file.size > 30 * 1024 * 1024) {
      showToast('Large videos make publishing slow. GitHub rejects files over 100MB.');
    }
  };

  // Global keyboard shortcuts — E=write, Esc=read, arrows=page turn
  useEffect(() => {
    const onKey = (e) => {
      // Must NOT preventDefault or intercept when target is an input, textarea or contenteditable
      if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'Escape') { setMode('read'); setEditor(null); return; }
      if (!isReadOnly && (e.key === 'e' || e.key === 'E') && opened) { setMode('write'); return; }
      if (opened) {
        if (e.key === 'ArrowRight') { e.preventDefault(); turnControl.current?.(1); setEditor(null); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); turnControl.current?.(-1); setEditor(null); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opened, isReadOnly, setMode]);

  const updatePage = (id, changes) => setPages(all => all.map(page => page.id === id ? { ...page, ...changes, revision: (page.revision || 0) + 1 } : page));
  const updateField = (pageId, key, value) => {
    const targetId = pageId || current?.id;
    if (!targetId) return;
    if (["title", "date", "mood", "dates"].includes(key)) updatePage(targetId, { [key]: value });
    else {
      const pageObj = pages.find(p => p.id === targetId);
      updatePage(targetId, { fields: { ...(pageObj?.fields || {}), [key]: value } });
    }
  };
  const updateBlock = (pageId, blockId, changes) => {
    const target = pages.find(page => page.id === pageId);
    if (!target) return;
    updatePage(pageId, { blocks: (target.blocks || []).map(block => block.id === blockId ? { ...block, ...changes } : block) });
  };
  const revokeAsset = assetId => {
    if (!assetId) return;
    const url = videoAssetUrls[assetId];
    if (url) { URL.revokeObjectURL(url); videoObjectUrlsRef.current.delete(url); }
    setVideoAssetUrls(all => { const next = { ...all }; delete next[assetId]; return next; });
    deleteVideoAsset(assetId).catch(() => {});
  };
  const profilePhotoMediaIsUsedElsewhere = (mediaId, ownerPageId) => pages.some(page => {
    if (page.id !== ownerPageId && page.fields?.photoAssetId === mediaId) return true;
    if ((page.blocks || []).some(block =>
      block.mediaId === mediaId ||
      block.assetId === mediaId ||
      block.imageAssetId === mediaId ||
      block.data?.mediaId === mediaId
    )) return true;
    if (page.id !== ownerPageId) {
      const profileMediaId = Object.prototype.hasOwnProperty.call(page.data || {}, 'profilePhoto')
        ? page.data.profilePhoto?.mediaId
        : page.fields?.photoAssetId;
      if (profileMediaId === mediaId) return true;
    }
    return false;
  });
  const removeProfilePhotoAssetIfUnused = async (mediaId, ownerPageId) => {
    if (!mediaId || profilePhotoMediaIsUsedElsewhere(mediaId, ownerPageId)) return;
    const url = videoAssetUrls[mediaId];
    if (url) {
      URL.revokeObjectURL(url);
      videoObjectUrlsRef.current.delete(url);
      setVideoAssetUrls(all => {
        const next = { ...all };
        delete next[mediaId];
        return next;
      });
    }
    await deleteMediaAsset(mediaId);
  };
  const handleProfilePhotoUpload = async (pageId, file) => {
    try {
      const mediaId = await saveMedia(file, 'photo');
      const target = pages.find(page => page.id === pageId);
      const previousMediaId = target?.data?.profilePhoto?.mediaId ||
        (!Object.prototype.hasOwnProperty.call(target?.data || {}, 'profilePhoto') ? target?.fields?.photoAssetId : null);
      updatePage(pageId, {
        data: {
          ...(target?.data || {}),
          profilePhoto: { mediaId, focusX: 50, focusY: 50, zoom: 1 },
        },
      });
      if (target?.fields?.photoAssetId) {
        updatePage(pageId, { fields: { ...target.fields, photoAssetId: null } });
      }
      if (previousMediaId && previousMediaId !== mediaId) {
        await removeProfilePhotoAssetIfUnused(previousMediaId, pageId);
      }
    } catch (error) {
      console.error('Error saving profile photo:', error);
      showToast("Couldn't save profile photo");
    }
  };
  const handleProfilePhotoUpdate = (pageId, changes) => {
    const target = pages.find(page => page.id === pageId);
    if (!target) return;
    const existing = target.data?.profilePhoto || {
      mediaId: target.fields?.photoAssetId,
      focusX: 50,
      focusY: 50,
      zoom: 1,
    };
    updatePage(pageId, {
      data: { ...(target.data || {}), profilePhoto: { ...existing, ...changes } },
    });
  };
  const handleProfilePhotoRemove = async (pageId) => {
    const target = pages.find(page => page.id === pageId);
    const mediaId = target?.data?.profilePhoto?.mediaId || target?.fields?.photoAssetId;
    updatePage(pageId, {
      data: { ...(target?.data || {}), profilePhoto: null },
      fields: { ...(target?.fields || {}), photoAssetId: null },
    });
    try {
      await removeProfilePhotoAssetIfUnused(mediaId, pageId);
    } catch (error) {
      console.error('Error removing profile photo media:', error);
      showToast("Couldn't remove profile photo");
    }
  };
  const continueToNextPage = (pageId) => {
    const currentPageIndex = pages.findIndex(page => page.id === pageId);
    if (currentPageIndex < 0) return;
    let nextPage = pages[currentPageIndex + 1];
    let nextPages = pages;
    if (!nextPage || nextPage.kind !== 'memory') {
      nextPage = makeMemoryPage();
      nextPages = [...pages, nextPage];
      setPages(nextPages);
    }
    const nextPageIndex = nextPages.findIndex(page => page.id === nextPage.id);
    const currentSpread = Math.floor(currentPageIndex / 2) * 2;
    const nextSpread = Math.floor(nextPageIndex / 2) * 2;
    setMode('write');
    setEditor(null);
    if (nextSpread === currentSpread) {
      setActiveIndex(nextPageIndex);
    } else {
      setTimeout(() => turnControl.current?.(1, nextPageIndex), 50);
    }
    const mainTextBlock = (nextPage.blocks || []).find(block => block.mainText);
    if (mainTextBlock) {
      setTimeout(() => setSelectedBlock(mainTextBlock.id), 900);
    }
  };
  const addContent = (pageId, type) => {
    const target = pages.find((p) => p.id === pageId) || current;
    if (!target) return;
    if (type === "date") {
      const entry = { id: crypto.randomUUID(), date: "", title: "", type: "Special date", note: "" };
      updatePage(target.id, { dates: [...(target.dates || []), entry] });
      setEditor({ pageId: target.id, kind: "date-entry", dateId: entry.id, row: (target.dates || []).length });
      return;
    }
    const id = crypto.randomUUID();
    if (type === "text") {
      const spot = findFreeSpot(target.blocks || [], 360, LINE * 3) || { x: MARGIN_X, y: GRID_TOP };
      const snappedY = GRID_TOP + Math.round((spot.y - GRID_TOP) / LINE) * LINE;
      const block = {
        id,
        type: 'text',
        x: spot.x,
        y: snappedY,
        top: snappedY,
        width: 360,
        height: LINE * 3,
        fontSize: BODY_SIZE,
        style: 'body',
        mainText: false,
        text: '',
        html: '',
      };
      updatePage(target.id, { blocks: [...(target.blocks || []), block] });
      setSelectedBlock(id);
      return;
    }
    if (type === "checklist") {
      const spot = findFreeSpot(target.blocks || [], 450, 140) || { x: MARGIN_X, y: GRID_TOP };
      const snappedY = GRID_TOP + Math.round((spot.y - GRID_TOP) / LINE) * LINE;
      const block = {
        id,
        type: 'checklist',
        x: spot.x,
        y: snappedY,
        top: snappedY,
        width: 450,
        items: [{ id: crypto.randomUUID(), text: '', done: false }],
      };
      updatePage(target.id, { blocks: [...(target.blocks || []), block] });
      setSelectedBlock(id);
      return;
    }
    if (type === "video") {
      const spot = findFreeSpot(target.blocks || [], 340, 240) || { x: MARGIN_X, y: GRID_TOP };
      const block = {
        id,
        type: 'video',
        x: spot.x,
        y: spot.y,
        top: spot.y,
        width: 340,
        height: 240,
        url: '',
      };
      updatePage(target.id, { blocks: [...(target.blocks || []), block] });
      setSelectedBlock(id);
      return;
    }
  };
  const loadImageFile = async (event, callback) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const image = new Image();
      const sourceUrl = URL.createObjectURL(file);
      image.onload = async () => {
        URL.revokeObjectURL(sourceUrl);
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.82));
        if (!blob) return;
        const assetId = await saveImageAsset(blob);
        const url = URL.createObjectURL(blob);
        videoObjectUrlsRef.current.add(url);
        setVideoAssetUrls(all => ({ ...all, [assetId]: url }));
        callback(assetId);
      };
      image.onerror = () => URL.revokeObjectURL(sourceUrl);
      image.src = sourceUrl;
    } catch { setEditor(null); }
  };
  const onImage = (event, field, blockId) => loadImageFile(event, assetId => {
    if (!current) return;
    if (field === "photo") {
      const previousAsset = current.fields?.photoAssetId;
      updatePage(current.id, { fields: { ...(current.fields || {}), photoAssetId: assetId } });
      if (previousAsset) revokeAsset(previousAsset);
    } else if (blockId) {
      const previousAsset = current.blocks?.find(block => block.id === blockId)?.imageAssetId;
      updateBlock(current.id, blockId, { imageAssetId: assetId, url: "" });
      if (previousAsset) revokeAsset(previousAsset);
    } else {
      const layout = getMemoryBlockRects(current);
      const id = crypto.randomUUID();
      const top = editor?.y || Math.max(278, (layout.at(-1)?.bottom || 260) + 24);
      updatePage(current.id, { blocks: [...(current.blocks || []), { id, type: "photo", imageAssetId: assetId, top, x: 84, y: top - 30, width: 300, height: 170, rotation: Math.round(Math.random() * 6 - 3), caption: "" }] });
    }
    setEditor(null);
  });
  const onVideoUpload = async (event, blockId) => {
    const file = event.target.files?.[0];
    if (!file || !current) return;
    warnForLargeVideo(file);
    const previous = current.blocks?.find(block => block.id === blockId);
    try {
      const assetId = await saveVideoAsset(file);
      const url = URL.createObjectURL(file);
      videoObjectUrlsRef.current.add(url);
      setVideoAssetUrls(all => ({ ...all, [assetId]: url }));
      updateBlock(current.id, blockId, { assetId, url: "" });
      if (previous?.assetId) revokeAsset(previous.assetId);
      setEditor(null);
    } catch { setEditor(null); }
  };
  const onVideoUrlChange = (pageId, blockId, url) => {
    const block = pages.find(page => page.id === pageId)?.blocks?.find(item => item.id === blockId);
    if (block?.assetId) revokeAsset(block.assetId);
    updateBlock(pageId, blockId, { url, assetId: null });
  };
  const removeBlock = (pageId, blockId) => {
    const targetId = pageId || current?.id;
    if (!targetId) return;
    const target = pages.find(page => page.id === targetId);
    if (!target) return;
    const block = target.blocks?.find(item => item.id === blockId);
    if (block?.assetId) revokeAsset(block.assetId);
    if (block?.imageAssetId) revokeAsset(block.imageAssetId);
    if (block?.mediaId) releaseMediaUrl(block.mediaId);
    updatePage(targetId, { blocks: (target.blocks || []).filter(b => b.id !== blockId) });
    setEditor(null);
    setSelectedBlock(null);
  };

  const handleAddBlockDirect = (pageId, newBlock) => {
    const targetPage = pages.find((p) => p.id === pageId);
    if (!targetPage) return;
    const updated = [...(targetPage.blocks || []), newBlock];
    updatePage(pageId, { blocks: updated });
  };

  const moveBlockToPage = (fromPageId, toPageId, blockId, clampedBlock) => {
    setPages((allPages) => {
      return allPages.map((page) => {
        if (page.id === fromPageId) {
          const filtered = (page.blocks || []).filter((b) => b.id !== blockId);
          return { ...page, blocks: filtered };
        }
        if (page.id === toPageId) {
          const maxZ = Math.max(1, ...(page.blocks || []).map((b) => b.z || 1));
          const movedBlock = {
            ...clampedBlock,
            id: blockId,
            z: maxZ + 1,
          };
          const updated = [...(page.blocks || []), movedBlock];
          return { ...page, blocks: updated };
        }
        return page;
      });
    });
    setSelectedBlock(blockId);
  };

  const handleAddMedia = async (targetPageId, kind, file) => {
    if (!file) return;
    const blockType = kind === 'image' || kind === 'photo' ? 'photo' : kind === 'video' ? 'video' : 'audio';
    if (blockType === 'video') warnForLargeVideo(file);

    const spreadLeft = Math.floor(activeIndex / 2) * 2;
    const leftPage = pages[spreadLeft];
    const rightPage = pages[spreadLeft + 1];
    let targetPage = pages.find((p) => p.id === targetPageId) || leftPage || rightPage || current;
    if (!targetPage) return;

    let baseW = blockType === 'photo' ? 300 : blockType === 'video' ? 340 : 320;
    let baseH = blockType === 'photo' ? 230 : blockType === 'video' ? 230 : 90;

    // Detect natural aspect ratio for photos & videos so they are never distorted or blindly cropped
    if (blockType === 'photo') {
      try {
        const bmp = await createImageBitmap(file);
        const aspect = bmp.height / bmp.width;
        bmp.close?.();
        if (aspect > 1) {
          // Portrait photo
          baseW = 240;
          baseH = Math.min(380, Math.round(240 * aspect));
        } else {
          // Landscape / square photo
          baseW = 320;
          baseH = Math.max(160, Math.min(340, Math.round(320 * aspect)));
        }
      } catch (e) {
        baseW = 300;
        baseH = 230;
      }
    } else if (blockType === 'video') {
      try {
        const vMeta = await new Promise((resolve) => {
          const v = document.createElement('video');
          v.preload = 'metadata';
          const tempUrl = URL.createObjectURL(file);
          v.onloadedmetadata = () => {
            const vw = v.videoWidth || 320;
            const vh = v.videoHeight || 240;
            URL.revokeObjectURL(tempUrl);
            resolve({ vw, vh });
          };
          v.onerror = () => {
            URL.revokeObjectURL(tempUrl);
            resolve({ vw: 320, vh: 240 });
          };
          v.src = tempUrl;
        });
        const aspect = vMeta.vh / vMeta.vw;
        baseW = 340;
        baseH = Math.max(180, Math.min(360, Math.round(340 * aspect)));
      } catch (e) {
        baseW = 340;
        baseH = 240;
      }
    }

    let spot = null;
    let chosenW = baseW;
    let chosenH = baseH;

    // 1. Full size
    spot = findFreeSpot(targetPage.blocks || [], chosenW, chosenH);

    // 2. 75% size
    if (!spot) {
      chosenW = Math.round(baseW * 0.75);
      chosenH = Math.round(baseH * 0.75);
      spot = findFreeSpot(targetPage.blocks || [], chosenW, chosenH);
    }

    // 3. 55% size
    if (!spot) {
      chosenW = Math.round(baseW * 0.55);
      chosenH = Math.round(baseH * 0.55);
      spot = findFreeSpot(targetPage.blocks || [], chosenW, chosenH);
    }

    // 4. Try opposite page of the current spread
    const otherSpreadPage = targetPage.id === leftPage?.id ? rightPage : leftPage;
    if (!spot && otherSpreadPage && otherSpreadPage.kind === 'memory') {
      chosenW = baseW;
      chosenH = baseH;
      spot = findFreeSpot(otherSpreadPage.blocks || [], chosenW, chosenH);
      if (!spot) {
        chosenW = Math.round(baseW * 0.75);
        chosenH = Math.round(baseH * 0.75);
        spot = findFreeSpot(otherSpreadPage.blocks || [], chosenW, chosenH);
      }
      if (spot) {
        targetPage = otherSpreadPage;
        const pageIdx = pages.findIndex((p) => p.id === targetPage.id) + 1;
        showToast(`Page is full — added to page ${String(pageIdx).padStart(2, '0')}`);
      }
    }

    // 5. If still null, create next page
    if (!spot) {
      const newPage = makeMemoryPage();
      const newPages = [...pages, newPage];
      setPages(newPages);
      targetPage = newPage;
      chosenW = baseW;
      chosenH = baseH;
      spot = { x: 84, y: 260 };
      const pageIdx = newPages.length;
      showToast(`Spread is full — added to page ${String(pageIdx).padStart(2, '0')}`);
    }

    try {
      const mediaId = await saveMedia(file, blockType);

      const maxZ = Math.max(1, ...(targetPage.blocks || []).map((b) => b.z || 1));
      const clamped = clampToPage({
        x: spot.x,
        y: spot.y,
        w: chosenW,
        h: chosenH,
      });

      const randomRotation = blockType === 'photo'
        ? Math.round((Math.random() * 6 - 3) * 10) / 10
        : 0;

      const newBlock = {
        id: crypto.randomUUID(),
        type: blockType,
        mediaId,
        x: clamped.x,
        y: clamped.y,
        w: clamped.w,
        h: clamped.h,
        width: clamped.w,
        height: clamped.h,
        rotation: randomRotation,
        caption: '',
        z: maxZ + 1,
        data: { mediaId, placement: 'free' },
      };

      const updatedBlocks = [...(targetPage.blocks || []), newBlock];
      updatePage(targetPage.id, { blocks: updatedBlocks });

      setSelectedBlock(newBlock.id);
      setTimeout(() => {
        const el = document.getElementById(`block-${newBlock.id}`);
        if (el) {
          gsap.fromTo(el, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.5)' });
        }
      }, 50);
    } catch (err) {
      console.error('Error saving media:', err);
      showToast(blockType === 'photo' ? "Couldn't add photo" : "Couldn't add media");
    }
  };

  const handleReplaceMedia = async (e, blockId, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (kind === 'video') warnForLargeVideo(file);
    try {
      const mediaId = await saveMedia(file, kind);
      updateBlock(activePageId || current?.id, blockId, { mediaId, data: { mediaId } });
    } catch (err) {
      console.error('Error replacing media:', err);
      showToast("Couldn't replace media");
    }
    e.target.value = '';
  };

  const handleFindCursor = () => {
    locateCursor({
      pages,
      activeIndex,
      onTurnPage: (idx) => turnControl.current?.(idx > activeIndex ? 1 : -1, idx),
      onAddBlock: handleAddBlockDirect,
      onSelectBlock: setSelectedBlock,
    });
  };

  const handleFormatActivePage = () => {
    const targetId = activePageId || current?.id;
    if (!targetId) return;
    const target = pages.find((p) => p.id === targetId);
    if (!target) return;
    const formatted = autoFormatPageBlocks(target.blocks || []);
    updatePage(targetId, { blocks: formatted });
    showToast('Page layout formatted');
  };

  // Entering write mode effect: place cursor, pulse, and show first-time hint
  useEffect(() => {
    if (mode === 'write' && opened) {
      const timer = setTimeout(() => {
        handleFindCursor();
      }, 350);

      const ui = useUI.getState();
      if (!ui.hasShownWriteHint) {
        showToast('Click anywhere on the paper to write');
        ui.markWriteHintShown();
      }

      return () => clearTimeout(timer);
    }
  }, [mode, opened]);

  const pageEvents = {
    mode,
    onField: updateField,
    onBlock: updateBlock,
    onAdd: addContent,
    onAddBlock: handleAddBlockDirect,
    onImage,
    onDeleteBlock: removeBlock,
    onVideoToggle: toggleDiaryVideo,
    onVideoUpload,
    onVideoUrlChange,
    onReplaceMedia: handleReplaceMedia,
    onMoveBlockToPage: moveBlockToPage,
    onPageUpdate: updatePage,
    onProfilePhotoUpload: handleProfilePhotoUpload,
    onProfilePhotoUpdate: handleProfilePhotoUpdate,
    onProfilePhotoRemove: handleProfilePhotoRemove,
    onContinueToNextPage: continueToNextPage,
    onClose: () => setEditor(null),
  };

  const onPageClick = (page, event, side, onTurn, pageNumber) => {
    if (!opened) { setOpened(true); return; }
    let targetPage = page;
    if (!targetPage) {
      if (isReadOnly) return;
      targetPage = makeMemoryPage();
      setPages(all => [...all, targetPage]);
    }

    const point = pagePoint(event);
    const x = point.x;
    const y = point.y;

    // Outer-edge zones always turn pages regardless of mode
    if (x < 24) { onTurn(-1); setEditor(null); return; }
    if (x > 744) { onTurn(1); setEditor(null); return; }

    const clickedIndex = displayPages.findIndex(item => item.id === targetPage.id);
    if (clickedIndex >= 0) setActiveIndex(clickedIndex);
    setActivePage(targetPage.id);
    setActionsOpen(false);

    // In READ mode: index navigation + double-click-to-write, no other editing
    if (surfaceMode === 'read') {
      if (targetPage.kind === "index") {
        const rows = Math.ceil(displayPages.length / 2);
        const step = Math.min(56, 750 / Math.max(rows, 1));
        const column = x >= 384 ? 1 : 0;
        const row = Math.floor((y - 238) / step);
        const index = column * rows + row;
        if (row >= 0 && index < displayPages.length) {
          const curSpread = Math.min(Math.floor(activeIndex / 2) * 2, displayPages.length - 1);
          const tgtSpread = Math.min(Math.floor(index / 2) * 2, displayPages.length - 1);
          if (tgtSpread !== curSpread) turnControl.current?.(tgtSpread > curSpread ? 1 : -1, tgtSpread);
          else setActiveIndex(index);
          setEditor(null);
        }
      }
      // Double-click enters write mode
      if (!isReadOnly && event.detail >= 2) setMode('write');
      return;
    }

    // WRITE MODE — full editing enabled
    if (targetPage.kind === "index") {
      const rows = Math.ceil(displayPages.length / 2);
      const step = Math.min(56, 750 / Math.max(rows, 1));
      const column = x >= 384 ? 1 : 0;
      const row = Math.floor((y - 238) / step);
      const index = column * rows + row;
      if (row >= 0 && index < displayPages.length) {
        const curSpread = Math.min(Math.floor(activeIndex / 2) * 2, displayPages.length - 1);
        const tgtSpread = Math.min(Math.floor(index / 2) * 2, displayPages.length - 1);
        if (tgtSpread !== curSpread) turnControl.current?.(tgtSpread > curSpread ? 1 : -1, tgtSpread);
        else setActiveIndex(index);
        setEditor(null);
      }
      return;
    }

    if (y >= 20 && y <= 105) { setEditor({ pageId: targetPage.id, kind: "title" }); return; }

    if (targetPage.kind === "ownership") {
      if (y >= 180 && y <= 540) return;
      else if (y >= 541 && y <= 660) setEditor({ pageId: targetPage.id, kind: "owner-name" });
      else if (y >= 661 && y <= 860) setEditor({ pageId: targetPage.id, kind: "owner-intro" });
      return;
    }
    if (targetPage.kind === "profile") {
      const row = Math.round((y - 222) / 77);
      if (row >= 0 && row < profileFields.length && Math.abs(y - (222 + row * 77)) < 42) {
        setEditor({ pageId: targetPage.id, kind: "profile-field", field: profileFields[row][0] });
      }
      return;
    }
    if (targetPage.kind === "dates") {
      if (y > 940) { setEditor({ pageId: targetPage.id, kind: "date-add" }); return; }
      const row = Math.floor((y - 220) / Math.min(96, 730 / Math.max((targetPage.dates || []).length, 1)));
      if (row >= 0 && row < (targetPage.dates || []).length) {
        setEditor({ pageId: targetPage.id, kind: "date-entry", dateId: targetPage.dates[row].id, row });
      } else {
        setEditor({ pageId: targetPage.id, kind: "date-add" });
      }
      return;
    }

    if (targetPage.kind === "memory") {
      // Memory pages are completely handled by DiaryOverlay / PageLayer in the DOM
      return;
    }
  };

  const appendMemory = () => {
    setEditor(null);
    const memory = makeMemoryPage(pages.length - 4);
    const nextPages = [...pages, memory];
    setPages(nextPages);
    setActiveIndex(nextPages.length - 1);
    setOpened(true);
    setActionsOpen(false);
  };

  const turnNext = () => {
    setEditor(null);
    if (isReadOnly) {
      if (activeIndex < displayPages.length - 2) turnControl.current?.(1);
      return;
    }
    if (activeIndex >= Math.max(0, pages.length - 2)) {
      const memory1 = makeMemoryPage(pages.length - 4);
      const memory2 = makeMemoryPage(pages.length - 3);
      setPages(all => [...all, memory1, memory2]);
      setTimeout(() => turnControl.current?.(1), 50);
    } else {
      turnControl.current?.(1);
    }
  };

  const deletePage = () => {
    if (!current || !window.confirm("Delete this page from your diary?")) return;
    current.blocks?.forEach(block => {
      if (block.assetId) revokeAsset(block.assetId);
      if (block.imageAssetId) revokeAsset(block.imageAssetId);
    });
    if (current.fields?.photoAssetId) revokeAsset(current.fields.photoAssetId);
    for (const key of videoTextureSources.keys()) if (key.startsWith(`${current.id}:`)) { videoTextureSources.get(key)?.video.pause(); videoTextureSources.delete(key); }
    setPages(all => all.filter(page => page.id !== current.id));
    setActiveIndex(Math.max(0, activeIndex - 1)); setEditor(null); setActionsOpen(false);
  };
  const movePage = direction => {
    const to = activeIndex + direction;
    if (to < 0 || to >= pages.length) return;
    setPages(all => { const next = [...all]; [next[activeIndex], next[to]] = [next[to], next[activeIndex]]; return next; });
    setActiveIndex(to); setActionsOpen(false);
  };

  const firstIndex = displayPages.findIndex(page => page.kind === "index");

  // Spread page numbers for the bottom bar, e.g. "05-06 of 10"
  const spreadLeft = Math.floor(activeIndex / 2) * 2;
  const spreadRight = spreadLeft + 1;
  const spreadLabel = displayPages.length
    ? `${String(spreadLeft + 1).padStart(2, '0')}${spreadRight < displayPages.length ? '\u2013' + String(spreadRight + 1).padStart(2, '0') : ''} of ${displayPages.length}`
    : '';

  // Find the active text block for the FormatBar
  let activeTextBlock = null;
  let activeTextPageId = activePageId || current?.id;

  if (selectedBlockId) {
    for (const p of displayPages) {
      const blk = p.blocks?.find((b) => b.id === selectedBlockId);
      if (blk) {
        activeTextBlock = blk;
        activeTextPageId = p.id;
        break;
      }
    }
  }

  if (!activeTextBlock && editor && editor.kind === 'memory-text') {
    const pg = displayPages.find((p) => p.id === editor.pageId);
    activeTextBlock = pg?.blocks?.find((b) => b.id === editor.blockId) || null;
    if (activeTextBlock) activeTextPageId = editor.pageId;
  }

  return (
    <div className="project-d">
      {/* Toast notification */}
      {toast && <div className="diary-toast">{toast}</div>}
      {exportStatus && <div className="diary-toast">{exportStatus}</div>}

      {/* Top formatting bar - write mode only, slides in via GSAP */}
      {opened && !isReadOnly && (
        <FormatBar
          mode={surfaceMode}
          activeBlock={activeTextBlock}
          onBlockChange={updateBlock}
          onAddContent={addContent}
          onAddMedia={handleAddMedia}
          activePageId={activeTextPageId}
          savedStatus="saved"
        />
      )}

      <div className="scene-stage">
        <Scene
          opened={opened}
          setOpened={setOpened}
          pages={scenePages}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
          editor={editor}
          pageEvents={{ ...pageEvents, onPageClick, mode: surfaceMode, spellCheck }}
          turnControlRef={turnControl}
        />
      </div>

      {opened && displayPages.map((page, index) => (
        page.kind === "ownership" && Math.floor(index / 2) === Math.floor(activeIndex / 2) ? (
          <ProfilePhotoLayer
            key={page.id}
            page={page}
            side={index % 2 === 0 ? "left" : "right"}
            mode={surfaceMode}
            opened={opened}
            visible
            inkColor={displayInkColor}
            onUpload={handleProfilePhotoUpload}
            onUpdate={handleProfilePhotoUpdate}
            onRemove={handleProfilePhotoRemove}
          />
        ) : null
      ))}

      {/* 2D HTML Interactive Page Layer Overlay */}
      <DiaryOverlay
        opened={opened}
        pages={displayPages}
        activeIndex={activeIndex}
        mode={surfaceMode}
        readOnly={isReadOnly}
        onBlockChange={updateBlock}
        onBlockDelete={removeBlock}
        onPageUpdate={updatePage}
        onReplaceMedia={handleReplaceMedia}
        onMoveBlockToPage={moveBlockToPage}
        spellCheck={spellCheck}
        inkColor={displayInkColor}
        onContinueToNextPage={continueToNextPage}
      />

      {!opened && (
        <button className="open-diary-button" onClick={() => setOpened(true)}>Open diary</button>
      )}

      {opened && (
        <nav className="diary-navigation" aria-label="Diary navigation">
          <button
            aria-label="Previous spread"
            disabled={activeIndex < 2}
            onClick={() => { setEditor(null); setSelectedBlock(null); turnControl.current?.(-1); }}
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>

          <span>
            {current?.title || (current?.kind === "memory" ? "Untitled memory" : "Untitled page")}
            <small>{spreadLabel}</small>
          </span>

          {firstIndex >= 0 && (
            <button className="nav-index" onClick={() => { setEditor(null); setSelectedBlock(null); setActiveIndex(firstIndex); }}>
              Index
            </button>
          )}

          {!isReadOnly && (
            <button
              className={`nav-mode-toggle${mode === 'write' ? ' nav-mode-write' : ''}`}
              title={mode === 'read' ? 'Write mode (E)' : 'Reading mode (Esc)'}
              aria-label={mode === 'read' ? 'Enter writing mode' : 'Return to reading mode'}
              onClick={() => {
                if (mode === 'read') setMode('write');
                else { setMode('read'); setEditor(null); setSelectedBlock(null); }
              }}
            >
              {mode === 'write' ? <BookOpen size={18} strokeWidth={1.75} /> : <PenLine size={18} strokeWidth={1.75} />}
            </button>
          )}

          {/* New Page only visible in write mode */}
          {!isReadOnly && mode === 'write' && (
            <button className="nav-new-page" aria-label="Add a blank memory page" onClick={appendMemory}>
              + New Page
            </button>
          )}

          <button aria-label="Page options" onClick={() => setActionsOpen(v => !v)}>
            <MoreHorizontal size={18} strokeWidth={1.75} />
          </button>
          <button aria-label="Next spread" onClick={turnNext}>
            <ChevronRight size={20} strokeWidth={2} />
          </button>
          <button
            className="nav-close"
            aria-label="Close diary"
            title="Close diary"
            onClick={() => { setOpened(false); setEditor(null); setSelectedBlock(null); setActionsOpen(false); setMode('read'); }}
          >
            <X size={18} strokeWidth={2} />
          </button>

          {actionsOpen && (
            <div className="page-actions">
              {previewPublished ? (
                <button onClick={handleReturnToEditing}>Return to editing</button>
              ) : (
                <>
                  <button aria-pressed={spellCheck} onClick={() => setSpellCheck(value => !value)}>
                    Spell check <span>{spellCheck ? 'On' : 'Off'}</span>
                  </button>
                  <div className="ink-setting" role="group" aria-label="Ink color">
                    <span>Ink</span>
                    {INK_THEMES.map(option => (
                      <button
                        key={option.id}
                        type="button"
                        aria-label={option.label}
                        aria-pressed={displayInkColor === option.color}
                        onClick={() => setInkColor(option.color)}
                      >
                        <span className="ink-setting-swatch" style={{ backgroundColor: option.color }} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {!isReadOnly && (
                    <>
                      <button disabled={activeIndex <= 0} onClick={() => movePage(-1)}>Move earlier</button>
                      <button disabled={activeIndex >= pages.length - 1} onClick={() => movePage(1)}>Move later</button>
                      <button className="danger-action" onClick={deletePage}>Delete this page</button>
                    </>
                  )}
                  {import.meta.env.DEV && (
                    <>
                      <button onClick={handlePreviewPublished}>Preview published version</button>
                      <button onClick={handleExportForPublishing}>Export for publishing</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </nav>
      )}
    </div>
  );
}

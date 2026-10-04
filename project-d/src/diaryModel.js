const STORAGE_KEY = "project-d-diary-v1";
const MEDIA_DB = "project-d-media-v1";
const MEDIA_STORE = "videos";

export const openingPages = [
  { id: "ownership", kind: "ownership", title: "This Diary Belongs To", fields: { name: "", introduction: "", photo: "" } },
  { id: "profile", kind: "profile", title: "My Profile", fields: { name: "", nickname: "", birthday: "", flower: "", place: "", song: "", food: "", loves: "", happy: "", other: "" } },
  { id: "index", kind: "index", title: "My Chapters / Index" },
  { id: "dates", kind: "dates", title: "Important Dates", dates: [] },
];

export function createInitialPages() {
  return [
    ...structuredClone(openingPages),
    makeMemoryPage(1),
    makeMemoryPage(2),
    makeMemoryPage(3),
    makeMemoryPage(4),
  ];
}

const isPage = page => page && typeof page.id === "string" && typeof page.title === "string";
const supportedKinds = new Set(["ownership", "profile", "index", "dates", "memory"]);

import { GRID_TOP, LINE, BODY_SIZE, LINE_COUNT, MARGIN_X, PAGE_W } from './constants/pageLayout.js';

export function migratePages(pages) {
  let changed = false;
  const migrated = pages.map((page) => {
    if (page.kind !== 'memory') return page;
    let pageChanged = false;
    // Remove empty text blocks
    const filteredBlocks = (page.blocks || []).filter((b) => {
      if (b.type === 'text') {
        const text = (b.text || '').trim();
        const html = (b.html || '').replace(/<[^>]*>/g, '').trim();
        if (!b.mainText && !text && !html) {
          pageChanged = true;
          return false;
        }
      }
      return true;
    });

    let blocks = filteredBlocks.map((b) => {
      if (b.type === 'text') {
        const oldY = b.y ?? b.top ?? GRID_TOP;
        const snappedY = GRID_TOP + Math.max(0, Math.round((oldY - GRID_TOP) / LINE)) * LINE;
        const fontSize = b.fontSize === 24 || !b.fontSize ? BODY_SIZE : b.fontSize;
        if (b.y !== snappedY || b.top !== snappedY || b.fontSize !== fontSize) {
          pageChanged = true;
          return { ...b, y: snappedY, top: snappedY, fontSize };
        }
      }
      return b;
    });

    const contentWidth = PAGE_W - MARGIN_X * 2;
    const mainCandidates = blocks
      .filter((block) => block.type === 'text' &&
        (block.mainText || (block.width ?? contentWidth) >= contentWidth * 0.8))
      .sort((a, b) => (a.y ?? a.top ?? GRID_TOP) - (b.y ?? b.top ?? GRID_TOP));
    const mainCandidate = mainCandidates[0];
    const mainId = mainCandidate?.id || `main-${page.id}`;
    const mainBlocks = mainCandidates.length > 0
      ? mainCandidates.map((block) => ({
        ...block,
        html: block.html || (block.text
          ? block.text.split('\n').map((line) => `<p>${line || ''}</p>`).join('')
          : '<p></p>'),
      }))
      : [];
    const mainHtml = mainBlocks.map((block) => block.html).join('');
    const mainText = mainBlocks.map((block) => block.text || '').filter(Boolean).join('\n');
    const mainTextBlock = {
      ...(mainCandidate || {}),
      id: mainId,
      type: 'text',
      mainText: true,
      x: MARGIN_X,
      y: GRID_TOP,
      top: GRID_TOP,
      width: contentWidth,
      height: LINE_COUNT * LINE,
      fontSize: mainCandidate?.fontSize || BODY_SIZE,
      text: mainText,
      html: mainHtml || '<p></p>',
    };
    blocks = blocks.filter((block) => !mainCandidates.some((candidate) => candidate.id === block.id));
    blocks.unshift(mainTextBlock);

    if (!mainCandidate ||
      mainCandidates.length !== 1 ||
      mainCandidate.mainText !== true ||
      mainCandidate.x !== MARGIN_X ||
      mainCandidate.y !== GRID_TOP ||
      mainCandidate.top !== GRID_TOP ||
      mainCandidate.width !== contentWidth ||
      mainCandidate.height !== LINE_COUNT * LINE ||
      mainCandidate.html !== mainTextBlock.html) {
      pageChanged = true;
    }

    if (pageChanged) {
      changed = true;
      return { ...page, blocks };
    }
    return page;
  });

  if (changed) {
    saveDiary(migrated);
  }
  return migrated;
}

export function loadDiary() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) {
      const supported = saved.filter(page => page && supportedKinds.has(page.kind));
      if (supported.length > 0) {
        const result = [];
        // Ensure the 4 foundation pages are present
        for (const op of openingPages) {
          const found = supported.find(p => p.id === op.id);
          result.push(found ? { ...op, ...found } : structuredClone(op));
        }
        // Append all saved memory pages
        const memories = supported.filter(p => p.kind === "memory");
        result.push(...memories);
        // Ensure memory pages exist after page 04 (at least pages 05 to 08)
        while (result.length < 8) {
          result.push(makeMemoryPage(result.length - 4));
        }
        return migratePages(result);
      }
    }
  } catch { /* Start fresh when saved data is unavailable or malformed. */ }
  return migratePages(createInitialPages());
}

export function saveDiary(pages) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pages)); } catch { /* Keep the in-memory diary usable. */ }
}

import { db } from './db/db.js';
import { releaseMediaUrl } from './db/mediaUrls.js';

export async function saveMediaAsset(file, prefix = "media") {
  if (!file) throw new Error("No file provided to saveMediaAsset");
  const id = `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
  await db.media.put(file, id);
  return id;
}

export function saveVideoAsset(file) { return saveMediaAsset(file, "video"); }
export function saveImageAsset(file) { return saveMediaAsset(file, "photo"); }
export function saveMedia(file, prefix = "media") { return saveMediaAsset(file, prefix); }

export async function getMediaAsset(id) {
  if (!id) return null;
  const rec = await db.media.get(id);
  return rec?.blob || null;
}

export async function deleteVideoAsset(id) {
  if (!id) return;
  releaseMediaUrl(id);
  await db.media.delete(id);
}
export async function deleteMediaAsset(id) {
  if (!id) return;
  releaseMediaUrl(id);
  await db.media.delete(id);
}

export function makeMemoryPage(variation) {
  const id = `memory-${globalThis.crypto?.randomUUID?.() ?? Date.now()}-${Math.floor(Math.random() * 10000)}`;
  return {
    id,
    kind: "memory",
    title: "",
    date: new Date().toISOString().slice(0, 10),
    mood: "",
    variation: variation !== undefined ? (variation % 5) : Math.floor(Math.random() * 5),
    blocks: [{
      id: `main-${id}`,
      type: "text",
      mainText: true,
      x: MARGIN_X,
      y: GRID_TOP,
      top: GRID_TOP,
      width: PAGE_W - MARGIN_X * 2,
      height: LINE_COUNT * LINE,
      fontSize: BODY_SIZE,
      text: "",
      html: "<p></p>",
    }],
  };
}

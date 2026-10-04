import { db } from '../db/db.js';
import { openingPages } from '../diaryModel.js';

const LARGE_MEDIA_BYTES = 50 * 1024 * 1024;
const MAX_MEDIA_BYTES = 95 * 1024 * 1024;

const extensionByMimeType = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/ogg': 'ogv',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function fileExtension(blob) {
  const name = typeof blob.name === 'string' ? blob.name : '';
  const match = name.match(/\.([a-z0-9]{1,8})$/i);
  return (match?.[1] || extensionByMimeType[blob.type] || 'bin').toLowerCase();
}

async function contentHash(blob) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable in this browser. Use localhost in Chrome or Edge, or try a supported browser.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function collectMediaIds(pages) {
  const ids = new Set();
  const add = (id) => {
    if (typeof id === 'string' && id) ids.add(id);
  };

  for (const page of pages) {
    add(page.fields?.photoAssetId);
    add(page.data?.profilePhoto?.mediaId);
    for (const block of page.blocks || []) {
      add(block.mediaId);
      add(block.assetId);
      add(block.imageAssetId);
      add(block.posterMediaId);
      add(block.posterAssetId);
      add(block.posterId);
      add(block.posterImageAssetId);
      add(block.data?.mediaId);
      add(block.data?.assetId);
      add(block.data?.posterMediaId);
      add(block.data?.posterAssetId);
      add(block.data?.posterId);
      add(block.data?.posterImageAssetId);
    }
  }
  return ids;
}

async function prepareMedia(pages, onProgress) {
  const records = [];
  const mediaById = new Map();
  const filenameByHash = new Map();
  const hashByFilename = new Map();
  const ids = [...collectMediaIds(pages)];
  const total = ids.length;
  const tooLarge = [];

  const addMedia = async (blob, sourceName, progressIndex, id = null) => {
    onProgress(`Exporting ${progressIndex} of ${total}…`);
    if (blob.size > MAX_MEDIA_BYTES) {
      tooLarge.push(`${sourceName} (${(blob.size / (1024 * 1024)).toFixed(1)} MB)`);
      return;
    }
    const hash = await contentHash(blob);
    const extension = fileExtension(blob);
    const filename = filenameByHash.get(hash) || `${hash.slice(0, 16)}.${extension}`;
    const existingHash = hashByFilename.get(filename);
    if (existingHash && existingHash !== hash) {
      throw new Error(`Two different media files map to "${filename}". Rename or replace one file before exporting.`);
    }
    filenameByHash.set(hash, filename);
    hashByFilename.set(filename, hash);
    const media = { blob, filename, name: sourceName, size: blob.size };
    if (id) mediaById.set(id, media);
    if (!records.some((item) => item.filename === filename)) records.push(media);
  };

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const record = await db.media.get(id);
    if (!record?.blob) {
      throw new Error(`Media "${id}" is missing from this browser's diary storage.`);
    }
    const sourceName = typeof record.blob.name === 'string' ? record.blob.name : id;
    await addMedia(record.blob, sourceName, index + 1, id);
  }

  const largeFiles = records
    .filter((item) => item.size > LARGE_MEDIA_BYTES)
    .map((item) => `${item.name} → ${item.filename} (${(item.size / (1024 * 1024)).toFixed(1)} MB)`);

  if (tooLarge.length) {
    const overFifty = [...largeFiles, ...tooLarge];
    onProgress(`Media over 50 MB: ${overFifty.join(', ')}`);
    throw new Error(`Publishing stopped: ${tooLarge.join(', ')} exceed 95 MB. Reduce or remove these files before exporting.`);
  }

  return { records, mediaById, largeFiles };
}

function publishedPages(pages, mediaById) {
  const publicPath = (id) => {
    const media = mediaById.get(id);
    return media ? `/diary/media/${media.filename}` : null;
  };

  return pages.map((page) => {
    const pageCopy = structuredClone(page);
    const profilePhoto = pageCopy.data?.profilePhoto;
    const legacyProfilePhotoId = pageCopy.fields?.photoAssetId;
    const profileMediaId = profilePhoto?.mediaId || legacyProfilePhotoId;

    if (profileMediaId && publicPath(profileMediaId)) {
      pageCopy.data = {
        ...(pageCopy.data || {}),
        profilePhoto: {
          ...(profilePhoto || {}),
          src: publicPath(profileMediaId),
        },
      };
      delete pageCopy.data.profilePhoto.mediaId;
      pageCopy.fields = { ...(pageCopy.fields || {}) };
      delete pageCopy.fields.photoAssetId;
    }

    pageCopy.blocks = (pageCopy.blocks || []).map((block) => {
      const blockCopy = { ...block };
      const data = { ...(block.data || {}) };
      const mediaId = data.mediaId || block.mediaId || block.assetId || block.imageAssetId;
      const posterMediaId = data.posterMediaId || data.posterAssetId ||
        data.posterId || data.posterImageAssetId ||
        block.posterMediaId || block.posterAssetId || block.posterId || block.posterImageAssetId;

      if (mediaId && publicPath(mediaId)) data.src = publicPath(mediaId);
      if (posterMediaId && publicPath(posterMediaId)) data.posterSrc = publicPath(posterMediaId);
      delete data.mediaId;
      delete data.assetId;
      delete data.posterMediaId;
      delete data.posterAssetId;
      delete data.posterId;
      delete data.posterImageAssetId;
      delete blockCopy.mediaId;
      delete blockCopy.assetId;
      delete blockCopy.imageAssetId;
      delete blockCopy.posterMediaId;
      delete blockCopy.posterAssetId;
      delete blockCopy.posterId;
      delete blockCopy.posterImageAssetId;
      if (Object.keys(data).length) blockCopy.data = data;
      return blockCopy;
    });

    return pageCopy;
  });
}

async function writeFile(directory, filename, blob) {
  const handle = await directory.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function writeDirectoryExport(directoryHandle, files, mediaRecords, onProgress) {
  const diaryDirectory = await directoryHandle.getDirectoryHandle('diary', { create: true });
  const mediaDirectory = await diaryDirectory.getDirectoryHandle('media', { create: true });

  for (let index = 0; index < mediaRecords.length; index += 1) {
    const media = mediaRecords[index];
    onProgress(`Exporting ${index + 1} of ${mediaRecords.length}…`);
    try {
      await mediaDirectory.getFileHandle(media.filename);
    } catch (error) {
      if (error.name !== 'NotFoundError') throw error;
      await writeFile(mediaDirectory, media.filename, media.blob);
    }
  }

  await writeFile(
    diaryDirectory,
    'diary.json',
    new Blob([JSON.stringify(files.document, null, 2)], { type: 'application/json' }),
  );

  const referenced = new Set(mediaRecords.map((media) => media.filename));
  for await (const [name, handle] of mediaDirectory.entries()) {
    if (handle.kind === 'file' && !referenced.has(name)) {
      await mediaDirectory.removeEntry(name);
    }
  }
}

async function getDirectoryHandle() {
  let directoryHandle = await db.settings.get('publish-directory');
  if (directoryHandle?.name === 'public') {
    const permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') return directoryHandle;
    if ((await directoryHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
      return directoryHandle;
    }
  }

  directoryHandle = await window.showDirectoryPicker({
    id: 'project-diary-publish',
    mode: 'readwrite',
  });
  if (directoryHandle.name !== 'public') {
    throw new Error('Choose the project-d/public folder so the diary is included in the production build.');
  }
  if ((await directoryHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
    throw new Error('Write permission was not granted for the selected public folder.');
  }
  await db.settings.put('publish-directory', directoryHandle);
  return directoryHandle;
}

async function downloadZip(files, mediaRecords) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('diary/diary.json', JSON.stringify(files.document, null, 2));
  for (const media of mediaRecords) zip.file(`diary/media/${media.filename}`, media.blob);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'diary-publish.zip';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function loadPublishedDiary() {
  const response = await fetch(`${import.meta.env.BASE_URL}diary/diary.json`, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(response.status === 404
      ? 'No published diary was found. Export a diary from localhost first.'
      : `Could not load the published diary (HTTP ${response.status}).`);
  }
  const document = await response.json();
  if (!Array.isArray(document.pages)) {
    throw new Error('The published diary file is invalid: it must contain a pages array.');
  }
  return {
    pages: document.pages,
    inkColor: typeof document.inkColor === 'string' ? document.inkColor : null,
  };
}

export function emptyPublishedPages() {
  return structuredClone(openingPages);
}

export async function exportDiary(pages, inkColor, onProgress) {
  if (!Array.isArray(pages)) throw new Error('The diary pages could not be read for export.');

  const { records, mediaById, largeFiles } = await prepareMedia(pages, onProgress);
  if (largeFiles.length) onProgress(`Large media over 50 MB: ${largeFiles.join(', ')}`);
  const document = {
    version: 1,
    exportedAt: new Date().toISOString(),
    pages: publishedPages(pages, mediaById),
    inkColor,
  };
  const files = { document };

  let finalMessage;
  if (typeof window.showDirectoryPicker === 'function') {
    onProgress('Preparing the publish folder…');
    const directoryHandle = await getDirectoryHandle();
    await writeDirectoryExport(directoryHandle, files, records, onProgress);
    finalMessage = 'Exported to public/diary. Now commit and push to publish.';
  } else {
    onProgress('Preparing the diary ZIP…');
    await downloadZip(files, records);
    finalMessage = 'ZIP downloaded. Extract it into project-d/public/.';
  }

  const warning = largeFiles.length ? ` Large media (>50 MB): ${largeFiles.join(', ')}.` : '';
  return `${finalMessage}${warning}`;
}

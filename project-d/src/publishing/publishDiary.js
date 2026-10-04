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

function mediaReferences(pages) {
  const references = [];
  const addGroup = (ids, page, pageIndex, block, kind, slot) => {
    const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
    if (!uniqueIds.length) return;
    references.push({
      ids: uniqueIds,
      pageId: page.id,
      pageIndex,
      pageTitle: page.title || (page.kind === 'memory' ? 'Untitled memory' : 'Untitled page'),
      blockId: block?.id || null,
      blockType: block?.type || null,
      kind,
      slot,
    });
  };

  pages.forEach((page, pageIndex) => {
    addGroup([
      page.data?.profilePhoto?.mediaId,
      page.fields?.photoAssetId,
    ], page, pageIndex, null, 'profile photo', 'profile');

    for (const block of page.blocks || []) {
      const blockType = block.type || 'media';
      addGroup([
        block.data?.mediaId,
        block.data?.assetId,
        block.data?.imageAssetId,
        block.data?.videoAssetId,
        block.data?.audioAssetId,
        block.mediaId,
        block.assetId,
        block.imageAssetId,
        block.videoAssetId,
        block.audioAssetId,
      ], page, pageIndex, block, blockType, 'source');
      addGroup([
        block.data?.posterMediaId,
        block.data?.posterAssetId,
        block.data?.posterId,
        block.data?.posterImageAssetId,
        block.data?.posterVideoAssetId,
        block.posterMediaId,
        block.posterAssetId,
        block.posterId,
        block.posterImageAssetId,
        block.posterVideoAssetId,
      ], page, pageIndex, block, `${blockType} poster`, 'poster');
    }
  });
  return references;
}

function describeReference(reference) {
  const pageNumber = String(reference.pageIndex + 1).padStart(2, '0');
  const location = reference.blockId
    ? `Page ${pageNumber} '${reference.pageTitle}': ${reference.kind}`
    : `Page ${pageNumber} '${reference.pageTitle}': profile photo`;
  return location;
}

async function findMissingMedia(pages) {
  const references = mediaReferences(pages);
  const ids = [...new Set(references.flatMap((reference) => reference.ids))];
  const records = new Map();
  await Promise.all(ids.map(async (id) => records.set(id, await db.media.get(id))));

  const missing = [];
  for (const reference of references) {
    for (const id of reference.ids) {
      if (records.get(id)?.blob) continue;
      missing.push({
        id,
        message: `${describeReference(reference)} is missing media '${id}'. Please re-add it or use Repair missing media.`,
      });
    }
  }
  return { references, records, missing };
}

async function prepareMedia(pages, onProgress) {
  const records = [];
  const mediaById = new Map();
  const filenameByHash = new Map();
  const hashByFilename = new Map();
  const ids = [...new Set(mediaReferences(pages).flatMap((reference) => reference.ids))];
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
    return media ? `${import.meta.env.BASE_URL}diary/media/${media.filename}` : null;
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
      const mediaId = data.mediaId || data.assetId || data.imageAssetId ||
        data.videoAssetId || data.audioAssetId || block.mediaId || block.assetId ||
        block.imageAssetId || block.videoAssetId || block.audioAssetId;
      const posterMediaId = data.posterMediaId || data.posterAssetId ||
        data.posterId || data.posterImageAssetId || data.posterVideoAssetId ||
        block.posterMediaId || block.posterAssetId || block.posterId ||
        block.posterImageAssetId || block.posterVideoAssetId;

      if (mediaId && publicPath(mediaId)) data.src = publicPath(mediaId);
      if (posterMediaId && publicPath(posterMediaId)) data.posterSrc = publicPath(posterMediaId);
      for (const key of [
        'mediaId', 'assetId', 'imageAssetId', 'videoAssetId', 'audioAssetId',
        'posterMediaId', 'posterAssetId', 'posterId', 'posterImageAssetId', 'posterVideoAssetId',
      ]) {
        delete data[key];
        delete blockCopy[key];
      }
      if (Object.keys(data).length) blockCopy.data = data;
      return blockCopy;
    });

    return pageCopy;
  });
}

function publishedMediaUrl(path) {
  if (typeof path !== 'string') return null;
  let url;
  let mediaDirectory;
  try {
    url = new URL(path, window.location.href);
    mediaDirectory = new URL(`${import.meta.env.BASE_URL}diary/media/`, window.location.href);
  } catch {
    return null;
  }
  const filename = url.pathname.slice(mediaDirectory.pathname.length);
  if (
    url.origin !== mediaDirectory.origin ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(mediaDirectory.pathname) ||
    !/^[a-f0-9]{16}\.[a-z0-9]{1,8}$/i.test(filename)
  ) {
    return null;
  }
  return url;
}

function publishedMediaPath(value) {
  return typeof value === 'string' && publishedMediaUrl(value) ? value : null;
}

function counterpartMediaPath(publishedPage, reference) {
  if (!publishedPage) return null;
  if (reference.slot === 'profile') {
    return publishedMediaPath(publishedPage.data?.profilePhoto?.src) ||
      publishedMediaPath(publishedPage.fields?.photoSrc);
  }
  const block = publishedPage.blocks?.find((item) => item.id === reference.blockId);
  if (!block) return null;
  const data = block.data || {};
  return reference.slot === 'poster'
    ? publishedMediaPath(data.posterSrc) || publishedMediaPath(block.posterSrc)
    : publishedMediaPath(data.src) || publishedMediaPath(block.src) ||
      publishedMediaPath(block.videoSrc) || publishedMediaPath(block.imageSrc) ||
      publishedMediaPath(block.audioSrc) || publishedMediaPath(block.url);
}

function synchronizeReference(page, reference, mediaId) {
  if (reference.slot === 'profile') {
    const profilePhoto = page.data?.profilePhoto;
    if (profilePhoto) {
      page.data = {
        ...page.data,
        profilePhoto: { ...profilePhoto, mediaId },
      };
    }
    if (page.fields?.photoAssetId || !profilePhoto) {
      page.fields = { ...(page.fields || {}), photoAssetId: mediaId };
    }
    return;
  }

  const block = page.blocks?.find((item) => item.id === reference.blockId);
  if (!block) return;
  const data = { ...(block.data || {}) };
  if (reference.slot === 'poster') {
    data.posterMediaId = mediaId;
    for (const key of ['posterAssetId', 'posterId', 'posterImageAssetId', 'posterVideoAssetId']) {
      if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = mediaId;
      if (Object.prototype.hasOwnProperty.call(block, key)) block[key] = mediaId;
    }
    block.posterMediaId = mediaId;
  } else {
    data.mediaId = mediaId;
    block.mediaId = mediaId;
    const typeField = block.type === 'photo' ? 'imageAssetId'
      : block.type === 'video' ? 'assetId'
        : block.type === 'audio' ? 'audioAssetId' : null;
    if (typeField) block[typeField] = mediaId;
    for (const key of ['assetId', 'imageAssetId', 'videoAssetId', 'audioAssetId']) {
      if (Object.prototype.hasOwnProperty.call(block, key)) block[key] = mediaId;
      if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = mediaId;
    }
  }
  block.data = data;
}

export async function planMissingMediaRepair(pages) {
  const { references, records, missing } = await findMissingMedia(pages);
  if (!missing.length) return { actions: [], unresolved: [] };

  let publishedPagesById = new Map();
  try {
    const document = await fetchPublishedDocument();
    publishedPagesById = new Map(document.pages.map((page) => [page.id, page]));
  } catch {
    // Existing valid alias IDs can still repair references without a snapshot.
  }

  const actions = [];
  const unresolved = [];
  const handled = new Set();
  for (const reference of references) {
    const absentIds = reference.ids.filter((id) => !records.get(id)?.blob);
    if (!absentIds.length) continue;
    const key = `${reference.pageId}:${reference.blockId || 'profile'}:${reference.slot}`;
    if (handled.has(key)) continue;
    handled.add(key);

    const validId = reference.ids.find((id) => records.get(id)?.blob);
    if (validId) {
      actions.push({
        type: 'synchronize',
        reference,
        mediaId: validId,
        missingIds: absentIds,
        description: `${describeReference(reference)}: synchronize media aliases to the available file '${validId}'.`,
      });
      continue;
    }

    const publishedPage = publishedPagesById.get(reference.pageId);
    const sourcePath = counterpartMediaPath(publishedPage, reference);
    const importableId = absentIds.find((id) => id.startsWith('import-'));
    if (sourcePath && importableId) {
      try {
        const response = await fetch(new URL(sourcePath, window.location.href), { cache: 'no-cache' });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.size) {
            actions.push({
              type: 'restore',
              reference,
              mediaId: importableId,
              blob: new File([blob], sourcePath.split('/').pop(), { type: blob.type }),
              missingIds: absentIds,
              description: `${describeReference(reference)}: restore '${importableId}' from the published file '${sourcePath}'.`,
            });
            continue;
          }
        }
      } catch {
        // Report this reference as unrecoverable below.
      }
    }
    unresolved.push(...missing.filter((item) =>
      absentIds.includes(item.id) && item.message.startsWith(describeReference(reference))
    ));
  }
  return { actions, unresolved };
}

export async function applyMissingMediaRepair(pages, plan) {
  const updatedPages = structuredClone(pages);
  for (const action of plan.actions) {
    const page = updatedPages.find((item) => item.id === action.reference.pageId);
    if (!page) throw new Error(`Could not find ${describeReference(action.reference)} while applying repairs.`);
    if (action.type === 'restore') {
      await db.media.put(action.blob, action.mediaId);
    }
    synchronizeReference(page, action.reference, action.mediaId);
  }
  return updatedPages;
}

function collectPublishedMediaPaths(value, paths = new Set()) {
  if (typeof value === 'string') {
    if (publishedMediaUrl(value)) paths.add(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectPublishedMediaPaths(item, paths));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectPublishedMediaPaths(item, paths));
  }
  return paths;
}

async function importPublishedMedia(pages, onProgress) {
  const paths = [...collectPublishedMediaPaths(pages)];
  const mediaIds = new Map();
  try {
    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index];
      const url = publishedMediaUrl(path);
      if (!url) continue;
      onProgress(`Importing media ${index + 1} of ${paths.length}…`);
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`Could not import published media "${url.pathname}" (HTTP ${response.status}).`);
      }
      const blob = await response.blob();
      if (!blob.size) {
        throw new Error(`Published media "${url.pathname}" is empty.`);
      }
      const filename = url.pathname.split('/').pop();
      const mediaId = `import-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}`}`;
      mediaIds.set(path, mediaId);
      const file = new File([blob], filename, { type: blob.type });
      await db.media.put(file, mediaId);
    }
  } catch (error) {
    const cleanupErrors = [];
    for (const mediaId of mediaIds.values()) {
      try {
        await db.media.delete(mediaId);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length) {
      throw new Error(`${error.message} Some newly imported media could not be removed after the failed import.`, { cause: error });
    }
    throw error;
  }
  return { mediaIds, importedMediaIds: [...mediaIds.values()] };
}

function pagesWithImportedMedia(pages, mediaIds) {
  const mediaIdFor = (path) => mediaIds.get(path);
  return pages.map((page) => {
    const pageCopy = structuredClone(page);
    const profilePhoto = pageCopy.data?.profilePhoto;
    const profilePhotoId = mediaIdFor(profilePhoto?.src) || mediaIdFor(pageCopy.fields?.photoSrc);
    if (profilePhotoId) {
      pageCopy.data = {
        ...(pageCopy.data || {}),
        profilePhoto: {
          ...(profilePhoto || {}),
          mediaId: profilePhotoId,
        },
      };
      delete pageCopy.data.profilePhoto.src;
      pageCopy.fields = { ...(pageCopy.fields || {}), photoAssetId: profilePhotoId };
      delete pageCopy.fields.photoSrc;
    }

    pageCopy.blocks = (pageCopy.blocks || []).map((block) => {
      const blockCopy = { ...block };
      const data = { ...(block.data || {}) };
      const sourcePath = data.src || block.src || block.videoSrc || block.imageSrc || block.audioSrc || block.url;
      const sourceId = mediaIdFor(sourcePath);
      const posterPath = data.posterSrc || block.posterSrc;
      const posterId = mediaIdFor(posterPath);

      if (sourceId) {
        blockCopy.mediaId = sourceId;
        data.mediaId = sourceId;
        if (block.type === 'photo') blockCopy.imageAssetId = sourceId;
        if (block.type === 'video') blockCopy.assetId = sourceId;
        if (block.type === 'audio') blockCopy.audioAssetId = sourceId;
        for (const key of ['assetId', 'imageAssetId', 'videoAssetId', 'audioAssetId']) {
          if (Object.prototype.hasOwnProperty.call(blockCopy, key)) blockCopy[key] = sourceId;
          if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = sourceId;
        }
        if (mediaIdFor(data.src)) delete data.src;
        for (const key of ['src', 'videoSrc', 'imageSrc', 'audioSrc', 'url']) {
          if (mediaIdFor(blockCopy[key])) delete blockCopy[key];
        }
      }
      if (posterId) {
        blockCopy.posterMediaId = posterId;
        data.posterMediaId = posterId;
        for (const key of ['posterAssetId', 'posterId', 'posterImageAssetId', 'posterVideoAssetId']) {
          if (Object.prototype.hasOwnProperty.call(blockCopy, key)) blockCopy[key] = posterId;
          if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = posterId;
        }
        if (mediaIdFor(data.posterSrc)) delete data.posterSrc;
        if (mediaIdFor(blockCopy.posterSrc)) delete blockCopy.posterSrc;
      }
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

async function getPublishDirectoryHandle() {
  const previousDirectory = await db.settings.get('publish-project-directory');
  const projectDirectory = await window.showDirectoryPicker({
    id: 'project-diary-publish',
    mode: 'readwrite',
    ...(previousDirectory ? { startIn: previousDirectory } : {}),
  });

  const packageFile = await projectDirectory.getFileHandle('package.json').catch((error) => {
    if (error.name === 'NotFoundError') {
      throw new Error('Choose the Project D folder that contains its package.json file.');
    }
    throw error;
  });
  const packageContents = await (await packageFile.getFile()).text();
  let packageJson;
  try {
    packageJson = JSON.parse(packageContents);
  } catch (error) {
    throw new Error('The selected folder has an invalid package.json file.', { cause: error });
  }
  if (packageJson.name !== 'project-d') {
    throw new Error('Choose the Project D folder whose package.json has "name": "project-d".');
  }

  const permission = await projectDirectory.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted' &&
    (await projectDirectory.requestPermission({ mode: 'readwrite' })) !== 'granted') {
    throw new Error('Write permission was not granted for the selected Project D folder.');
  }

  const publicDirectory = await projectDirectory.getDirectoryHandle('public').catch((error) => {
    if (error.name === 'NotFoundError') {
      throw new Error('The selected Project D folder does not contain a public folder.');
    }
    throw error;
  });
  await db.settings.put('publish-project-directory', projectDirectory);
  return publicDirectory;
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
  const document = await fetchPublishedDocument();
  return {
    pages: document.pages,
    inkColor: typeof document.inkColor === 'string' ? document.inkColor : null,
  };
}

async function fetchPublishedDocument() {
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
  return document;
}

export async function importPublishedDiary(onProgress) {
  const document = await fetchPublishedDocument();
  const { mediaIds, importedMediaIds } = await importPublishedMedia(document.pages, onProgress);
  return {
    pages: pagesWithImportedMedia(document.pages, mediaIds),
    inkColor: typeof document.inkColor === 'string' ? document.inkColor : null,
    importedMediaIds,
  };
}

export function emptyPublishedPages() {
  return structuredClone(openingPages);
}

export async function exportDiary(pages, inkColor, onProgress) {
  if (!Array.isArray(pages)) throw new Error('The diary pages could not be read for export.');

  onProgress('Checking all diary media before export…');
  const { missing } = await findMissingMedia(pages);
  if (missing.length) {
    throw new Error(`Export stopped before writing any files. Missing media:\n${missing.map((item) => `- ${item.message}`).join('\n')}`);
  }

  let publishDirectory = null;
  if (typeof window.showDirectoryPicker === 'function') {
    onProgress('Choose the Project D folder that contains package.json…');
    publishDirectory = await getPublishDirectoryHandle();
  }

  const { records, mediaById, largeFiles } = await prepareMedia(pages, onProgress);
  if (largeFiles.length) onProgress(`Large media over 50 MB: ${largeFiles.join(', ')}`);
  const document = {
    schemaVersion: '1.0.0',
    version: 1,
    exportedAt: new Date().toISOString(),
    pages: publishedPages(pages, mediaById),
    inkColor,
  };
  const files = { document };

  let finalMessage;
  if (publishDirectory) {
    onProgress('Preparing the publish folder…');
    await writeDirectoryExport(publishDirectory, files, records, onProgress);
    finalMessage = 'Exported to the selected Project D folder: public/diary. Now commit and push to publish.';
  } else {
    onProgress('Preparing the diary ZIP…');
    await downloadZip(files, records);
    finalMessage = 'ZIP downloaded. Extract it into project-d/public/.';
  }

  const warning = largeFiles.length ? ` Large media (>50 MB): ${largeFiles.join(', ')}.` : '';
  return `${finalMessage}${warning}`;
}

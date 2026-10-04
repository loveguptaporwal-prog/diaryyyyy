// src/db/mediaUrls.js
import { db } from './db.js';

const cache = new Map();      // mediaId -> objectURL
const pending = new Map();    // mediaId -> Promise<url>

export function getMediaUrl(id) {
  if (!id) return Promise.resolve(null);
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (pending.has(id)) return pending.get(id);

  const p = db.media.get(id).then((rec) => {
    if (!rec?.blob || rec.blob.size === 0) {
      throw new Error('Missing media ' + id);
    }
    const url = URL.createObjectURL(rec.blob);
    cache.set(id, url);
    pending.delete(id);
    return url;
  }).catch((err) => {
    pending.delete(id);
    throw err;
  });

  pending.set(id, p);
  return p;
}

export function releaseMediaUrl(id) {      // call only when deleting the media
  if (!id) return;
  const url = cache.get(id);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
  cache.delete(id);
  pending.delete(id);
}

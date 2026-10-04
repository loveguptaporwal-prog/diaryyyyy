// src/db/db.js
const MEDIA_DB = 'project-d-media-v1';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MEDIA_DB, 4);
    request.onupgradeneeded = () => {
      const idb = request.result;
      if (!idb.objectStoreNames.contains('videos')) {
        idb.createObjectStore('videos');
      }
      if (!idb.objectStoreNames.contains('media')) {
        idb.createObjectStore('media');
      }
      if (!idb.objectStoreNames.contains('settings')) {
        idb.createObjectStore('settings');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  media: {
    async get(id) {
      if (!id) return null;
      const idb = await openDb();
      return new Promise((resolve, reject) => {
        const stores = Array.from(idb.objectStoreNames);
        const tx = idb.transaction(stores, 'readonly');
        let resolved = false;

        const tryStore = (storeName, next) => {
          if (!stores.includes(storeName)) {
            next();
            return;
          }
          const req = tx.objectStore(storeName).get(id);
          req.onsuccess = () => {
            if (req.result) {
              const res = req.result;
              const blob = res instanceof Blob ? res : (res?.blob instanceof Blob ? res.blob : null);
              if (blob) {
                resolved = true;
                idb.close();
                resolve({ id, blob });
                return;
              }
            }
            next();
          };
          req.onerror = () => next();
        };

        tryStore('media', () => {
          if (resolved) return;
          tryStore('videos', () => {
            if (!resolved) {
              idb.close();
              resolve(null);
            }
          });
        });
      });
    },

    async put(blobOrRec, keyParam) {
      const idb = await openDb();
      const blob = blobOrRec instanceof Blob ? blobOrRec : blobOrRec?.blob;
      const id = keyParam || blobOrRec?.id || `media-${crypto.randomUUID?.() ?? Date.now()}`;
      return new Promise((resolve, reject) => {
        const stores = Array.from(idb.objectStoreNames);
        const storeName = stores.includes('media') ? 'media' : 'videos';
        const tx = idb.transaction(storeName, 'readwrite');
        // Store as record { id, blob } and also key
        tx.objectStore(storeName).put({ id, blob }, id);
        tx.oncomplete = () => {
          idb.close();
          resolve(id);
        };
        tx.onerror = () => {
          idb.close();
          reject(tx.error);
        };
      });
    },

    async delete(id) {
      if (!id) return;
      const idb = await openDb();
      return new Promise((resolve, reject) => {
        const stores = Array.from(idb.objectStoreNames);
        const tx = idb.transaction(stores, 'readwrite');
        stores.forEach((storeName) => {
          try {
            tx.objectStore(storeName).delete(id);
          } catch {
            // ignore
          }
        });
        tx.oncomplete = () => {
          idb.close();
          resolve();
        };
        tx.onerror = () => {
          idb.close();
          reject(tx.error);
        };
      });
    },
  },
  settings: {
    async get(key) {
      const idb = await openDb();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('settings', 'readonly');
        const request = tx.objectStore('settings').get(key);
        request.onsuccess = () => {
          idb.close();
          resolve(request.result ?? null);
        };
        request.onerror = () => {
          idb.close();
          reject(request.error);
        };
      });
    },

    async put(key, value) {
      const idb = await openDb();
      return new Promise((resolve, reject) => {
        const tx = idb.transaction('settings', 'readwrite');
        tx.objectStore('settings').put(value, key);
        tx.oncomplete = () => {
          idb.close();
          resolve();
        };
        tx.onerror = () => {
          idb.close();
          reject(tx.error);
        };
      });
    },
  },
};

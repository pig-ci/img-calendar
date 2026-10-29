'use strict';

/*
 * IndexedDB 存取：events 與 images 兩個 store。
 * 事件只存 imageId 字串，圖片 Blob 單獨存放，避免查詢事件時拖著大 Blob。
 */

export const Store = (() => {
  const DB_NAME = 'photo-calendar';
  const DB_VERSION = 1;
  const STORE_EVENTS = 'events';
  const STORE_IMAGES = 'images';

  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) { resolve(db); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE_EVENTS)) {
          const s = d.createObjectStore(STORE_EVENTS, { keyPath: 'id' });
          s.createIndex('start', 'start', { unique: false });
        }
        if (!d.objectStoreNames.contains(STORE_IMAGES)) {
          d.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function promisify(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  /* ==== Events ==== */
  async function getAllEvents() {
    await open();
    return promisify(tx(STORE_EVENTS).getAll());
  }

  async function getEvent(id) {
    await open();
    return promisify(tx(STORE_EVENTS).get(id));
  }

  async function saveEvent(event) {
    await open();
    if (!event.id) {
      event.id = 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    }
    event.modified = new Date().toISOString();
    if (!event.created) event.created = event.modified;
    return promisify(tx(STORE_EVENTS, 'readwrite').put(event));
  }

  async function deleteEvent(id) {
    await open();
    return promisify(tx(STORE_EVENTS, 'readwrite').delete(id));
  }

  /* ==== Images ==== */
  async function saveImage(blob) {
    await open();
    const id = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const record = { id, blob, createdAt: new Date().toISOString() };
    await promisify(tx(STORE_IMAGES, 'readwrite').put(record));
    return id;
  }

  async function getImage(id) {
    await open();
    const record = await promisify(tx(STORE_IMAGES).get(id));
    return record ? record.blob : null;
  }

  async function deleteImage(id) {
    await open();
    return promisify(tx(STORE_IMAGES, 'readwrite').delete(id));
  }

  /* ==== Thumbnail（長邊限制，輸出 JPEG） ==== */
  async function makeThumbnail(file, maxSize = 800) {
    const source = await loadImageSource(file);
    const { width, height } = fitWithin(source.width, source.height, maxSize);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(source.element, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('縮圖生成失敗'));
      }, 'image/jpeg', 0.85);
    });
  }

  function fitWithin(w, h, max) {
    if (w <= max && h <= max) return { width: w, height: h };
    const ratio = Math.min(max / w, max / h);
    return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
  }

  async function loadImageSource(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file);
        return { element: bmp, width: bmp.width, height: bmp.height };
      } catch { /* fall through */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ element: img, width: img.naturalWidth, height: img.naturalHeight });
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖片載入失敗')); };
      img.src = url;
    });
  }

  return {
    open, getAllEvents, getEvent, saveEvent, deleteEvent,
    saveImage, getImage, deleteImage, makeThumbnail,
  };
})();
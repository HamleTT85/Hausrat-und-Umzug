// IndexedDB-Wrapper — komplett lokal, keine Server-Abhängigkeit.

const DB_NAME = 'hausrat';
const DB_VERSION = 1;
const STORES = ['houses', 'floors', 'rooms', 'items', 'photos', 'meta'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
      const tx = req.transaction;
      idx(tx, 'floors', 'houseId');
      idx(tx, 'rooms', 'floorId');
      idx(tx, 'rooms', 'houseId');
      idx(tx, 'items', 'roomId');
      idx(tx, 'items', 'status');
      idx(tx, 'photos', 'itemId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idx(tx, store, name) {
  const os = tx.objectStore(store);
  if (!os.indexNames.contains(name)) os.createIndex(name, name);
}

function txStore(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  async get(store, key) {
    return promisify(txStore(await open(), store, 'readonly').get(key));
  },
  async all(store) {
    return promisify(txStore(await open(), store, 'readonly').getAll());
  },
  async byIndex(store, index, value) {
    return promisify(txStore(await open(), store, 'readonly').index(index).getAll(value));
  },
  async put(store, value) {
    await promisify(txStore(await open(), store, 'readwrite').put(value));
    return value;
  },
  async del(store, key) {
    return promisify(txStore(await open(), store, 'readwrite').delete(key));
  },
  async clear(store) {
    return promisify(txStore(await open(), store, 'readwrite').clear());
  },
  async clearAll() {
    for (const s of STORES) await this.clear(s);
  },
};

export function uid(prefix = 'x') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Meta (Settings, Umzugsplan) ----
export async function getMeta(key, fallback = null) {
  const row = await db.get('meta', key);
  return row ? row.value : fallback;
}
export async function setMeta(key, value) {
  await db.put('meta', { key, value });
  return value;
}

// ---- Kaskadierendes Löschen ----
export async function deleteItemDeep(itemId) {
  const photos = await db.byIndex('photos', 'itemId', itemId);
  for (const p of photos) await db.del('photos', p.id);
  await db.del('items', itemId);
}
export async function deleteRoomDeep(roomId) {
  const items = await db.byIndex('items', 'roomId', roomId);
  for (const it of items) await deleteItemDeep(it.id);
  await db.del('rooms', roomId);
}
export async function deleteFloorDeep(floorId) {
  const rooms = await db.byIndex('rooms', 'floorId', floorId);
  for (const r of rooms) await deleteRoomDeep(r.id);
  await db.del('floors', floorId);
}
export async function deleteHouseDeep(houseId) {
  const floors = await db.byIndex('floors', 'houseId', houseId);
  for (const f of floors) await deleteFloorDeep(f.id);
  await db.del('houses', houseId);
}

// ---- Export / Import (Fotos als DataURL) ----
export async function exportAll() {
  const [houses, floors, rooms, items, photos, meta] = await Promise.all(
    STORES.map((s) => db.all(s))
  );
  const photosOut = [];
  for (const p of photos) {
    photosOut.push({ ...p, blob: undefined, dataUrl: await blobToDataUrl(p.blob) });
  }
  return { app: 'hausrat', version: 1, exportedAt: new Date().toISOString(), houses, floors, rooms, items, photos: photosOut, meta };
}

export async function importAll(data) {
  if (!data || data.app !== 'hausrat') throw new Error('Keine gültige HausRat-Sicherung.');
  await db.clearAll();
  for (const s of ['houses', 'floors', 'rooms', 'items', 'meta']) {
    for (const row of data[s] || []) await db.put(s, row);
  }
  for (const p of data.photos || []) {
    const blob = p.dataUrl ? await (await fetch(p.dataUrl)).blob() : null;
    if (blob) await db.put('photos', { id: p.id, itemId: p.itemId, createdAt: p.createdAt, blob });
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

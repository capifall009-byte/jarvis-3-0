const DB_NAME = "jarvis_v2_db";
const DB_VERSION = 6;
const STORE_NAMES = [
  "memories",
  "files",
  "searches",
  "conversations",
  "news",
  "modes",
  "videoGenerations",
  "socialContent",
  "socialPublications",
  // Module 6
  "projects",
  "intelligenceHistory",
] as const;
export type JarvisStoreName = (typeof STORE_NAMES)[number];

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id" });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

export async function idbGetAll<T>(storeName: JarvisStoreName): Promise<T[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function idbGetAllRequired<T>(storeName: JarvisStoreName): Promise<T[]> {
  const db = await openDb();
  if (!db) {
    throw new Error(`IndexedDB indisponible (lecture ${storeName}).`);
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => reject(new Error(`Échec de lecture IndexedDB (${storeName}).`));
      tx.onerror = () => reject(new Error(`Échec de transaction IndexedDB (${storeName}).`));
      tx.onabort = () => reject(new Error(`Transaction IndexedDB annulée (${storeName}).`));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(`Erreur IndexedDB (${storeName}).`));
    }
  });
}

export async function idbPut<T extends { id: string }>(
  storeName: JarvisStoreName,
  item: T
): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbPutRequired<T extends { id: string }>(
  storeName: JarvisStoreName,
  item: T
): Promise<void> {
  const db = await openDb();
  if (!db) {
    throw new Error(`IndexedDB indisponible (écriture ${storeName}).`);
  }
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Échec d'écriture IndexedDB (${storeName}).`));
      tx.onabort = () => reject(new Error(`Transaction IndexedDB annulée (${storeName}).`));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(`Erreur IndexedDB (${storeName}).`));
    }
  });
}

export async function idbDelete(
  storeName: JarvisStoreName,
  id: string
): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbDeleteRequired(
  storeName: JarvisStoreName,
  id: string
): Promise<void> {
  const db = await openDb();
  if (!db) {
    throw new Error(`IndexedDB indisponible (suppression ${storeName}).`);
  }
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Échec de suppression IndexedDB (${storeName}).`));
      tx.onabort = () => reject(new Error(`Transaction IndexedDB annulée (${storeName}).`));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(`Erreur IndexedDB (${storeName}).`));
    }
  });
}

export async function idbClear(storeName: JarvisStoreName): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbClearRequired(storeName: JarvisStoreName): Promise<void> {
  const db = await openDb();
  if (!db) {
    throw new Error(`IndexedDB indisponible (effacement ${storeName}).`);
  }
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Échec d'effacement IndexedDB (${storeName}).`));
      tx.onabort = () => reject(new Error(`Transaction IndexedDB annulée (${storeName}).`));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(`Erreur IndexedDB (${storeName}).`));
    }
  });
}

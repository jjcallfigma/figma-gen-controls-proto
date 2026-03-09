import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "make-design";
const DB_VERSION = 1;

const STORE_CANVAS = "canvas";
const STORE_SETTINGS = "settings";
const STORE_DESIGN_SYSTEM = "design-system";

type DB = IDBPDatabase<unknown>;

let dbPromise: Promise<DB> | null = null;

function getDB(): Promise<DB> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB not available on server"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_CANVAS)) {
          db.createObjectStore(STORE_CANVAS);
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }
        if (!db.objectStoreNames.contains(STORE_DESIGN_SYSTEM)) {
          db.createObjectStore(STORE_DESIGN_SYSTEM);
        }
      },
    });
  }
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Generic get/set/remove for any object store
// ---------------------------------------------------------------------------

export async function idbGet<T = unknown>(
  storeName: string,
  key: string,
): Promise<T | undefined> {
  const db = await getDB();
  return db.get(storeName, key) as Promise<T | undefined>;
}

export async function idbSet(
  storeName: string,
  key: string,
  value: unknown,
): Promise<void> {
  const db = await getDB();
  await db.put(storeName, value, key);
}

export async function idbDelete(
  storeName: string,
  key: string,
): Promise<void> {
  const db = await getDB();
  await db.delete(storeName, key);
}

// ---------------------------------------------------------------------------
// Canvas-specific helpers (used by CanvasPersistence)
// ---------------------------------------------------------------------------

export const canvasDB = {
  get: <T = unknown>(key: string) => idbGet<T>(STORE_CANVAS, key),
  set: (key: string, value: unknown) => idbSet(STORE_CANVAS, key, value),
  delete: (key: string) => idbDelete(STORE_CANVAS, key),
};

// ---------------------------------------------------------------------------
// Zustand-compatible async storage adapter factory
// ---------------------------------------------------------------------------

export function createIDBStorage(storeName: string) {
  return {
    getItem: async (key: string): Promise<string | null> => {
      try {
        const value = await idbGet<string>(storeName, key);
        if (value != null) return value;

        // Migrate from localStorage if present
        const legacy = localStorage.getItem(key);
        if (legacy) {
          await idbSet(storeName, key, legacy);
          localStorage.removeItem(key);
          console.log(`[IDB] Migrated "${key}" from localStorage → IndexedDB`);
          return legacy;
        }

        return null;
      } catch {
        return null;
      }
    },
    setItem: async (key: string, value: string): Promise<void> => {
      try {
        await idbSet(storeName, key, value);
      } catch (e) {
        console.error(`[IDB] Failed to write to ${storeName}:`, e);
      }
    },
    removeItem: async (key: string): Promise<void> => {
      try {
        await idbDelete(storeName, key);
      } catch (e) {
        console.error(`[IDB] Failed to remove from ${storeName}:`, e);
      }
    },
  };
}

// Pre-built adapters for each Zustand store
export const settingsStorage = createIDBStorage(STORE_SETTINGS);
export const designSystemStorage = createIDBStorage(STORE_DESIGN_SYSTEM);

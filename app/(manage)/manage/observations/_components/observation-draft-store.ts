"use client";

/**
 * IndexedDB-backed draft store for the bulk observation add panel, so a partly
 * filled upload (photos + reviewed details + chosen location) survives a page
 * navigation or accidental reload. localStorage can't hold File blobs;
 * IndexedDB can (Files are structured-cloneable), so we use it directly with no
 * dependency. Keyed by the manage target DID so personal and organization
 * drafts never collide. Every call is best-effort: private-mode / disabled
 * IndexedDB simply degrades to "no persistence".
 */

const DB_NAME = "gf-observation-drafts";
const STORE = "drafts";
const VERSION = 1;

export type StoredDraft<TItem> = {
  did: string;
  chosenLocation: { lat: number; lng: number } | null;
  projectUri?: string | null;
  projectDecisionMade?: boolean;
  items: TItem[];
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "did" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function loadDraft<TItem>(did: string): Promise<StoredDraft<TItem> | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(did);
      request.onsuccess = () => resolve((request.result as StoredDraft<TItem> | undefined) ?? null);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function saveDraft<TItem>(draft: StoredDraft<TItem>): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(draft);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function clearDraft(did: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(did);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

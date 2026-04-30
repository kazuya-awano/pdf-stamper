import type { StampImageType } from "./state";

const DB_NAME = "pdf-stamper";
const DB_VERSION = 1;
const STORE_NAME = "stamp-images";
const LAST_STAMP_KEY = "last-stamp";

export interface CachedStampImage {
  bytes: ArrayBuffer;
  type: StampImageType;
  naturalWidth: number;
  naturalHeight: number;
  name: string;
  updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("スタンプ画像キャッシュを開けませんでした。"));
    };
  });
}

function runStoreOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        let result = undefined as T;
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = operation(store);

        request.onsuccess = () => {
          result = request.result;
        };

        request.onerror = () => {
          reject(request.error ?? new Error("スタンプ画像キャッシュの操作に失敗しました。"));
        };

        transaction.oncomplete = () => {
          resolve(result);
          database.close();
        };

        transaction.onerror = () => {
          reject(transaction.error ?? new Error("スタンプ画像キャッシュの操作に失敗しました。"));
          database.close();
        };
      })
  );
}

export async function loadCachedStampImage(): Promise<CachedStampImage | null> {
  if (!("indexedDB" in window)) {
    return null;
  }

  const cached = await runStoreOperation<CachedStampImage | undefined>("readonly", (store) =>
    store.get(LAST_STAMP_KEY)
  );

  return cached ?? null;
}

export async function saveCachedStampImage(stampImage: CachedStampImage): Promise<void> {
  if (!("indexedDB" in window)) {
    return;
  }

  await runStoreOperation<IDBValidKey>("readwrite", (store) =>
    store.put(stampImage, LAST_STAMP_KEY)
  );
}

export async function clearCachedStampImage(): Promise<void> {
  if (!("indexedDB" in window)) {
    return;
  }

  await runStoreOperation<undefined>("readwrite", (store) => store.delete(LAST_STAMP_KEY));
}

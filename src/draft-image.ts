const DATABASE = "silly-easychar-draft";
const STORE = "media";
const PORTRAIT_KEY = "last-portrait";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Portraitspeicher konnte nicht geöffnet werden."));
  });
}

export async function loadDraftPortrait(): Promise<ArrayBuffer | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(PORTRAIT_KEY);
    request.onsuccess = () => resolve(request.result instanceof ArrayBuffer ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("Portrait konnte nicht geladen werden."));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveDraftPortrait(buffer: ArrayBuffer | null): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    if (buffer) store.put(buffer, PORTRAIT_KEY);
    else store.delete(PORTRAIT_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Portrait konnte nicht gespeichert werden."));
    };
  });
}

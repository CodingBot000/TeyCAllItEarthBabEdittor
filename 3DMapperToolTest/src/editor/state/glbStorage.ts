const DATABASE_NAME = '3d-mapper-assets';
const STORE_NAME = 'glb-files';
const DATABASE_VERSION = 1;

interface StoredGlb {
  key: string;
  fileName: string;
  blob: Blob;
  updatedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the GLB asset database.'));
  });
}

export async function saveGlbFile(file: File): Promise<{ key: string; fileName: string }> {
  const key = `glb-${crypto.randomUUID()}`;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ key, fileName: file.name, blob: file, updatedAt: new Date().toISOString() } satisfies StoredGlb);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not store the GLB asset.'));
  });
  database.close();
  return { key, fileName: file.name };
}

export async function loadGlbFile(key: string): Promise<File | null> {
  const database = await openDatabase();
  const stored = await new Promise<StoredGlb | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as StoredGlb | undefined);
    request.onerror = () => reject(request.error ?? new Error('Could not read the GLB asset.'));
  });
  database.close();
  return stored ? new File([stored.blob], stored.fileName, { type: 'model/gltf-binary' }) : null;
}

export async function deleteGlbFile(key: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete the GLB asset.'));
  });
  database.close();
}

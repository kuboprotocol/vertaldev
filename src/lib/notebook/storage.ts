// Persistência local do Vertal Notebook (IndexedDB). Os cadernos ficam no
// navegador da pessoa, como no Open Notebook self-hosted: só o pedido à IA sai
// do aparelho. Sem IndexedDB (aba privada, teste), cai para localStorage e,
// por fim, só memória.
import { normalizeWorkspace, type Workspace } from './model';

const DB_NAME = 'vertal-notebook';
const STORE = 'workspace';
const KEY = 'v1';
const LS_KEY = 'vertal-notebook-v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no_indexeddb'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb_open_failed'));
  });
}

export async function loadWorkspace(): Promise<Workspace> {
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    if (value) return normalizeWorkspace(value);
  } catch {
    // segue para o localStorage
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return normalizeWorkspace(JSON.parse(raw));
  } catch {
    // sem armazenamento: começa vazio
  }
  return normalizeWorkspace(null);
}

export async function saveWorkspace(ws: Workspace): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(ws, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return;
  } catch {
    // segue para o localStorage
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ws));
  } catch {
    // cheio ou bloqueado: fica só em memória nesta sessão
  }
}

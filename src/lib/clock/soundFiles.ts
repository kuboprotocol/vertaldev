// Sons enviados pelo usuário (músicas e toques do celular) para usar como alarme.
// O arquivo fica no IndexedDB deste navegador; o estado guarda só o nome e o id.
import { CLOCK_LIMITS, addCustomSound, newClockId, removeCustomSound, soundRef } from './store';

export const SOUND_FILE_MAX_BYTES = 20 * 1024 * 1024;

const DB_NAME = 'vertal-clock';
const STORE = 'sounds';
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|amr|3gp)$/i;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export type AddSoundResult =
  | { ok: true; sound: string; name: string }
  | { ok: false; reason: 'type' | 'size' | 'full' | 'storage' };

/** Guarda um arquivo de áudio escolhido pelo usuário e o registra na lista "Meus sons". */
export async function addSoundFile(file: File, count: number): Promise<AddSoundResult> {
  if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)) return { ok: false, reason: 'type' };
  if (file.size === 0 || file.size > SOUND_FILE_MAX_BYTES) return { ok: false, reason: 'size' };
  if (count >= CLOCK_LIMITS.customSounds) return { ok: false, reason: 'full' };
  const id = newClockId();
  const name = file.name.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim() || file.name;
  try {
    await run('readwrite', (s) => s.put(file, id));
  } catch {
    return { ok: false, reason: 'storage' }; // sem espaço, aba anônima ou IndexedDB bloqueado
  }
  const saved = addCustomSound(id, name);
  if (!saved) {
    void run('readwrite', (s) => s.delete(id)).catch(() => undefined);
    return { ok: false, reason: 'full' };
  }
  return { ok: true, sound: soundRef(saved.id), name: saved.name };
}

export async function getSoundFile(id: string): Promise<Blob | null> {
  try {
    const blob = await run<unknown>('readonly', (s) => s.get(id));
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}

export async function removeSoundFile(id: string): Promise<void> {
  removeCustomSound(id);
  await run('readwrite', (s) => s.delete(id)).catch(() => undefined);
}

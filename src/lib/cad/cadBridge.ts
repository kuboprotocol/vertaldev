// Ponte entre o Vertal Chat e o editor do Auto Cadê (mesmo padrão do figCraft).
// - O chat entrega uma planta com sendCadToStudio: se o editor está aberto, ele aplica na hora;
//   senão, a planta fica pendente e o editor a pega ao montar.
// - O editor publica o desenho atual com publishCadDraft, para o chat pedir um ajuste sobre ele.
import type { CadDocument } from './model';

type Listener = (doc: CadDocument) => void;

let pending: CadDocument | null = null;
let draft: CadDocument | null = null;
const listeners = new Set<Listener>();

export function sendCadToStudio(doc: CadDocument): void {
  pending = doc;
  listeners.forEach((listener) => listener(doc));
}

/** O editor pega a planta pendente (uma vez). */
export function takePendingCad(): CadDocument | null {
  const doc = pending;
  pending = null;
  return doc;
}

export function subscribeCad(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishCadDraft(doc: CadDocument): void {
  draft = doc;
}

/** Último desenho aberto no editor (ou null). */
export function getCadDraft(): CadDocument | null {
  return draft;
}

/** Só para testes. */
export function resetCadBridgeForTests(): void {
  pending = null;
  draft = null;
  listeners.clear();
}

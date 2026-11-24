// Provedores próprios (compatíveis com OpenAI) guardados só neste aparelho.
// Nunca guardamos a chave aqui: só o NOME dela no Cofre de Segredos do Vertal.
import { validateCustomProvider, type CustomProvider } from "./core";

export const CUSTOM_PROVIDERS_KEY = "vertal-code-ai:providers";

export function loadCustomProviders(storage: Pick<Storage, "getItem"> = localStorage): CustomProvider[] {
  try {
    const raw = JSON.parse(storage.getItem(CUSTOM_PROVIDERS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .map((p) => validateCustomProvider(p))
      .filter((r): r is { ok: true; provider: CustomProvider } => r.ok)
      .map((r) => r.provider)
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function saveCustomProviders(list: CustomProvider[], storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(list.slice(0, 10)));
}

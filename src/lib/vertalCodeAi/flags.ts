// VERTAL Code AI — interruptor do front-end. Desligado por padrão.
//   VITE_VERTAL_CODE_AI=true            liga para todo mundo (build)
//   localStorage "vertal-code-ai"="on"  liga só neste aparelho (teste no celular)
// O servidor tem o próprio interruptor (VERTAL_CODE_AI_ENABLED); com ele desligado a
// tela mostra só o aviso de indisponível.

export const VERTAL_CODE_AI_NAME = "VERTAL Code AI";
export const VERTAL_CODE_AI_ROUTE = "/vertal-code-ai";
export const LOCAL_FLAG_KEY = "vertal-code-ai";

type EnvLike = Record<string, unknown> | undefined;

export function isVertalCodeAiEnabled(
  envVars: EnvLike = (import.meta as unknown as { env?: EnvLike }).env,
  storage: Pick<Storage, "getItem"> | null = typeof localStorage !== "undefined" ? localStorage : null,
): boolean {
  const v = envVars?.VITE_VERTAL_CODE_AI;
  if (v === true || v === "true") return true;
  try {
    return storage?.getItem(LOCAL_FLAG_KEY) === "on";
  } catch {
    return false;
  }
}

// VERTAL Code AI · aliases /chat e /vertal-chat → /builder (o Vertal Chat fica em /builder). Desligado por padrão.
type EnvLike = Record<string, unknown> | undefined;
export function isVertalCodeAiChatAliasesEnabled(env: EnvLike = import.meta.env as unknown as EnvLike): boolean {
  const v = env?.VITE_VERTAL_CHAT_ALIASES;
  return v === true || v === 'true' || v === '1';
}

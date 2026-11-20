import {
  AVATAR_CLONE_LIMITS,
  AVATAR_VOICE_CATALOG,
  DEFAULT_AVATAR_VOICE,
  isAvatarVoice,
  parseCloneVoiceRef,
  type AvatarVoiceOption,
} from "@/config/avatarPricing";

/** A cloned voice as list_voices / clone_voice return it. `id` is the `clone:<uuid>` value to send as `voice`. */
export interface AvatarUserVoice {
  id: string;
  voice_id: string;
  name: string;
  provider: "clone";
  preview_url: string | null;
  created_at: string;
}

export interface AvatarVoiceGroups {
  library: AvatarVoiceOption[];
  mine: AvatarVoiceOption[];
}

/** Options for the picker: "Biblioteca" (MiniMax + Kokoro) and "Minhas vozes" (clones). */
export function groupAvatarVoices(userVoices: AvatarUserVoice[]): AvatarVoiceGroups {
  return {
    library: AVATAR_VOICE_CATALOG.map(({ id, label, provider, gender, language }) => ({ id, label, provider, gender, language })),
    mine: userVoices.map((v) => ({ id: v.id, label: v.name, provider: "clone", gender: null, language: "pt-BR" })),
  };
}

/** Keeps the selected voice valid: a deleted or unknown clone falls back to the default library voice. */
export function normalizeVoiceSelection(selected: unknown, userVoices: AvatarUserVoice[]): string {
  if (isAvatarVoice(selected)) return selected;
  const cloneId = parseCloneVoiceRef(selected);
  if (cloneId && userVoices.some((v) => v.voice_id === cloneId)) return selected as string;
  return DEFAULT_AVATAR_VOICE;
}

// supabase.functions.invoke hides the body of non-2xx responses; these map the codes creative-video returns.
export function voiceErrorMessage(code: string | null): string {
  const messages: Record<string, string> = {
    consent_required: "Confirme que a voz é sua ou que você tem autorização do dono.",
    name_required: "Dê um nome para a voz.",
    invalid_sample_url: "A amostra de voz não pôde ser usada. Grave ou envie de novo.",
    sample_too_short: `A amostra precisa ter pelo menos ${AVATAR_CLONE_LIMITS.minSampleSeconds} segundos.`,
    sample_too_large: "A amostra ficou grande demais. Envie um trecho mais curto.",
    voice_limit_reached: `Você já tem ${AVATAR_CLONE_LIMITS.maxVoicesPerUser} vozes. Exclua uma para clonar outra.`,
    voice_clone_failed: "O serviço não conseguiu clonar essa voz. Tente uma gravação mais limpa. Os créditos foram devolvidos.",
    voice_save_failed: "Não foi possível salvar a voz. Os créditos foram devolvidos.",
    voices_unavailable: "Não foi possível carregar suas vozes agora.",
    voice_delete_failed: "Não foi possível excluir a voz agora.",
    not_found: "Essa voz não existe mais.",
    deduction_failed: "Créditos insuficientes para clonar a voz.",
    duplicate_request: "Essa amostra já foi enviada. Grave ou envie de novo.",
    avatar_ai_not_configured: "O serviço de avatar ainda não está configurado no servidor.",
    unauthorized: "Sua sessão expirou. Entre novamente.",
  };
  return code && messages[code] ? messages[code] : `Não foi possível concluir${code ? ` (${code})` : ""}.`;
}

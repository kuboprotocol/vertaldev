// Vertal Studio — clonagem de voz com consentimento.
//
// Regras:
//  1. Só usuário autenticado.
//  2. Aceite explícito de consentimento, na versão vigente. O texto do consentimento
//     é o do servidor (o cliente não consegue trocar o que foi aceito).
//  3. Amostra de áudio limitada em tamanho e tipo.
//  4. Provedor de clonagem só é chamado depois que o consentimento foi validado.
//
// Estado atual: o gate está completo; o adaptador do provedor ainda não existe.
// Sem VOICE_CLONE_API_KEY a função responde 503. Com a chave, responde 501 até o
// adaptador ser escrito (ver docs/VERTAL_STUDIO_REVERSE_ENGINEERING.md, seção 4).
import { corsHeaders, sanitizeError } from "../_shared/cors.ts";
import { getUser } from "../_shared/creative.ts";

const CONSENT_VERSION = "voice-consent-v1";
const CONSENT_TEXT =
  "Declaro que sou o titular desta voz ou tenho autorização escrita do titular para cloná-la. " +
  "Entendo que o áudio gerado é sintético e será identificado como tal. " +
  "Não usarei esta voz para se passar por outra pessoa, enganar ou aplicar fraude.";

const MAX_NAME = 60;
const MAX_SAMPLE_BYTES = 5 * 1024 * 1024;
// base64 aumenta ~33%; o limite de caracteres acompanha o limite de bytes.
const MAX_SAMPLE_B64_CHARS = Math.ceil((MAX_SAMPLE_BYTES * 4) / 3) + 8;
const ALLOWED_MIME = /^audio\/(mpeg|mp3|mp4|m4a|wav|x-wav|webm|ogg|aac)$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  const user = await getUser(req.headers.get("Authorization"));
  if (!user) return j(401, { error: "Unauthorized" });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return j(400, { error: "invalid_body" });

    const action = body.action ?? "create";
    if (action !== "create") return j(400, { error: "invalid_action" });

    // 1) Dados da voz
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME) return j(400, { error: "invalid_name" });

    // 2) Consentimento: precisa ser exatamente a versão vigente e estar aceito
    const consent = body.consent ?? {};
    if (
      consent.accepted !== true ||
      consent.owner_confirmed !== true ||
      consent.version !== CONSENT_VERSION
    ) {
      return j(400, { error: "consent_required", consent_version: CONSENT_VERSION, consent_text: CONSENT_TEXT });
    }

    // 3) Amostra
    const sample = typeof body.sample_base64 === "string" ? body.sample_base64 : "";
    const mime = typeof body.sample_mime === "string" ? body.sample_mime.toLowerCase() : "";
    if (!sample) return j(400, { error: "sample_required" });
    if (sample.length > MAX_SAMPLE_B64_CHARS) return j(413, { error: "sample_too_large" });
    if (!ALLOWED_MIME.test(mime)) return j(415, { error: "unsupported_audio_type" });

    // 4) Provedor
    const apiKey = Deno.env.get("VOICE_CLONE_API_KEY");
    if (!apiKey) return j(503, { error: "voice_clone_provider_not_configured" });

    // TODO(adaptador): gravar o consentimento (tabela voice_consents: user_id, versão,
    // hash da amostra, IP, data) ANTES de chamar o provedor, e só então criar o voice_id.
    // Até essa tabela existir, não processar nada aqui.
    console.warn("[voice-clone] provider configured but adapter not implemented", {
      user: user.id,
      name_len: name.length,
      bytes_approx: Math.floor((sample.length * 3) / 4),
    });
    return j(501, { error: "voice_clone_adapter_not_implemented", status: "not_implemented" });
  } catch (e) {
    console.error("[voice-clone] error:", e);
    return j(500, { error: sanitizeError(e) });
  }
});

function j(s: number, b: unknown) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

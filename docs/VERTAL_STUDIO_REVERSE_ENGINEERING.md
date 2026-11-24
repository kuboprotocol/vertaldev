# Vertal Studio — Engenharia reversa: voz, avatar e música

Documento de mapeamento do que já existe no repositório `kuboprotocol/vertaldev`, o que
cada parte realmente faz, o que **não** existe, e como o painel unificado (`Vertal Studio`)
se apoia nisso.

Data: 2026-11-24 · Branch: `ccr-e4d9a055-2w7vev`

---

## 1. O que foi encontrado no vertal.dev

| Fonte | Resultado |
|---|---|
| `https://vertal.dev` (HTTP 200) | Título "Vertal Vibe Dev — Crie apps com IA". É o criador de apps, não um estúdio de mídia. |
| Bundle público `/js/index-*.js` | Nenhuma ocorrência de "clone"/"clonar" no bundle público. |
| Repositório | Os recursos de voz, avatar e música ficam no **Painel Criativo** (`src/components/creative/*`, `src/components/CreativeMusic.tsx`). |

Conclusão: a funcionalidade existe no código, mas está espalhada e não se apresenta como um
produto único de estúdio.

---

## 2. Mapa do sistema atual

### 2.1 Avatar falante (voz + lip-sync)

| Camada | Arquivo | Papel |
|---|---|---|
| Configuração | `supabase/functions/_shared/avatarConfig.ts` | Modelos (`fal-ai/minimax/speech-02-hd`, `fal-ai/kling-video/ai-avatar/v2/standard`), limites (1000 caracteres, timeout 20 min), vozes, precificação. |
| Preço (frontend) | `src/config/avatarPricing.ts` | Reexporta `avatarConfig.ts`. Função `quoteAvatar(text, withPhoto)`. |
| Backend | `supabase/functions/creative-video/index.ts` | `mode: "avatar"`: submit (cobra voz, gera áudio, opcionalmente enfileira lip-sync) e `action: "status"` (faz polling, reembolsa em falha). |
| Speaker (roteiro) | `supabase/functions/agent-avatar-speaker/index.ts` | Só gera roteiro/SSML em JSON. **Não renderiza** (`render_provider: null`). |
| UI | `src/components/creative/CreativeToolInterface.tsx` (chama `creative-video`), `AvatarProgressSteps.tsx`, `AvatarCropDialog.tsx`, `useAvatarUrl.ts` | Fluxo de criação e recorte de foto. |

**Fluxo real (submit):**
1. Valida texto (≤ 1000 caracteres).
2. Cobra créditos da voz (`avatarVoiceCredits`) **antes** de gerar — `withRefundOnFailure` devolve se falhar.
3. Chama TTS na fal.ai com `voice_id` vindo de `AVATAR_VOICES` (ou env `AVATAR_VOICE_<NOME>`).
4. Reidrata o MP3 para o bucket privado `uploads/{user}/avatar/…` (URL assinada de 30 dias).
5. Sem foto → retorna `completed` com `audio_url`.
6. Com foto → cobra vídeo (`avatarVideoCredits(seconds)` = 4 créditos/segundo, mínimo 5) e enfileira Kling na fila da fal.ai.

**Fluxo real (status):** lê `creative_assets`, consulta a fila da fal.ai, reidrata o MP4 e,
em falha/timeout, reembolsa via RPC `execute_atomic_credit_topup` (idempotente por `asset_id`).

**Resposta de status** (contrato usado pelo painel):
```
{ ok, asset_id, status, audio_url, video_url, error, refunded }
```

### 2.2 Música

| Camada | Arquivo | Papel |
|---|---|---|
| Backend | `supabase/functions/creative-music/index.ts` | Suno via `apibox.erweima.ai`. Ações: `generate`, `status`, `download`. |
| Serviço | `src/services/musicGeneratorService.ts` (531 linhas), `src/hooks/useMusicGenerator.ts` | Cliente e polling. |
| UI | `src/components/CreativeMusic.tsx` | Gêneros, humores, geração. |
| Preço | `src/config/musicPricing.ts` | Gêneros/estilos/humores e preço. |
| Doc | `docs/MUSIC_GENERATOR.md` | Documentação anterior. |

**Contrato real:**
- `generate` `{prompt, instrumental, style}` → `{task_id, asset_id}`; cobra `COST_GEN`.
- `status` `{task_id, asset_id}` → `{status, items[]}`; `items[].audioUrl` quando pronto.
- `download` `{format: mp3|wav, asset_id}` → cobra 1 (mp3) ou 2 (wav) créditos.

### 2.3 Voz — o que existe de fato

| Arquivo | O que é |
|---|---|
| `src/lib/voice/voiceService.ts` | **Speech-to-text** (Web Speech API, `pt-BR`). Também tem `transcribeWithWhisper` (OpenAI). |
| `src/lib/voice/useDictation.ts` | Ditado. |
| `src/components/vertal-chat/VoicePanel.tsx` | Painel de ditado para o chat. |

**Não existe clonagem de voz.** As "vozes" do avatar são três IDs de catálogo fixos
(`Deep_Voice_Man`, `Wise_Woman`, `Friendly_Person`). Nenhum endpoint recebe amostra de áudio
do usuário, cria um `voice_id` próprio ou guarda consentimento.

---

## 3. Divergências encontradas (para corrigir antes de cobrar)

| # | Divergência | Onde | Impacto |
|---|---|---|---|
| D1 | Música custa **3 créditos** no texto de preço, mas a função cobra **1** (`COST_GEN = 1`, "rounded from 0.001"). | `musicPricing.ts` × `creative-music/index.ts` | Receita ou preço exibido incorreto. Decidir o valor correto e alinhar. |
| D2 | Frontend chama `creative-video`; também existe `creative-video-studio` (com `index_test.ts`). | `CreativeToolInterface.tsx` × `supabase/functions/` | Duplicidade de fluxo de vídeo. |
| D3 | `agent-avatar-speaker` promete "render" mas retorna `render_provider: null`. | `agent-avatar-speaker/index.ts` | Função é só roteiro. Não vender como avatar renderizado. |
| D4 | `voiceService.transcribeWithWhisper` retorna texto vazio sem chave (não grava). | `voiceService.ts` | Fallback silencioso. |
| D5 | `captureAudioBlob` grava por 30 s fixos e chama `getUserMedia` sem liberar o stream em erro de `start`. | `voiceService.ts` | Possível vazamento de microfone. |

---

## 4. Lacunas a fechar para uma clonagem de voz real

1. **Consentimento verificado**: texto de consentimento versionado, aceite registrado com
   usuário, IP, data e hash da amostra. Hoje não há tabela para isso.
2. **Verificação de titularidade**: frase de verificação gerada pelo sistema, gravada pelo
   próprio titular (anti-replay de áudio pré-gravado). Não implementada.
3. **Provedor de clonagem**: escolher um provedor, definir o contrato de criação do
   `voice_id`, e configurar o secret. Sem isso a função responde `503`.
4. **Marca d'água / rastreio**: o áudio gerado deve sair com identificação (metadados e
   registro em `creative_assets`), e o painel deve mostrar aviso de origem sintética.
5. **Limites**: tamanho de amostra (≤ 10 MB), formato (`audio/*`), e bloqueio de vozes de
   terceiros sem autorização.

---

## 5. Arquitetura do Vertal Studio (o que foi construído)

```
src/components/studio/VertalStudioPanel.tsx   ← painel unificado (4 abas)
   ├─ Voz       → creative-video {mode:"avatar"} sem foto (só áudio)
   ├─ Avatar    → creative-video {mode:"avatar"} com foto + polling de status
   ├─ Música    → creative-music {action:"generate"|"status"}
   └─ Clonar    → voice-clone (com consentimento; 503 até provedor configurado)

supabase/functions/voice-clone/index.ts       ← validação de consentimento + gate do provedor
docs/VERTAL_STUDIO_REVERSE_ENGINEERING.md     ← este documento
```

### Regras do painel
- Custo exibido **antes** de gerar (`quoteAvatar`), igual ao backend.
- Nada é cobrado pelo painel diretamente: a cobrança é sempre feita pela função.
- Clonagem só é enviada com a confirmação de titularidade marcada e o texto de consentimento
  aceito.
- Estados de erro mapeados para mensagens em português; polling para ao concluir, falhar ou
  após o timeout de 20 minutos.

---

## 6. Próximos passos

1. Decidir o preço da música (D1) e alinhar `musicPricing.ts` com `creative-music`.
2. Criar migração para `voice_consents` (usuário, versão do texto, hash da amostra, IP, data).
3. Escolher o provedor de clonagem e implementar a criação do `voice_id` em `voice-clone`.
4. Rodar `npm ci` e o typecheck; adicionar teste do painel.
5. Unificar `creative-video` × `creative-video-studio` (D2).

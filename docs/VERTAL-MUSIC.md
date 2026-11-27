# Vertal Music AI (painel Música do Painel Criativo)

## O que é
Porte do **Studio de criação de música da MusKAI** (repo kuboprotocol/MusKAI, `src/components/Studio.tsx` +
`supabase/functions/generate-music` / `_shared/music/core.ts`) para o Vertal Dev, no design do Vertal Dev:
título automático, Estilo/Mood, Energia/BPM, **Vibe DNA** (Depth/Punch/Space/Texture), vocal/tom/tonalidade,
instrumentos, letra **Auto / Assistido / Letra pronta**, idioma, referência, **Super Prompt** ao vivo,
progresso Enviando → Processando → Finalizando, player + download MP3 e últimas músicas.

- Front: `src/components/creative/VertalMusicStudio.tsx` (aberto em `/creative/music` e no painel "Música IA" do Vertal Chat).
- Servidor: edge function `creative-music` (ações `config`, `generate`, `status`, `history`, `download`).
- Lógica pura e testada: `supabase/functions/_shared/music/vertalMusicCore.ts` (`src/lib/music/vertalMusicCore.test.ts`).

## Provedores (em ordem)
1. **muskai** — sunoapi.org, exatamente a tecnologia da MusKAI (`api.sunoapi.org/api/v1/generate`, `customMode`,
   modelo `V4_5`, 2 versões A/B). Liga só com `SUNOAPI_KEY` (chave **paga**; o Vertal Dev não tem hoje).
2. **vertal** — motor próprio: ACE-Step v1.5 XL Turbo (MIT) no Modal (`infra/vertal-gpu-modal/vertal_music.py`),
   com `VERTAL_OWN_MUSIC_URL` + `VERTAL_OWN_MUSIC_TOKEN`. Usa os créditos mensais do Modal (limite US$ 30/mês).

`VERTAL_MUSIC_PROVIDER=muskai|vertal` força um; `off` desliga (o painel avisa e não cobra).
Sem nenhum provedor configurado o painel responde "temporariamente indisponível" **sem cobrar**.

Config: segredos avulsos da função vencem; como o projeto Supabase está no limite de 100 segredos, as chaves
ficam no **Cofre de segredos** (`/secrets`) da conta dona (`VERTAL_FREE_KEYS_OWNER` no `VERTAL_GPU_CONFIG`,
ou `VERTAL_MUSIC_KEYS_OWNER`). Chaves lidas: `SUNOAPI_KEY`, `SUNO_MODEL`, `VERTAL_OWN_MUSIC_URL`,
`VERTAL_OWN_MUSIC_TOKEN`, `VERTAL_MUSIC_PROVIDER`, `VERTAL_MUSIC_CHARGE_ADMINS`.

## Letra
Modo Letra pronta usa o texto do usuário. Auto/Assistido escrevem a letra no idioma escolhido com LLM grátis
(Cerebras `gpt-oss-120b` → OpenRouter grátis); se nenhum responder, usa uma letra-modelo com o tema do usuário.

## Créditos
- **1 crédito por música** (mesmo preço de antes; `creative-router` estima `music: 1`).
- Cobrança em `credit_transactions` via `execute_atomic_credit_deduction` com `idempotency_key = music:<X-Idempotency-Key>`.
- Falha no envio → reembolso automático na mesma chamada (`withRefundOnFailure`).
- Falha depois (provedor falhou, job sumiu, 15 min sem resultado) → `status` devolve com
  `execute_atomic_credit_topup` (`refund:<chave da cobrança>`, idempotente) e marca o asset `failed`.
- Admins não pagam, salvo `VERTAL_MUSIC_CHARGE_ADMINS=true` (usado para o teste ao vivo).

## Custos medidos (26/11/2026)
Motor próprio: carga a frio ~7 s + geração ~2 s para 45 s de música, GPU L4/A10G/L40S, desliga 60 s depois.
sunoapi.org: preço do plano do provedor (não contratado).

## Ritmos e idiomas do mundo (27/11/2026)

- **Estilo:** campo com busca (catálogo `supabase/functions/_shared/music/worldGenres.ts`, 140+ ritmos do Brasil e do mundo:
  samba, forró, sertanejo, funk carioca, axé, pagode, MPB, bossa nova, cumbia, reggaeton, bachata, salsa, tango, k-pop,
  j-pop, afrobeats, amapiano, highlife, bhangra, Bollywood, fado, flamenco, chanson, schlager, raï, dabke, pop árabe,
  qawwali, gamelan…) ou texto livre. Os 18 estilos antigos seguem primeiro e com o mesmo pedido de antes; ritmos novos
  levam uma descrição curta de instrumentos/levada para o motor.
- **Idioma da letra:** os 50 idiomas do ACE-Step 1.5 (`acestep/constants.py` VALID_LANGUAGES); Português continua padrão;
  idioma fora da lista vai como `unknown` (antes virava `pt` no core e `en` no motor).

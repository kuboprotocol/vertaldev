# Vertal · Clonador de voz (Vertal Chat + Studio de Música)

Pedido do Laércio (27/11/2026): no Vertal Chat ele criou uma música e pediu "clona a minha voz e coloca na música";
o chat travou. Agora existe um **Clonador de voz** reutilizável, nos dois lugares, e o chat chama ele quando o
usuário pede para clonar a voz, falar ou cantar com a própria voz.

## Por que o chat travou (causa raiz)

1. Não existia ferramenta de clonagem de voz no Vertal Chat. Para "clona a minha voz", o modelo principal devolveu
   saída vazia nas duas tentativas e o modelo de resgate escolheu a única coisa "de voz" que existia:
   abrir o painel `voice` (gravador de ditado).
2. O painel `voice` está em `PANELS` (`supabase/functions/_shared/chatAgent.ts`) mas não estava em `PANEL_LIST`
   (`src/components/vertal-chat/panelList.ts`). `PANEL_BY_KEY["voice"]` era `undefined` e o chat quebrava em
   `VertalChat.tsx` (chip do painel: `info.icon` / abrir painel: `PANEL_BY_KEY[key].route`). A resposta nunca era
   salva e a tela caía no erro. Produção, 27/11 14:31–14:32 (horário de Brasília): 3 pedidos ("Clone a minha voz",
   "Continue", "Continue"), `creative-router` respondeu 200 nas 3 (resgate `gemini-2.5-flash` após saída `empty`),
   nenhuma ferramenta chamada depois, `runtime-error-beacon` logo após cada resposta e nenhuma resposta do
   assistente gravada em `creative_messages`.

Correção (vale para todos, é só conserto de quebra): `voice` e `voice_clone` entram em `HIDDEN_PANELS`
(abrem pelo chat, não aparecem no menu) e o chat ignora com segurança qualquer painel desconhecido.

## Como funciona

- **Salvar a voz** (painel "Clonador de voz"): gravar no navegador (MediaRecorder) ou enviar arquivo, 8–90 s
  (recomendado 10–60 s), nome, e o **consentimento explícito** ("a voz é minha ou tenho autorização por escrito").
  A amostra vai para o bucket privado `uploads/<user_id>/voices/`; a voz e o consentimento (versão, texto do servidor,
  data, IP, navegador) ficam em `vertal_voice_clones` (RLS: o usuário só lê as próprias). Máx. 5 vozes por conta.
- **Falar** (`voice_speak`): texto → áudio com a voz clonada (Chatterbox Multilingual, zero-shot, pt/en/es e +20).
- **Cantar** (`voice_sing`): música já criada → Demucs separa voz/instrumental → Seed-VC converte a voz cantada para
  a voz do usuário → mixa de novo → MP3. Só aceita áudio do próprio usuário no Supabase (nunca URL qualquer).
- **Vertal Chat**: ferramenta `voice_clone` (`setup` abre o Clonador; `list`; `speak`; `sing` com o artefato de música
  da conversa). Mostra o passo "Cantando a música com a sua voz (1 a 4 min)", tem prazo (fala 2,5 min, canto 5 min) e,
  se estourar, responde com mensagem clara — o trabalho continua no servidor e aparece no histórico do Clonador.
  Sem voz salva, abre o Clonador e explica o que fazer.
- **Studio de Música**: em cada música pronta (e nas últimas músicas) aparece "Usar minha voz": escolher a voz,
  "Cantar com minha voz", "Clonar minha voz" (abre o Clonador) e a opção "cantar automaticamente nas próximas músicas".
- Respostas no idioma do usuário (pt-BR padrão; en/es).

## Servidor (sem função nova)

Ações `voice_*` dentro da edge function existente **`creative-music`** (`supabase/functions/creative-music/voice.ts`),
porque o projeto está no limite de funções. Regras puras em `supabase/functions/_shared/voiceClone.ts`.
Motor: app Modal próprio **`vertal-voice`** (`infra/vertal-gpu-modal/vertal_voice.py`), mesma API do `vertal-music`
(`/submit`, `/status?id=`, `/result?id=`), L4/A10G, `max_containers=1`, desliga 60 s depois do último uso.

## Flags e configuração (tudo desligado por padrão)

No segredo JSON `VERTAL_GPU_CONFIG` (o `creative-router` lê só dele/segredo avulso; o `creative-music` também lê o
cofre da conta dona):

| Chave | Padrão | O que faz |
|---|---|---|
| `VERTAL_OWN_VOICE_ENABLED` | desligado | liga o Clonador |
| `VERTAL_OWN_VOICE_USER_IDS` | só a conta do Laércio | lista de quem pode usar |
| `VERTAL_OWN_VOICE_URL` / `VERTAL_OWN_VOICE_TOKEN` | — | app Modal `vertal-voice` (sem eles: salva voz, mas falar/cantar respondem "indisponível") |
| `VERTAL_OWN_VOICE_CREATE_CREDITS` | 0 | salvar voz |
| `VERTAL_OWN_VOICE_TTS_CREDITS` | 1 | falar |
| `VERTAL_OWN_VOICE_SING_CREDITS` | 3 | cantar uma música |
| `VERTAL_OWN_VOICE_CHARGE_ADMINS` | desligado | cobra também contas admin (teste ao vivo) |

Cobrança: debita antes de enviar; se o envio falhar, devolve na hora; se o trabalho falhar ou passar de 15 min,
`voice_status` devolve (idempotente). Custo estimado (L4 ≈ US$0,80/h): fala curta ≈ US$0,005; música de 2–3 min
≈ US$0,02–0,04 + ~US$0,015 de partida a frio. Com crédito a US$0,03, 1 crédito (fala) e 3 créditos (canto) cobrem
com folga; ajuste pelas chaves acima. Limite do Modal US$30/mês continua igual.

## Licenças

- Chatterbox (Resemble AI) — MIT, código e pesos `ResembleAI/chatterbox`.
- Demucs (Meta) — MIT.
- **Seed-VC (Plachtaa) — GPL-3.0** (código e pesos `Plachta/Seed-VC`). Usado só como serviço no servidor próprio
  (Modal), sem distribuir o programa; o código do Vertal Dev não importa nem linka o Seed-VC (só HTTP). A GPL-3.0
  (diferente da AGPL) não obriga a abrir o código por uso em rede. Se preferir só licenças permissivas, alternativa:
  RVC (MIT), que exige treinar um modelo por voz (minutos de GPU por voz, mais caro e lento).

## Para ligar (depende do OK do Laércio)

1. Aplicar a migração `supabase/migrations/20261127210000_vertal_voice_clones.sql` (atenção: ao fazer merge na main,
   a integração do Supabase aplica a migração em produção automaticamente).
2. `modal secret create vertal-voice-auth VERTAL_VOICE_TOKEN=<token>` e
   `modal run vertal_voice.py::download && modal deploy vertal_voice.py` (primeiro deploy pode pedir ajuste de versões).
3. Em `VERTAL_GPU_CONFIG`: `VERTAL_OWN_VOICE_ENABLED=true`, `VERTAL_OWN_VOICE_URL`, `VERTAL_OWN_VOICE_TOKEN`.
4. Deploy do front e das funções `creative-music` e `creative-router`.

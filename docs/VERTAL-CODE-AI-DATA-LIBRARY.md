# VERTAL Code AI → Vertal Data Library (Vertaldephin)

"Logística reversa de dados": o VERTAL Code AI devolve o **uso** dele para o próprio livro
**"Vertal Code AI"** no Knowledge Book (repo `kuboprotocol/vertaldephin.Knowledge-API`, Data Library / Fase 7).
É a versão de **servidor** do mesmo protocolo do `vertal-collect.js`: mesma chave de ingestão por app
(`vdl_…`), mesmo hash de usuário (`sha256("vertal-code-ai:user:<id>")`), mesmo formato de lote com consentimento.

**Desligado por padrão.** Sem a config abaixo nada muda: nem consulta ao banco, nem chamada de rede.

## Onde está

| Peça | Arquivo |
| --- | --- |
| Envio (config, consentimento, classificador, redação, lote, rastreio) | `supabase/functions/_shared/vertalCodeAi/dataLibrary.ts` |
| Ligação no pedido (run, imagem, vídeo) | `supabase/functions/vertal-code-ai/index.ts` (linhas marcadas "Data Library") |
| Tokens/custo por chamada | `chainRunner.ts` devolve `usage` (opcional) no `ModelReply`; roteamento e cobrança iguais |
| Repasse do banner de cookies | `src/lib/vertalCodeAi/client.ts` → `readVertalCodeAiDataConsent()` (só lê; nenhuma tela nova) |
| Testes | `src/lib/vertalCodeAi/dataLibrary.test.ts` (+1 asserção em `gpuRouting.test.ts`) |

Não toca no Vibe Code, `vibe-code-agent`, sistemas de jogo/código/design, lista de liberação nem gating (guarda `engine-guard.mjs` passa).

## Como ligar (precisa do OK do Laércio)

1. No Knowledge API: aplicar as migrations 008 e 009 no **staging**, fazer o bootstrap dos livros, criar a chave
   de ingestão do livro `vertal-code-ai` e ligar `collection_enabled` (exige `consent_policy_url`); `DATA_LIBRARY_INGEST_ENABLED=true` na API.
2. Aqui, **sem segredo novo** (o projeto está no limite de 100): colocar dentro do `VERTAL_GPU_CONFIG` a chave
   ```json
   "VERTAL_DATA_LIBRARY": { "enabled": true, "endpoint": "https://<api do Knowledge API>", "key": "vdl_vertal_code_ai_…" }
   ```
   (ou um segredo avulso `VERTAL_DATA_LIBRARY` com o mesmo JSON, que vence). Opcionais: `"policy": "v1"`,
   `"sources": ["rewards_panel","cookie_banner"]`, `"rawContent": false`, `"batchSize": 20`, `"timeoutMs": 3000`.
3. Desligar: `"enabled": false` (ou apagar a chave). Efeito imediato.

## Consentimento: só o que já existe (nenhuma tela nova)

Sem consentimento **gravado** não sai nada. Recusa explícita sempre vence.

| Fonte | Onde está gravado | Quem grava | O que libera aqui |
| --- | --- | --- | --- |
| `rewards_panel` — aceite do Vertal Node no painel de recompensas (`/shortlinks`) | `public.vertal_nodes.opted_in = true` (algum dispositivo do usuário) | app nativo Vertal Node → `vertal-node-heartbeat` | Uso **anonimizado** (`run.started`, `run.finished`, `media.finished`). Nunca texto cru. Linhas existentes todas `opted_in=false` = revogado → não envia. |
| `cookie_banner` — banner de cookies | `localStorage["cookie_consent"]` = `granted`/`denied` + `cookie_consent_evidence` (`purposes`, `noticeVersion`) | `ConsentBanner` de `kuboprotocol/vertal` (vertal.app) | `granted` → uso **anonimizado**. `denied` ou Global Privacy Control → **bloqueia tudo**, mesmo com aceite no painel. Texto cru só se `purposes` contiver `vertal_code_ai_content` **e** a config tiver `rawContent: true`. |

Ordem da decisão: GPC → cookie `denied` → painel `granted` → cookie `granted` → painel revogado → nada gravado.
Cada registro leva `consent_source` (qual das duas fontes o cobriu) para auditoria.

### O que encontrei (importante antes de ligar)

- **O banner de cookies não está no vertal.dev.** Ele existe só em `kuboprotocol/vertal` (vertal.app), grava no
  `localStorage` daquele domínio e aparece só nas regiões que exigem consentimento (UE/EEE, Reino Unido, Suíça, Canadá).
  Visitantes do Brasil não veem o banner, então não há registro. No vertal.dev essas chaves não existem hoje, e o
  navegador não lê o `localStorage` de outro domínio. Na prática, **hoje só o painel de recompensas libera envio**.
  O repasse já está pronto: se o mesmo banner (mesmas chaves) entrar no vertal.dev, passa a valer sem mudar nada aqui.
- **Finalidade (LGPD art. 6º, I, e art. 8º, §4º):** os textos atuais não citam o VERTAL Code AI. O banner fala em
  "medir a eficácia dos anúncios do Google" (`purposes: ["ads_measurement"]`); o painel cobre o vertal.js
  (status, recompensas, deep link) e o compartilhamento no app. Antes de ligar, convém incluir nos dois avisos a
  finalidade "estatísticas de uso do VERTAL Code AI para melhorar o produto" e subir a versão do aviso. Decisão do Laércio / jurídico.
- **Texto cru:** nenhum consentimento atual cobre. Ele não sai, mesmo com `rawContent: true`.

## O que vai (contrato `vca.usage.v1`)

Por pedido de texto: `run.started` e `run.finished`; imagem/vídeo: `media.finished`. Campos:
modo (`plan`/`build`), opção (`auto`/`code`/`livre`/`turbo`/`pro`), esforço, modelo fixado (sim/não),
**categoria do pedido** (classificador por palavras-chave, no servidor: `ui`, `styling`, `backend`, `database`, `auth`,
`bugfix`, `refactor`, `test`, `docs`, `deploy`, `game`, `data`, `integration`, `question`, `image`, `video`, `other`),
tamanho do pedido em faixa (`xs`…`xl`), nº de imagens/anexos/turnos, resultado (`success`/`error` + código),
latência, nº de chamadas, nível do último modelo (`self_hosted`/`free`/`paid`), rótulo **Vertal** do modelo
(nunca nome de provedor), modelo próprio usado (sim/não), reserva acionada (sim/não), tokens de entrada/saída,
custo em US$, arquivos alterados, verificado. Mídia: tipo, saídas, segundos de vídeo (latência do vídeo = até o envio do trabalho).

Nunca vai: texto do pedido, código, nomes de arquivo, id do usuário (só o hash), id do pedido (só `run_ref`, 16 hex de um hash), IP (o envio é servidor→servidor), e-mail.

Opt-in de texto cru (`run.content`, kind `other`): trecho de até 1.500 caracteres do pedido e do primeiro arquivo alterado,
redigidos aqui (e-mail, CPF/CNPJ, telefone, cartão, IP, chaves, tokens, JWT) e de novo na API, + hash SHA-256 do pedido.

## Garantias de funcionamento

- Lote por isolate (até 20 por envio, fila máx. 500, acima disso descarta), timeout de 3 s, erros engolidos;
  envio agendado com `EdgeRuntime.waitUntil` depois da resposta. O consentimento é consultado em paralelo.
  Nada disso atrasa nem derruba o pedido do usuário (testado com a API fora do ar e consulta ao banco falhando).
- Logs: só "N registro(s) não enviados", sem conteúdo.
- Apagar os dados de alguém: `DELETE /api/data-library/books/vertal-code-ai/subjects/<sha256("vertal-code-ai:user:<id>")>` no Knowledge API.

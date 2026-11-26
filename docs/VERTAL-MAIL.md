# Vertal Mail — caixa de e-mail profissional + Gmail/Outlook → Vertal CRM

Pedido do Laércio (26/11/2026): transformar a caixinha "Emails" do painel num sistema de receber e enviar
e-mail que o cliente pode usar como e-mail profissional, ligado ao Vertal CRM grátis; e as contas Gmail e
Outlook conectadas ganham subpáginas em Conectores e alimentam o CRM — só as contas que o cliente escolher.

**Status (26/11/2026, OK do Laércio — opção A):** ligado para TODOS os clientes em `@vertal.dev`. Catch-all de vertal.dev →
Worker `vertaldev`; regras específicas (contato@, developers@ → Gmail do Laércio) continuam antes do catch-all. Antes o catch-all
estava desligado (endereço desconhecido = recusado), então `MAILBOX_FALLBACK_FORWARD` fica vazio e o comportamento para
endereços desconhecidos não muda. Envio pelo Resend grátis (100/dia no total): `dailySendCap` 20 por usuário e
`globalDailySendCap` 90 somando todos; ao bater qualquer um a tela mostra "Limite diário atingido". O Vertal CRM continua só
para a conta dele: para os outros, o interruptor "Alimentar o CRM" some e aparece um link para a lista de espera (/crm).

Originalmente tudo desligado por padrão. Aditivo: não muda o motor do Vibe Code, prompts, roteamento de modelos,
o conector Gmail/Outlook existente nem os clientes OAuth. Nenhum escopo novo, nenhum segredo novo,
nenhuma edge function nova, nada pago.

## Onde fica

| O quê | Onde |
|---|---|
| Caixa de e-mail (Entrada, Enviados, Lixeira, Spam, Escrever, Responder, endereços, contas conectadas) | `/emails` (botão "Emails" do painel). Desligado → `/emails` continua sendo o registro de envios, igual a antes; ligado → o registro fica no botão "Registro de envios". |
| Subpágina de cada conta Gmail | `/connectors/gmail/<id da conta>/inbox` |
| Subpágina do Outlook | `/connectors/microsoft-outlook/inbox` (uma conexão Outlook por usuário no Vertal Fluxos) |
| Interruptor "Alimentar o CRM" | Em cada subpágina e na coluna "Contas conectadas" da caixa. Gmail/Outlook: **desligado** por padrão. Endereço profissional: ligado por padrão (`crmFeedDefault`). |
| Servidor | edge function existente `vertal-code-ai`, `{action:"mailbox", op}` — `supabase/functions/_shared/vertalMailbox/` |
| Recebimento | Worker do vertal.dev, handler `email` (`worker/mailboxInbound.ts`, decodifica com postal-mime, MIT-0) |
| Banco | `supabase/migrations/20261126200000_vertal_mailbox.sql` (NÃO aplicada): `mailbox_addresses`, `mailbox_messages`, `mail_crm_feeds`, RLS só leitura do dono; escrita só pelo servidor. |

## Como funciona

- **Receber (grátis):** Cloudflare Email Routing do domínio → regra catch-all "Send to Worker" → Worker `vertaldev`
  → acha o dono em `mailbox_addresses` → grava em `mailbox_messages`. Endereço desconhecido ou >10 MB é recusado.
  `ana+qualquer@dominio` cai na caixa `ana@dominio`. Anexos: por enquanto só nome/tamanho (não guarda o arquivo).
- **Enviar:** pelo provedor que o app já usa (`RESEND_API_KEY`, o mesmo do `contact-request`). Só sai de domínio listado em
  `outboundDomains` (precisa estar verificado no Resend). Limite diário por usuário (`dailySendCap`, padrão 50).
- **Gmail:** a subpágina usa as funções `gmail-list-messages`, `gmail-get-thread`, `gmail-send-message` de sempre,
  sem `chatCharge` (grátis, como a caixa do conector hoje). Mesmos escopos.
- **Outlook:** ações `listMessages`, `getMessage`, `sendEmail`, `replyToEmail` do app `microsoft-outlook` do motor do
  Vertal Fluxos, pela conexão que o usuário já tem (`fluxos_connections`), sem cobrança.
- **CRM (sem IA, sem crédito):** para cada e-mail das contas marcadas cria/atualiza o contato (nome, e-mail),
  a empresa pelo domínio (nunca para gmail.com/hotmail.com etc.) e registra uma nota `source=email`
  (`external_ref = <origem>:<id>`, sem duplicar). Ignora remetentes automáticos (no-reply, notifications…).
  Roda ao abrir a caixa (no máximo a cada 15 min por conta) e no botão "Sincronizar com o CRM".
  Só funciona para quem tem o Vertal CRM liberado (`VERTAL_CRM_USER_IDS`).
- **Idioma:** pt-BR, en, es (idioma salvo do usuário → navegador → pt-BR; os outros idiomas do Vertal caem no mais próximo).

## Flags

1. Servidor — dentro do segredo existente `VERTAL_GPU_CONFIG` (o projeto está no limite de 100 segredos):

```json
"VERTAL_MAILBOX": {
  "enabled": true,
  "userIds": ["*"],
  "aliasDomains": ["vertal.dev"],
  "outboundDomains": ["vertal.dev"],
  "dailySendCap": 20,
  "globalDailySendCap": 90,
  "crmFeedDefault": true
}
```

2. Front — `.env.production`: `VITE_VERTAL_MAILBOX=true` (hoje `false`). Mesmo ligado, quem não está em `userIds` vê o `/emails` antigo.
3. Worker — `wrangler.jsonc` → `MAILBOX_INBOUND_ENABLED: "true"` (hoje vazio = recusa tudo) e, se o catch-all de vertal.dev for para o Worker, `MAILBOX_FALLBACK_FORWARD: "<destino de hoje>"`.

## Decisões do Laércio para ir ao ar

1. **Domínio dos endereços profissionais.** Achado em 26/11/2026: `vertal.dev` JÁ usa o Cloudflare Email Routing (MX
   `route1/2/3.mx.cloudflare.net`), ou seja, já existem regras de encaminhamento lá. Duas opções:
   - **A (recomendada):** `vertal.dev` mesmo (ex.: `ana@vertal.dev`) — sem mudar MX: só trocar o catch-all para "Send to Worker
     `vertaldev`" e pôr o destino atual em `MAILBOX_FALLBACK_FORWARD` (o Worker devolve tudo que não for caixa do Vertal Mail para lá;
     regras de endereços específicos que já existem continuam valendo antes do catch-all).
   - **B:** subdomínio `mail.vertal.dev` (Email Routing → Settings → adicionar subdomínio; a Cloudflare cria MX/TXT novos). Não toca no que existe hoje.
2. **Ligar a regra** escolhida acima (mudança no painel da Cloudflare; grátis).
3. **Verificar o domínio de envio no Resend** (DKIM/SPF no Cloudflare). Não achei registro DKIM do Resend em `vertal.dev` nem em
   `kubovibe.dev` (26/11/2026), então hoje é provável que nenhum domínio esteja verificado. O plano grátis do Resend tem 1 domínio e
   3.000 e-mails/mês (100/dia). Sem isso, receber funciona e enviar mostra "envio ainda não liberado".
4. **Aplicar a migração** `20261126200000_vertal_mailbox.sql` no Supabase.
5. **Merge do PR** (o deploy do Worker e da edge function sai pelo fluxo de sempre) e ligar as 3 flags acima só para a conta dele.
6. Depois (opcionais): domínio próprio do cliente (precisa do domínio na Cloudflare ou Cloudflare for SaaS; e cada domínio de envio
   verificado — no Resend grátis só cabe 1); guardar anexos no Storage; sincronização com o CRM em segundo plano (cron do Agendador)
   em vez de só ao abrir; abrir para outros clientes.

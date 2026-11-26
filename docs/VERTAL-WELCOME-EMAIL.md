# Vertal · e-mail de boas-vindas v2 (inglês)

Pedido do Laércio (2026-11-26): ao criar conta no Vertal Dev, mandar um e-mail de boas-vindas em inglês, com o logo
Vertal, caloroso e humano, convidando a ler a documentação. **Entregue desligado.**

## O que muda

Já existia um e-mail de boas-vindas (`welcome`, pt-BR, marca antiga "KUBO VIBE"), enviado pela edge function
`send-welcome-email`, chamada por `src/pages/AuthPage.tsx` logo após o `signUp` por e-mail. Em vez de mandar dois
e-mails, o v2 **substitui o conteúdo** desse envio quando ligado:

| | Flag desligada (padrão) | Flag ligada |
|---|---|---|
| Cadastro por e-mail (AuthPage) | igual a hoje: `welcome` antigo | v2, mas só se o e-mail já estiver confirmado; senão espera |
| Confirmação do e-mail / 1º login com Google | nada | `WelcomeEmailTrigger` pede o v2 uma vez |
| Gatilho `trigger: "session"` no servidor | ignorado (`reason: disabled`) | v2 |

Dedupe (uma vez por conta): (1) consulta ao `email_send_log` — se já houver `sent` do `vertal_welcome` **ou do
`welcome` antigo** para o destinatário, não envia (falha na consulta = não envia); (2) chave de idempotência fixa no
provedor `vertal-welcome-<userId>`; (3) marca no `localStorage` do navegador; (4) janela de 7 dias após a criação da
conta; (5) o rate limit que já existia na função.

Não toca em vibe-code-agent, motores de jogo/código/design, allowlists nem gates.

## Flags

Servidor (sem segredo novo), dentro do `VERTAL_GPU_CONFIG`:

```json
"VERTAL_WELCOME_EMAIL": {
  "enabled": true,
  "userIds": ["<uuid do Laércio>"],
  "crmOpen": false,
  "vibePayOpen": false
}
```

Opcionais: `docsUrl`, `logoUrl`, `siteUrl`, `replyTo`, `fromName`, `maxAccountAgeHours` (padrão 168).
`userIds` vazio/ausente = todas as contas novas. `crmOpen`/`vibePayOpen` trocam a linha do produto de
"opening soon" para a versão "aberto" — ligar só quando o CRM e o Vibe Pay forem liberados ao público.

Front (build): `VITE_VERTAL_WELCOME_EMAIL_V2=true` no `.env.production` liga o gatilho pós-confirmação.
Hoje **não** está no arquivo.

## Remetente

`Vertal <noreply@kubovibe.dev>` pelo domínio verificado `notify.kubovibe.dev` (mesmo caminho do aviso de crédito baixo),
`Reply-To: support@kubovibe.dev` (endereço de suporte que já existe no repo, `src/components/ErrorBoundary.tsx`).
Log no `email_send_log` com `template_name = 'vertal_welcome'`.

## Fatos usados (conferidos no repo/site em 2026-11-26)

- Docs: https://vertal.dev/docs (`src/pages/DocsPage.tsx`, em inglês).
- Logo: https://vertal.dev/pwa-512x512.png (PNG 512×512, ícone Vertal em fundo escuro, `public/`), `alt="Vertal"`.
- Free CRM: `src/config/freeCrm/en.ts` — contatos, empresas, funil Kanban, sem mensalidade; abre em Conectores (1º card)
  ou `/crm`. Hoje só a allowlist entra; os demais veem a lista de espera em `/crm`.
- Vertal App: `src/lib/connectorsConfig.ts` (Vertal.app) — deploy do repositório ao ar, IA detecta stack/build, status
  e logs ao vivo. https://vertal.app
- Vertal Run: `src/lib/connectorsConfig.ts` — sandboxes isoladas, Python/JavaScript/Bash. https://vertalrun.com
- Vertal Vibe Pay: `src/config/vibePay.ts` (copy em inglês) — conta digital multimoeda, Pix, cartões, links de pagamento.
  Hoje `VibePayDevGate` mostra "em desenvolvimento" para quem não está liberado. https://vertal.dev/en/vibe-pay
- Ferramentas: Vertal Office (`src/components/office/OfficeSuite.tsx`: "Editor e exportação são grátis"), Auto Cadê
  (CAD, `src/components/creative/CadStudio.tsx`: "Desenha à mão (grátis)"), Design Premium (`CreativeDesign.tsx`) —
  no Painel Criativo (`/creative`, aberto a todos desde 2026-11-04).

Prévia: `docs/vertal-welcome/preview.html` e `preview.txt`.
SQL opcional (índice para o dedupe, **não aplicado**): `docs/vertal-welcome/proposed-index.sql`.

## Para ir ao ar (decisão do Laércio)

1. Aprovar o texto final e mergear o PR.
2. Adicionar `VERTAL_WELCOME_EMAIL` ao `VERTAL_GPU_CONFIG` (de preferência com `userIds` = só a conta dele para testar).
3. Adicionar `VITE_VERTAL_WELCOME_EMAIL_V2=true` ao `.env.production`.
4. Opcional: aplicar o índice proposto.

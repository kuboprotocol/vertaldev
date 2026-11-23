# Login com Google gerenciado pelo Vertal (Vertal Auth Kit)

Tela de login pronta (e-mail + senha + botão do Google) para os apps que o Dev cria no Vertal Code e no Vertal Chat. Sem edge function nova: os arquivos são gerados por `supabase/functions/_shared/vertalAuthKit.ts` e injetados pelo `vibe-code-agent`.

## Como ligar
- **Vertal Code:** botão **Login Vertal** acima do chat → liga o switch (vale por projeto). Se o pedido fala de login com o kit desligado, o agente oferece e aparece o cartão "Ligar Login Vertal".
- **Vertal Chat:** quando a conversa fala de login/cadastro, o chat oferece uma vez; se o Dev aceitar, manda `vibe_code` com `"auth_kit": true` (sempre com o logo do Vertal).

## Arquivos no app gerado
`src/vertal-auth/config.ts`, `client.ts`, `VertalAuthScreen.tsx` (`VertalAuthGate`). O agente não pode sobrescrevê-los; ele só envolve as telas com `<VertalAuthGate>`.
Backend: Supabase Auth via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` do app. Se os secrets `VERTAL_AUTH_SUPABASE_URL` e `VERTAL_AUTH_SUPABASE_PUBLISHABLE_KEY` estiverem no vibe-code-agent, o projeto gerenciado pelo Vertal vira o padrão (só chave pública é aceita).

## Marca
- Padrão: logo do Vertal Dev (`public/brand/vertal-auth-logo.webp`, 320×320).
- Marca branca: checkbox explícito dos termos (`AUTH_KIT_TERMS_VERSION`) + upload do logo do Dev. Aí a linha fixa `AUTH_KIT_FOOTER` aparece sempre embaixo do formulário. Para mudar o texto, edite só essa constante.
- O "G" oficial do Google fica sempre no botão.

## Decisões em aberto
- Cliente OAuth do Google gerenciado: verificação do app no Google (tela de consentimento mostra o nome do Vertal, não do app do Dev), domínios autorizados e redirect URLs por app.
- Projeto Supabase gerenciado compartilhado: usuários de apps diferentes no mesmo pool (separar por app/tenant) e allowlist de redirect para os domínios dos apps.
- Registro do aceite dos termos: hoje vai no config do app e no passo da conversa; uma tabela de aceites (com usuário, app e versão) dá prova jurídica melhor.
- O kit entra só no pedido direto do agente (não no executor de plano nem no gerador de HTML único do chat).

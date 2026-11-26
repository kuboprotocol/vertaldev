# Android Studio, iOS / Xcode e Google Play Console em Conectores (nov/2026)

Pedido do Laércio (26/11/2026): "Adicione junto ao painel de conectores o Android Studio, iOS Studio e também o
conector Google Play Console e a entrada nos mesmos em OAuth." Tudo aditivo; nenhum segredo novo, nenhuma Edge
Function nova.

## O que cada cartão faz

| Cartão | Slug / página | Entrada | O que dá para fazer |
| --- | --- | --- | --- |
| Google Play Console | `fluxos-google-play-console` → `/connectors/fluxos-google-play-console/setup` | **Entrar com Google** (OAuth real, cliente "Vertal Fluxos") | Vertal Chat: avaliações (com tradução), faixas de lançamento, assinaturas, produtos únicos, checar acesso ao app; responder avaliação (pede aprovação, 2 créditos) |
| Android Studio | `android-studio` → `/connectors/android-studio/setup` | **Entrar com Google** = a mesma conexão do Play Console | Escolher repositório do GitHub (conector GitHub OAuth) → URL de clone para *File → New → Project from Version Control*, ZIP, comandos do Capacitor (`npx cap add/sync/open android`) |
| iOS / Xcode ("iOS Studio" no pedido) | `ios-xcode` → `/connectors/ios-xcode/setup` | **Chave de API do App Store Connect** (Issuer ID, Key ID, .p8) — a Apple não tem OAuth de terceiros | Vertal Chat: apps, builds enviados pelo Xcode, avaliações; responder avaliação (aprovação). Clonar no Xcode + comandos do Capacitor (`npx cap add/sync/open ios`, precisa de Mac) |

Sem OAuth falso: o Android Studio e o Xcode são apps de desktop sem login/API para terceiros, e o texto da tela diz isso.
"Entrar com Apple" não está configurado no projeto e não daria acesso ao App Store Connect (só identidade), por isso não aparece.

## Peças
- **Motor (fork `kuboprotocol/automatisch`)**: apps `google-play-console` (helper `google-oauth.js`, escopo
  `https://www.googleapis.com/auth/androidpublisher`, API `androidpublisher.googleapis.com/androidpublisher/v3`) e
  `app-store-connect` (JWT ES256 de 19 min assinado no servidor com o .p8; o Bearer só vai para
  `api.appstoreconnect.apple.com`; o .p8 colado numa linha só é remontado). As faixas são lidas por uma edição
  temporária que é sempre apagada (nada é publicado).
- **Supabase**: nada novo. `google-play-console` cai no grupo `GOOGLE` (`oauthSecretGroup`), usa o ID público do
  cliente "Vertal Fluxos" + o segredo existente `FLUXOS_OAUTH_GOOGLE_SECRET`. `app-store-connect` não usa cliente do
  Vertal (a chave é do usuário, guardada criptografada na conexão do motor).
- **Front**: `src/lib/mobileStudio/connectors.ts` (cartões, flag, receitas), `src/lib/mobileStudio/i18n.ts`
  (pt-BR/en/es: `?lang=` → Ajustes → Idioma), `src/components/connectors/MobileStudioSetup.tsx` (páginas).
  Arquivos compartilhados tocados (2 linhas cada): `src/lib/connectorsConfig.ts` (spread do catálogo) e
  `src/pages/ConnectorSetupPage.tsx` (desvio para a página própria). Nada em `App.tsx` (rota `/connectors/:slug/setup`
  já existe).

## Flag
- `VITE_VERTAL_MOBILE_STUDIO` (padrão **desligado**): liga os três cartões no catálogo `/connectors`.
- Desligado, o catálogo fica idêntico; as três páginas de configuração abrem pelo link direto (para o dono testar).
  Para publicar: `VITE_VERTAL_MOBILE_STUDIO=true` no `.env.production`.

## Google Cloud (projeto `parabolic-eon-462823-g2`, 26/11/2026)
- API "Google Play Android Developer API" ativada.
- Escopo `.../auth/androidpublisher` adicionado em Acesso a dados (aparece como não confidencial).
- Retorno `https://vertal.dev/fluxos/oauth/google-play-console` no cliente Web "Vertal Fluxos".
- Tela de consentimento continua em **Teste** (só usuários de teste conectam); cliente "VertalAPI" não foi tocado.

## Requisito do Play Console
O OAuth só prova quem é a pessoa. Para a API responder, a conta Google precisa ter acesso ao app no Play Console
(Usuários e permissões → convidar → acesso ao app; "responder avaliações" para responder pelo chat). Sem isso: 403,
e a mensagem de erro do motor explica o que fazer. A API do Play não lista apps: o usuário informa o package name.

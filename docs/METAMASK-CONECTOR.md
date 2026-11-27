# Conector MetaMask, Starter Web3 e Trader por prompt (nov/2026)

Pedido do Laércio (aprovado em 27/11/2026): carteira MetaMask no Vertal Dev — conector em **Conectores**,
template Web3 para quem cria apps no Vertal Dev / VERTAL Code AI, e "Trader por prompt" no Vertal Chat (só testnet).

Tudo **aditivo** e **desligado por padrão**. Nenhum segredo novo no Supabase (projeto no limite de 100), nenhuma
Edge Function nova (a lógica é a ação `wallet` da função existente `vertal-code-ai`). Nenhum motor, prompt de
sistema, padrão, template existente ou roteamento de modelos do Vibe Code foi alterado.

## O que existe

| Parte | Onde | O que faz |
| --- | --- | --- |
| Cartão **MetaMask** | `/connectors` → `/connectors/metamask/setup` | Conectar por **Sign-In with Ethereum (EIP-4361)**, ver rede/saldo/nº de transações, desconectar |
| **Starter Web3** | aba "Starter Web3" da mesma página | Arquivos prontos com **wagmi v2 + viem v2** ligados à MetaMask: conectar, ler saldo, assinar mensagem, chamar contrato |
| Dica no **VERTAL Code AI** | ação `run` da `vertal-code-ai` | Quando o pedido fala de carteira/dApp/Web3, anexa ao **pedido** (não ao prompt de sistema) uma dica curta para usar o Starter. Pedido comum fica idêntico |
| **Trader por prompt** | botão "Trader" no Vertal Chat + aba "Trader (testnet)" | "compre 0.01 ETH de UNI quando cair 5%" → cotação no Uniswap v3 da **Sepolia** → a MetaMask pede a assinatura de **cada** transação |

### Conexão (EIP-6963 / EIP-1193 / celular)
- **Computador**: descoberta da extensão por **EIP-6963** (`rdns` `io.metamask`), com fallback para `window.ethereum.isMetaMask` (EIP-1193). Sem dependência nova no `package.json`.
- **Celular sem extensão**: botão "Abrir no app da MetaMask" — deep link oficial `https://metamask.app.link/dapp/<host><caminho>`, que abre a mesma página no navegador do app (o provedor é injetado e o fluxo é o mesmo).
- **WalletConnect**: só aparece se houver `VERTAL_METAMASK_WALLETCONNECT_PROJECT_ID` na config (abaixo). Sem ele, a opção fica escondida. Carregado sob demanda (`@walletconnect/ethereum-provider` via esm.sh) — **não testado ponta a ponta** nesta versão.

### Fluxo SIWE
1. Front pede a conta (`eth_requestAccounts`) e troca para a rede escolhida (Sepolia por padrão).
2. `wallet/nonce` → o servidor monta a mensagem EIP-4361 com o domínio do header `Origin` (lista permitida),
   validade de **10 min** e um **nonce sem tabela**: aleatório + HMAC(usuário, endereço, rede, validade) com a chave que a função já usa.
3. A MetaMask assina (`personal_sign`).
4. `wallet/verify` → o servidor confere: mensagem idêntica à montada, domínio e URI, rede aceita, não expirada, nonce deste usuário,
   e **recupera o endereço da assinatura** (secp256k1 + keccak com `@noble/curves` / `@noble/hashes`, as bibliotecas auditadas usadas por viem/ethers).
5. Guarda **só** `address`, `chain_id`, `connected_at` (tabela `vertal_wallet_connections`, uma carteira por usuário). "Desconectar" apaga a linha.

### Leitura (só leitura)
`wallet/read`: rede, bloco atual, saldo (ETH) e nº de transações enviadas, por RPC público (`publicnode`) ou o RPC da config.
Lista das **transações recentes** só com `VERTAL_METAMASK_ETHERSCAN_KEY` na config (Etherscan API v2); sem ela, a tela explica.

### Trader por prompt (testnet)
- Entende pt-BR, en e es: comprar gastando X ETH, vender X tokens; gatilho "cair N%" / "subir N%" ou agora. Tokens: UNI, LINK, USDC da Sepolia ou endereço `0x…`.
- Cotação com `eth_call` no **QuoterV2** (faixas 0,05% / 0,3% / 1%, pega a melhor). Endereços conferidos em docs.uniswap.org (Ethereum Deployments, Sepolia): QuoterV2 `0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3`, SwapRouter02 `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`, WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`.
- Ordem = transações **não assinadas**: `multicall(deadline 20 min, exactInputSingle)` com mínimo a receber (deslizamento 1%); na venda, `approve` antes quando a permissão não basta. A compra manda ETH no `value` (o SwapRouter02 embrulha em WETH); a venda recebe WETH.
- Gatilho: "Acompanhar enquanto esta página estiver aberta" recota a cada minuto; quando o preço chega, aparece o botão de assinar. **Nada é enviado sem o clique e a assinatura do usuário.**
- **Mainnet bloqueada**: `VERTAL_METAMASK_MAINNET_ENABLED` fica desligado; mesmo ligado, esta versão responde `mainnet_not_supported_yet`.
- Aviso visível "não é recomendação de investimento" (pt-BR/en/es) na aba e no botão do chat.
- Liquidez na Sepolia é irregular: sem pool, a resposta é `no_liquidity` ("sem liquidez para esse par na Sepolia agora").

## Flags e config

### Front (Railway/Cloudflare, build)
| Variável | Padrão | Efeito |
| --- | --- | --- |
| `VITE_VERTAL_METAMASK` | **desligado** | Cartão no catálogo `/connectors` e botão "Trader" no Vertal Chat (este só se o servidor liberar o Trader). Desligado: catálogo e chat idênticos. A página `/connectors/metamask/setup` abre pelo link direto, mas o servidor só responde a quem está liberado |

### Servidor — dentro do `VERTAL_GPU_CONFIG` (JSON existente; **sem segredo novo**). Segredo avulso com o mesmo nome vence.
| Chave | Padrão | Efeito |
| --- | --- | --- |
| `VERTAL_METAMASK_ENABLED` | off | Liga a ação `wallet` |
| `VERTAL_METAMASK_USER_IDS` | vazia = **ninguém** | Lista de ids liberados (só o id do Laércio) |
| `VERTAL_METAMASK_TRADER_ENABLED` | off | Liga o Trader (testnet) para quem já tem o conector |
| `VERTAL_METAMASK_MAINNET_ENABLED` | **off — manter** | Flag separado da mainnet no Trader (esta versão não monta ordem na mainnet de qualquer forma) |
| `VERTAL_METAMASK_CODE_HINT` | off | Dica do Starter Web3 no VERTAL Code AI (só para usuários liberados) |
| `VERTAL_METAMASK_WALLETCONNECT_PROJECT_ID` | ausente | Mostra a opção WalletConnect (id público do WalletConnect Cloud / Reown) |
| `VERTAL_METAMASK_ETHERSCAN_KEY` | ausente | Lista de transações recentes |
| `VERTAL_METAMASK_RPC_11155111` / `_RPC_1` | publicnode | RPC próprio (https) |
| `VERTAL_METAMASK_DOMAINS` | vertal.dev, www.vertal.dev, kubovibe.dev, www.kubovibe.dev, localhost:8080, localhost:5173 | Domínios aceitos na mensagem SIWE |

Exemplo (acrescentar ao JSON atual, sem tirar nada):
```json
{ "VERTAL_METAMASK_ENABLED": "true", "VERTAL_METAMASK_USER_IDS": "<uuid do Laércio>", "VERTAL_METAMASK_TRADER_ENABLED": "true", "VERTAL_METAMASK_CODE_HINT": "true" }
```
A ação `wallet` está dentro da `vertal-code-ai`, que já exige `VERTAL_CODE_AI_ENABLED` + `VERTAL_CODE_AI_USER_IDS`: o usuário precisa estar liberado nas duas listas.

### Banco
Migração `supabase/migrations/20261127120000_vertal_wallet_connections.sql` — **não aplicada**. RLS: o usuário lê e apaga a
própria linha; só o service role grava. Sem a tabela, a assinatura é conferida mas nada fica salvo (`migration_pending`, a tela avisa).

## Modelo de segurança
- **Nunca** pedimos, aceitamos ou guardamos frase-semente ou chave privada. Defesa extra: qualquer pedido à ação `wallet` com campo
  que pareça chave privada (64 hex) ou frase de 12–24 palavras é recusado inteiro (`secret_material_refused`). A tela avisa que pedir isso é golpe.
- **Sem custódia, sem assinatura no servidor, sem execução automática.** O servidor só faz `eth_call`/leituras; quem assina é a MetaMask, uma transação por vez, com clique do usuário.
- O front confere que a conta ativa na MetaMask é a conectada antes de enviar (`account_mismatch`).
- SIWE com domínio/URI na lista, validade de 10 min, nonce amarrado a usuário+endereço+rede+validade, recuperação de assinatura com EIP-2 (s baixo).
- Dado guardado: endereço público, rede, data. Nada de saldo, assinatura ou histórico.

### Futuro (só desenho, não implementado)
Permissões **limitadas e revogáveis** via smart account (MetaMask Delegation Toolkit / pedidos no estilo **ERC-7715**): teto de valor por
operação e por período, lista de tokens permitidos, validade curta, revogação a qualquer momento pela própria MetaMask. Só depois de
revisão jurídica e de segurança; até lá, cada operação pede a assinatura do usuário.

## Cuidado regulatório (Brasil)
A prestação de serviços de ativos virtuais é regulada pela **Lei 14.478/2022**; o **Decreto 11.563/2023** pôs o **Banco Central** como
regulador, e as **Resoluções BCB 519, 520 e 521** (10/11/2025, em vigor desde 02/02/2026; a 520 já foi alterada em 2026) exigem
**autorização prévia** do BC para quem presta esses serviços (intermediação, custódia, troca em nome de terceiros etc.), além de PLD/CT,
governança e proteção ao cliente.
Fontes: https://www.bcb.gov.br/detalhenoticia/20930/noticia · https://www.in.gov.br/web/dou/-/resolucao-bcb-n-589-de-23-de-setembro-de-2026-734471404

Nesta versão o Trader é ferramenta de interface **sem custódia**, **só testnet** e **só para o dono**. **Abrir o Trader para outros usuários
(ou ligar a mainnet) precisa de revisão jurídica antes**: dependendo do desenho (ex.: cobrar por ordem, rotear ordens, guardar
permissões delegadas), o Vertal pode passar a ser enquadrado como prestador de serviços de ativos virtuais. Também não é recomendação de
investimento (avisos de suitability/CVM também ficam para a revisão).

## Fluxos (Vertal Fluxos)
Próximo passo, não feito aqui: o motor do Vertal Fluxos fica no fork `kuboprotocol/automatisch` (outro repositório). O caminho limpo é um app
`vertal-wallet` no fork com **gatilho** "saldo mudou / nova transação" (polling na `wallet/read`) e **ação** "ler saldo/rede", autenticando
com a chave do broker do Fluxos como o Vertal CRM faz (`x-vertal-fluxos-key`). Nenhuma ação que assine ou envie transação deve entrar nos Fluxos.

## Arquivos
- Novos: `supabase/functions/_shared/vertalWallet/{core,trade,handler,web3Template,deno}.ts`, `src/lib/vertalWallet/{config,client,eip6963,i18n}.ts`,
  `src/components/connectors/MetaMaskSetup.tsx`, `src/components/vertal-wallet/VertalWalletEntryButton.tsx`, `public/connectors/metamask.svg`,
  migração acima, testes `src/test/vertal-wallet-*.test.ts(x)`.
- Compartilhados (só linhas novas, atrás dos flags): `src/lib/connectorsConfig.ts` (spread do catálogo), `src/pages/ConnectorSetupPage.tsx`
  (desvio para a página própria), `src/components/vertal-chat/VertalChat.tsx` (botão + comando), `supabase/functions/vertal-code-ai/index.ts`
  (ação `wallet` + dica no `run` atrás de `VERTAL_METAMASK_CODE_HINT`), `scripts/vertal-code-ai/engine-guard.mjs` (aceita linhas `VertalWallet`/`VERTAL_METAMASK` nos arquivos com flag, como Prospector/Growth/CRM).

## Para publicar (decisões do Laércio)
1. Merge do PR.
2. Aplicar a migração `20261127120000_vertal_wallet_connections.sql`.
3. Acrescentar ao `VERTAL_GPU_CONFIG` as chaves `VERTAL_METAMASK_*` (exemplo acima) com o seu user id.
4. `VITE_VERTAL_METAMASK=true` no `.env.production` (se quiser o cartão e o botão do chat visíveis).
5. Opcional: project id do WalletConnect; chave do Etherscan para transações recentes.
6. Manter `VERTAL_METAMASK_MAINNET_ENABLED` desligado. Abrir para outros usuários só depois da revisão jurídica.

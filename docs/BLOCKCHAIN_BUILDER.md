# KUBO BLOCKCHAIN BUILDER

> **Status: conceito e catálogo.** Esta página descreve um módulo proposto para o Vertal Vibe Code. Hoje a plataforma tem o catálogo de frameworks e a tabela de preço (ver "Onde está no código"). A geração automática de projetos, nós e redes **não está implementada**.

## O que é

Uma fábrica de blockchains dentro do Vertal Vibe Code. O desenvolvedor descreve o projeto em linguagem natural, escolhe as características e a plataforma monta a infraestrutura com IA: seleciona os frameworks, gera o código, configura módulos, cria nós, validadores e o genesis, e entrega o projeto para o dev baixar, modificar, compilar e hospedar.

Exemplo de pedido:

> "Crie uma blockchain Layer 1 compatível com EVM e WASM, usando Rust, com consenso PoA, taxas configuráveis, explorador de blocos, carteira e bridge."

Fluxo proposto:

1. Analisa o projeto e identifica a arquitetura adequada.
2. Seleciona os frameworks e repositórios compatíveis.
3. Gera o código-fonte e configura os módulos.
4. Cria nós, validadores, genesis e parâmetros da rede.
5. Configura APIs, RPC, explorador e integração de carteiras.
6. Executa testes, simulações e verificações automatizadas.
7. Gera Docker, documentação e scripts de implantação.

O dev é dono do projeto gerado. Ele pode criar uma blockchain do zero, uma camada sobre outra, ou combinar camadas.

## Camadas

| Camada | Para que serve | Exemplos de engine no catálogo |
|---|---|---|
| **Layer 0** | Infraestrutura de comunicação, interoperabilidade e conexão entre redes. | Cosmos IBC, Hyperlane, LayerZero, Wormhole, Axelar, libp2p |
| **Layer 1** | Blockchain independente, com consenso, validadores, regras, taxas e ativos próprios. | Cosmos SDK, Polkadot SDK, AvalancheGo, Solana, Geth, Hyperledger Besu |
| **Layer 2** | Redes de execução que usam outra blockchain para liquidação e segurança (rollups, canais, sidechains). | OP Stack, Arbitrum Nitro, ZK Stack, Polygon CDK, Sovereign SDK, Rollkit |
| **Layer 3** | Redes e aplicações especializadas: serviços, jogos, DeFi. | Arbitrum Orbit (Nitro), ZK Stack (Hyperchains), Dymension, Sovereign SDK |
| **Layer 4** | *Proposta Kubo, experimental.* Redes de serviços, aplicações distribuídas, automação, IA, IoT e protocolos especializados. | — |
| **Layer 5** | *Proposta Kubo, experimental.* Ecossistemas de ecossistemas: orquestração de múltiplas redes e serviços. | — |

**Atenção sobre Layers 4 e 5:** não existe classificação universal consolidada para elas no mercado. São arquiteturas próprias do Kubo, extensíveis. Não as apresente como padrão da indústria.

## Catálogo de engines

O catálogo vive em `supabase/functions/_shared/blockchainEngines.ts` (fonte única). O front-end reexporta em `src/config/blockchainEngines.ts`. Cada engine tem: id, camadas, papel, repositório, linguagens, status, verificação e licença.

Estado atual de cada entrada:

- **Status `reference`**: a plataforma conhece o engine. Nenhum ainda é executado pelo agente.
- **`verified: false`**: os links foram passados na lista do produto, mas o acesso ao GitHub não estava liberado na sessão em que o catálogo foi escrito. Nenhum repositório foi conferido. Confira cada um antes de publicar.
- **`license: "verificar"`**: nenhuma licença foi presumida. Confira antes de habilitar um engine num build.

### Componentes complementares

Um construtor de blockchain também precisa destes componentes:

| Componente | Biblioteca | Uso |
|---|---|---|
| Máquina virtual EVM | REVM | Execução de contratos EVM |
| Máquina virtual WASM | Wasmtime | Execução de módulos WASM |
| Consenso | CometBFT | Consenso BFT com validadores |
| Criptografia | RustCrypto | Primitivas criptográficas |
| Contratos inteligentes | Foundry | Compilar, testar e implantar contratos |
| Banco de dados | RocksDB | Estado do nó |
| Comunicação P2P | Rust libp2p | Descoberta de pares e transporte |
| Indexação | Graph Node | Consultas de dados para aplicações |
| Provas ZK | Plonky3 | Provas de execução fora da cadeia |

## Arquitetura proposta

Um **Blockchain Engine Registry**: cada framework tem um adaptador próprio. Assim a IA não reinventa a integração a cada pedido.

```
Vertal Vibe Code
  └─ AI Blockchain Architect      interpreta o pedido e planeja
       └─ Blockchain Engine Registry
            ├─ Layer 0 Engine
            ├─ Layer 1 Engine
            ├─ Layer 2 Engine
            ├─ Layer 3 Engine
            ├─ Layer 4 Engine (experimental)
            ├─ Layer 5 Engine (experimental)
            └─ Custom Engine
       └─ Code Generation + Integration   Rust • Go • Solidity • TypeScript • WASM
       └─ Blockchain Project Generator    código • testnet • nós • APIs • docs • deploy
```

## Preço

Criar uma blockchain custa **de 10% a 30% a mais** em créditos que a ação base. A faixa depende da complexidade:

| Faixa | Multiplicador | Critério |
|---|---|---|
| `basic` | 1,10× (+10%) | Uma camada, um engine, sem bridge nem ZK. |
| `standard` | 1,20× (+20%) | Uma camada com validadores, explorador e APIs. |
| `advanced` | 1,30× (+30%) | Várias camadas, bridge, provas ZK ou consenso próprio. |

Fórmula: `custo = custo_base × multiplicador`, arredondado a 2 casas. Exemplo: com custo base de 10 créditos, a faixa `standard` custa 12 créditos.

O custo base é o da ação de build em `supabase/functions/_shared/vibeAgentsConfig.ts`. O multiplicador acima é só o adicional da criação de blockchain. Hoje o código tem a função `blockchainCreditCost` e a tabela de faixas. **Ainda não está ligada à cobrança do Vibe Agents nem a um fluxo de build.**

## Regras para os projetos gerados

- Baixar e integrar repositórios oficiais, respeitando as licenças de cada um.
- Fixar versões e verificar dependências.
- Gerar projetos independentes, com código-fonte exportável.
- Não copiar repositórios inteiros para dentro do projeto sem necessidade.
- Rodar testes de segurança, de consenso, de bridge e de contratos.
- Separar **testnet** de **mainnet**. Redes de testnet são o padrão.
- Exigir **validação humana** antes de implantar uma rede com ativos reais.
- Verificar a segurança econômica e criptográfica da arquitetura antes de liberar.

## Condições comerciais

Algumas ferramentas têm licenças ou condições específicas para uso comercial. O **Sovereign SDK**, por exemplo, informa condições de revenue share para aplicações comerciais. Antes de liberar cada engine no construtor, confira:

- a licença do repositório;
- as condições comerciais publicadas pelo mantenedor;
- se o uso no produto gera obrigação de repasse.

## Onde está no código

| Arquivo | Conteúdo |
|---|---|
| `supabase/functions/_shared/blockchainEngines.ts` | Camadas, catálogo de engines, componentes complementares, faixas de preço e funções de custo. |
| `supabase/functions/_shared/blockchainRegistry.ts` | Planejador `planBlockchainBuild` e registro de adaptadores (vazio). |
| `src/config/blockchainEngines.ts` | Reexportação para o front-end. |
| `src/test/blockchain-registry.test.ts` | Testes do planejador: escolha de engines, validação, mainnet, avisos e custo. |
| `src/test/blockchain-engines.test.ts` | Testes: ids únicos, repositórios, camadas 4 e 5 experimentais, nada verificado sem conferir, faixas de 10% a 30%. |
| `src/pages/DocsPage.tsx` | Seção "Blockchain Builder" na documentação do app. |

## Como adicionar um engine

1. Confirme que o repositório existe e anote a licença.
2. Adicione uma entrada em `BLOCKCHAIN_ENGINES`, com `layers`, `role`, `repo`, `languages`, `status: "reference"` e `verified: false`.
3. Se o engine tiver condição comercial, preencha `note`.
4. Rode `npx vitest run src/test/blockchain-engines.test.ts`.
5. Atualize esta página se a lista de camadas ou de componentes mudar.

## Blockchain Engine Registry (planejamento)

Já existe o planejador em `supabase/functions/_shared/blockchainRegistry.ts`, função `planBlockchainBuild`. Ele recebe camadas, faixa, custo base, rede (testnet ou mainnet) e, opcionalmente, engines e componentes escolhidos pelo dev. Devolve um plano com:

- os engines por camada (o padrão de cada camada se o dev não escolher: Hyperlane, Cosmos SDK, OP Stack e Arbitrum Nitro);
- o custo em créditos (`blockchainCreditCost`);
- os avisos: repositório não conferido, condição comercial, camada experimental, falta de adaptador;
- `requiresHumanReview`, que é `true` em mainnet.

O planejador recusa engine desconhecido, engine que não atende a camada pedida, pedido sem camada e custo base zero.

**O que ainda não existe:** os adaptadores de geração. `ENGINE_ADAPTERS` está vazio, então nenhum plano gera código hoje. O planejador apenas lista quais engines estão sem adaptador.

## Pendências

- Conferir no GitHub todos os repositórios do catálogo e trocar `verified` para `true` só depois. Bloqueado: o acesso ao GitHub não estava liberado para esses repositórios.
- Confirmar a licença de cada engine (`license`).
- Confirmar as condições comerciais do Sovereign SDK.
- Definir o custo base de build de blockchain e ligar `blockchainCreditCost` à cobrança. Depende de uma decisão de preço, que não foi tomada.
- Implementar os adaptadores de geração (um por engine) e o gerador de projetos. O registro já aceita os adaptadores; falta escrevê-los.
- Criar um template de sandbox com os toolchains (Rust, Go, Solidity, Node) para compilar os projetos gerados.
- Validar a segurança de consenso, bridge e contratos antes de qualquer rede com ativo real.

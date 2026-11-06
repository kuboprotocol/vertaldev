# Catálogo de bibliotecas do Vibe Dev

O Vibe Dev conhece um catálogo único de bibliotecas em Python, npm (Next e o ecossistema React), Go e engenharia reversa (Ghidra). Este documento é gerado a partir dele: a fonte da verdade é `supabase/functions/_shared/vibeLibraries.ts`, reexportado para o front-end em `src/config/vibeLibraries.ts`.

## Como o catálogo é usado

- **Sandbox Python (`python_run`)**: só instala, com `pip install`, pacotes com status `ready` (a lista `PYTHON_PACKAGES` é derivada do catálogo, sem lista paralela). Pacote fora da lista é descartado silenciosamente por `sanitizePackages`.
- **Projetos gerados (npm e Go)**: o catálogo registra o que a plataforma reconhece nessas stacks. Hoje a sandbox não instala esses pacotes; a execução deles depende de um template de sandbox próprio.
- **Templates**: bibliotecas com status `template` são pesadas demais para instalar a cada execução (limite de 60 s por `python_run`) ou não são Python. Elas entram quando existir um template de sandbox que as traga prontas.

## Status

| Status | Significado |
|---|---|
| `ready` (instalável) | Instalável agora na sandbox Python, via allowlist. |
| `reference` (referência) | Conhecida pela plataforma para projetos gerados; não é executada pelo agente ainda. |
| `template` | Exige um template de sandbox próprio. |

## Como adicionar uma biblioteca

1. Confirme que o nome existe no registro oficial (PyPI, npm ou `proxy.golang.org`).
2. Adicione uma entrada em `VIBE_LIBRARIES` com `runtime`, `package`, `category`, `status` e uma descrição em português.
3. Se for `pip` com status `ready`, ela passa a ser instalável sozinha. Use `template` se ela for pesada ou não rodar só com pip.
4. Rode `npx vitest run src/test/vibe-libraries.test.ts`. O teste garante ids únicos, nomes seguros para o shell e que nada com status `template` entre na allowlist.
5. Regenere este documento (a tabela abaixo é o retrato do catálogo).

## Engenharia reversa (Ghidra e afins)

As bibliotecas de engenharia reversa existem para análise **autorizada**: arquivos seus, CTFs, pesquisa e análise defensiva. A plataforma não faz exploração automática nem distribui nada malicioso. Os quatro parsers instaláveis (`pefile`, `pyelftools`, `capstone`, `yara-python`) só leem e descrevem arquivos. Ghidra, `pyghidra` e `ghidra-bridge` exigem um template com o Ghidra instalado.

## Limitações atuais

- Go e Next estão no catálogo, mas a sandbox ainda não as executa. Para rodá-las, é preciso um template E2B com Go e Node, configurado em `VIBE_SANDBOX_TEMPLATE`.
- O catálogo é uma lista curada, não um índice de todo o ecossistema.
- Versões não são fixadas: `pip install` e `npm` instalam a versão mais recente disponível.

## Resumo

- Total: **133** bibliotecas.
- ✅ instalável agora (sandbox Python): **69**
- 📘 conhecida para projetos gerados: **56**
- 🧩 exige template próprio: **8**
- Na allowlist de `pip` da sandbox: **69** pacotes.

## Por categoria

| Categoria | Bibliotecas | Runtime | Status |
|---|---|---|---|
| Dados | 6 | pip | instalável |
| Machine learning | 6 | pip | instalável, template |
| Visualização | 5 | pip | instalável |
| Documentos e escritórios | 9 | pip | instalável |
| Web e HTTP | 8 | pip, npm, Go | instalável, referência |
| Backend e APIs | 19 | pip, npm, Go | instalável, referência |
| Banco de dados | 12 | pip, npm, Go | instalável, referência |
| Testes e qualidade | 7 | pip, npm, Go | instalável, referência |
| IA e linguagem | 7 | pip | instalável, template |
| Ciência | 3 | pip | instalável |
| Web3 e criptografia | 8 | pip, npm, Go | instalável, referência |
| Utilidades | 14 | pip, Go | instalável, referência |
| Imagens, áudio e vídeo | 5 | pip, npm | instalável, referência |
| Frontend (Next e React) | 17 | npm | referência |
| Engenharia reversa | 7 | pip, Java | instalável, template |

## Dados

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| pandas | pip | `pandas` | instalável | Tabelas e análise de dados |
| numpy | pip | `numpy` | instalável | Arrays e álgebra numérica |
| scipy | pip | `scipy` | instalável | Estatística, otimização e álgebra linear |
| polars | pip | `polars` | instalável | DataFrames rápidos, escritos em Rust |
| pyarrow | pip | `pyarrow` | instalável | Formato colunar Arrow e Parquet |
| duckdb | pip | `duckdb` | instalável | Banco analítico SQL embutido |

## Machine learning

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| scikit-learn | pip | `scikit-learn` | instalável | Modelos clássicos de machine learning |
| statsmodels | pip | `statsmodels` | instalável | Modelos estatísticos e séries temporais |
| xgboost | pip | `xgboost` | instalável | Gradient boosting de alta performance |
| lightgbm | pip | `lightgbm` | instalável | Gradient boosting leve da Microsoft |
| torch | pip | `torch` | template | PyTorch. *Pesado demais para instalar a cada execução; exige template próprio.* |
| tensorflow | pip | `tensorflow` | template | TensorFlow. *Pesado demais para instalar a cada execução; exige template próprio.* |

## Visualização

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| matplotlib | pip | `matplotlib` | instalável | Gráficos estáticos |
| seaborn | pip | `seaborn` | instalável | Gráficos estatísticos sobre o Matplotlib |
| plotly | pip | `plotly` | instalável | Gráficos interativos |
| altair | pip | `altair` | instalável | Gráficos declarativos |
| bokeh | pip | `bokeh` | instalável | Gráficos interativos para web |

## Documentos e escritórios

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| openpyxl | pip | `openpyxl` | instalável | Ler e escrever planilhas .xlsx |
| xlsxwriter | pip | `xlsxwriter` | instalável | Criar planilhas .xlsx com formatação |
| python-docx | pip | `python-docx` | instalável | Ler e escrever documentos .docx |
| python-pptx | pip | `python-pptx` | instalável | Criar apresentações .pptx |
| pypdf | pip | `pypdf` | instalável | Ler, dividir e juntar PDFs |
| reportlab | pip | `reportlab` | instalável | Gerar PDFs do zero |
| pyyaml | pip | `pyyaml` | instalável | Ler e escrever YAML |
| tabulate | pip | `tabulate` | instalável | Tabelas em texto e Markdown |
| markdown | pip | `markdown` | instalável | Converter Markdown em HTML |

## Web e HTTP

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| requests | pip | `requests` | instalável | Cliente HTTP síncrono |
| httpx | pip | `httpx` | instalável | Cliente HTTP síncrono e assíncrono |
| aiohttp | pip | `aiohttp` | instalável | Cliente e servidor HTTP assíncronos |
| beautifulsoup4 | pip | `beautifulsoup4` | instalável | Extrair dados de HTML |
| lxml | pip | `lxml` | instalável | Parser rápido de HTML e XML |
| feedparser | pip | `feedparser` | instalável | Ler feeds RSS e Atom |
| axios | npm | `axios` | referência | Cliente HTTP |
| colly | Go | `github.com/gocolly/colly/v2` | referência | Coleta de dados da web |

## Backend e APIs

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| fastapi | pip | `fastapi` | instalável | API web moderna em Python |
| uvicorn | pip | `uvicorn` | instalável | Servidor ASGI |
| flask | pip | `flask` | instalável | Microframework web |
| pydantic | pip | `pydantic` | instalável | Validação de dados com tipos |
| express | npm | `express` | referência | Servidor HTTP minimalista |
| fastify | npm | `fastify` | referência | Servidor HTTP rápido |
| hono | npm | `hono` | referência | Servidor leve para edge e serverless |
| socket.io | npm | `socket.io` | referência | Comunicação em tempo real |
| gin | Go | `github.com/gin-gonic/gin` | referência | Framework HTTP rápido |
| fiber | Go | `github.com/gofiber/fiber/v2` | referência | Framework HTTP inspirado no Express |
| chi | Go | `github.com/go-chi/chi/v5` | referência | Roteador HTTP idiomático |
| mux | Go | `github.com/gorilla/mux` | referência | Roteador HTTP clássico |
| echo | Go | `github.com/labstack/echo/v4` | referência | Framework HTTP minimalista |
| jwt | Go | `github.com/golang-jwt/jwt/v5` | referência | Tokens JWT |
| grpc | Go | `google.golang.org/grpc` | referência | RPC de alto desempenho |
| protobuf | Go | `google.golang.org/protobuf` | referência | Protocol Buffers |
| client_golang | Go | `github.com/prometheus/client_golang` | referência | Métricas no formato Prometheus |
| aws-sdk-go-v2 | Go | `github.com/aws/aws-sdk-go-v2` | referência | SDK da AWS |
| nats.go | Go | `github.com/nats-io/nats.go` | referência | Mensageria com NATS |

## Banco de dados

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| sqlalchemy | pip | `sqlalchemy` | instalável | ORM e SQL toolkit |
| psycopg2-binary | pip | `psycopg2-binary` | instalável | Driver PostgreSQL |
| asyncpg | pip | `asyncpg` | instalável | Driver PostgreSQL assíncrono |
| pymongo | pip | `pymongo` | instalável | Driver MongoDB |
| redis | pip | `redis` | instalável | Cliente Redis |
| supabase | pip | `supabase` | instalável | Cliente Python do Supabase |
| prisma | npm | `prisma` | referência | ORM com migrações |
| drizzle-orm | npm | `drizzle-orm` | referência | ORM SQL tipado |
| @supabase/supabase-js | npm | `@supabase/supabase-js` | referência | Cliente oficial do Supabase |
| gorm | Go | `gorm.io/gorm` | referência | ORM para Go |
| pgx | Go | `github.com/jackc/pgx/v5` | referência | Driver PostgreSQL de alta performance |
| go-redis | Go | `github.com/redis/go-redis/v9` | referência | Cliente Redis |

## Testes e qualidade

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| pytest | pip | `pytest` | instalável | Framework de testes |
| hypothesis | pip | `hypothesis` | instalável | Testes baseados em propriedades |
| ruff | pip | `ruff` | instalável | Linter e formatador rápido |
| mypy | pip | `mypy` | instalável | Checagem estática de tipos |
| vitest | npm | `vitest` | referência | Testes unitários com Vite |
| playwright | npm | `playwright` | referência | Testes e automação de navegador |
| testify | Go | `github.com/stretchr/testify` | referência | Asserções e mocks para testes |

## IA e linguagem

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| openai | pip | `openai` | instalável | SDK oficial da OpenAI |
| anthropic | pip | `anthropic` | instalável | SDK oficial da Anthropic |
| tiktoken | pip | `tiktoken` | instalável | Contagem de tokens |
| nltk | pip | `nltk` | instalável | Processamento de linguagem natural clássico |
| transformers | pip | `transformers` | template | Modelos Hugging Face. *Depende de torch; exige template próprio.* |
| spacy | pip | `spacy` | template | NLP de produção. *Modelos grandes; exige template próprio.* |
| sentence-transformers | pip | `sentence-transformers` | template | Embeddings de texto. *Depende de torch; exige template próprio.* |

## Ciência

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| sympy | pip | `sympy` | instalável | Matemática simbólica |
| networkx | pip | `networkx` | instalável | Grafos e redes |
| shapely | pip | `shapely` | instalável | Geometria computacional 2D |

## Web3 e criptografia

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| web3 | pip | `web3` | instalável | Interação com contratos Ethereum e EVM |
| eth-account | pip | `eth-account` | instalável | Carteiras e assinaturas Ethereum |
| cryptography | pip | `cryptography` | instalável | Criptografia moderna e segura |
| ethers | npm | `ethers` | referência | Biblioteca Ethereum |
| viem | npm | `viem` | referência | Biblioteca Ethereum tipada |
| wagmi | npm | `wagmi` | referência | Hooks React para carteiras e contratos |
| @solana/web3.js | npm | `@solana/web3.js` | referência | SDK da Solana |
| go-ethereum | Go | `github.com/ethereum/go-ethereum` | referência | Cliente Ethereum (geth) |

## Utilidades

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| python-dateutil | pip | `python-dateutil` | instalável | Datas e fusos horários |
| pytz | pip | `pytz` | instalável | Fusos horários |
| rich | pip | `rich` | instalável | Saída formatada no terminal |
| typer | pip | `typer` | instalável | CLIs com tipos |
| tqdm | pip | `tqdm` | instalável | Barras de progresso |
| orjson | pip | `orjson` | instalável | JSON muito rápido |
| joblib | pip | `joblib` | instalável | Paralelismo e cache em disco |
| cobra | Go | `github.com/spf13/cobra` | referência | CLIs com subcomandos |
| viper | Go | `github.com/spf13/viper` | referência | Configuração por arquivo e variáveis |
| zap | Go | `go.uber.org/zap` | referência | Logs estruturados e rápidos |
| logrus | Go | `github.com/sirupsen/logrus` | referência | Logs estruturados |
| uuid | Go | `github.com/google/uuid` | referência | Gerador de UUID |
| godotenv | Go | `github.com/joho/godotenv` | referência | Carregar arquivos .env |
| validator | Go | `github.com/go-playground/validator/v10` | referência | Validação de structs |

## Imagens, áudio e vídeo

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| pillow | pip | `pillow` | instalável | Manipulação de imagens |
| opencv-python-headless | pip | `opencv-python-headless` | instalável | Visão computacional sem interface gráfica |
| imageio | pip | `imageio` | instalável | Ler e escrever imagens e vídeos |
| pydub | pip | `pydub` | instalável | Manipulação de áudio |
| sharp | npm | `sharp` | referência | Redimensionar e converter imagens |

## Frontend (Next e React)

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| next | npm | `next` | referência | Framework React com SSR, rotas e API |
| react | npm | `react` | referência | Biblioteca de interfaces |
| react-dom | npm | `react-dom` | referência | Renderização do React no navegador |
| typescript | npm | `typescript` | referência | Tipagem estática para JavaScript |
| tailwindcss | npm | `tailwindcss` | referência | Estilos utilitários |
| framer-motion | npm | `framer-motion` | referência | Animações declarativas |
| zustand | npm | `zustand` | referência | Estado global simples |
| @tanstack/react-query | npm | `@tanstack/react-query` | referência | Dados do servidor com cache |
| react-hook-form | npm | `react-hook-form` | referência | Formulários performáticos |
| zod | npm | `zod` | referência | Validação de schemas com tipos |
| recharts | npm | `recharts` | referência | Gráficos em React |
| chart.js | npm | `chart.js` | referência | Gráficos em canvas |
| d3 | npm | `d3` | referência | Visualização de dados com SVG |
| lucide-react | npm | `lucide-react` | referência | Ícones em React |
| date-fns | npm | `date-fns` | referência | Datas sem mutação |
| three | npm | `three` | referência | Gráficos 3D na web |
| @react-three/fiber | npm | `@react-three/fiber` | referência | Three.js declarativo em React |

## Engenharia reversa

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| pefile | pip | `pefile` | instalável | Ler executáveis Windows (PE). *Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| pyelftools | pip | `pyelftools` | instalável | Ler executáveis Linux (ELF) e DWARF. *Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| capstone | pip | `capstone` | instalável | Desmontagem de código de máquina. *Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| yara-python | pip | `yara-python` | instalável | Regras YARA para detectar padrões em arquivos. *Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| pyghidra | pip | `pyghidra` | template | Ghidra a partir do Python. *Precisa do Ghidra instalado no template. Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| ghidra-bridge | pip | `ghidra-bridge` | template | Ponte Python para o Ghidra. *Precisa do Ghidra instalado no template. Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| Ghidra | Java | `ghidra` | template | Framework de engenharia reversa da NSA, com decompilador e análise automática. *Precisa de JDK e de um download grande; exige template próprio. Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |


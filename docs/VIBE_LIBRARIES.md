# Catálogo de bibliotecas do Vibe Dev

O Vibe Dev conhece um catálogo único de bibliotecas em Python, npm (Next e o ecossistema React), Go e engenharia reversa (Ghidra). Este documento é gerado a partir dele: a fonte da verdade é `supabase/functions/_shared/vibeLibraries.ts`, reexportado para o front-end em `src/config/vibeLibraries.ts`.

## Como o catálogo é usado

- **Sandbox Python (`python_run`)**: só instala, com `pip install`, pacotes com status `ready` (a lista `PYTHON_PACKAGES` é derivada do catálogo, sem lista paralela). Pacote fora da lista é descartado silenciosamente por `sanitizePackages`. Cada pacote Python traz o nome de `import` quando ele difere do nome pip (ex.: `opencv-python-headless` importa como `cv2`, `beautifulsoup4` como `bs4`, `pillow` como `PIL`).
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

- Total: **270** bibliotecas.
- ✅ instalável agora (sandbox Python): **142**
- 📘 conhecida para projetos gerados: **115**
- 🧩 exige template próprio: **13**
- Na allowlist de `pip` da sandbox: **142** pacotes.

## Por categoria

| Categoria | Bibliotecas | Runtime | Status |
|---|---|---|---|
| Dados | 7 | pip | instalável |
| Machine learning | 10 | pip | instalável, template |
| Visualização | 8 | pip | instalável |
| Documentos e escritórios | 14 | pip | instalável |
| Web e HTTP | 13 | pip, npm, Go | instalável, referência |
| Backend e APIs | 46 | pip, npm, Go | instalável, referência |
| Banco de dados | 26 | pip, npm, Go | instalável, referência |
| Testes e qualidade | 16 | pip, npm, Go | instalável, template, referência |
| IA e linguagem | 22 | pip, npm | instalável, template, referência |
| Ciência | 8 | pip | instalável, template |
| Web3 e criptografia | 8 | pip, npm, Go | instalável, referência |
| Utilidades | 29 | pip, Go | instalável, referência |
| Imagens, áudio e vídeo | 6 | pip, npm | instalável, template, referência |
| Frontend (Next e React) | 38 | npm | referência |
| Engenharia reversa | 7 | pip, Java | instalável, template |
| Ferramentas de desenvolvimento | 3 | pip | instalável |
| Segurança e criptografia | 6 | pip, Go | instalável, referência |
| Finanças e cripto | 3 | pip | instalável |

## Dados

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| pandas | pip | `pandas` | instalável | Tabelas e análise de dados, com DataFrames, agrupamentos e leitura de CSV, Excel e SQL |
| numpy | pip | `numpy` | instalável | Arrays multidimensionais e álgebra linear, base de quase todo o ecossistema científico |
| scipy | pip | `scipy` | instalável | Estatística, otimização, integração numérica e processamento de sinais |
| polars | pip | `polars` | instalável | DataFrames muito mais rápidos que o pandas em grandes volumes, escritos em Rust |
| pyarrow | pip | `pyarrow` | instalável | Formato colunar Arrow e leitura e escrita de Parquet, para trocar dados entre ferramentas |
| duckdb | pip | `duckdb` | instalável | Banco SQL analítico embutido: consulta CSV, Parquet e DataFrames sem servidor |
| pandera | pip | `pandera` | instalável | Validação de DataFrames com schemas e testes de qualidade de dados |

## Machine learning

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| scikit-learn | pip | `scikit-learn` | instalável | Modelos clássicos de machine learning: classificação, regressão, clustering e pipelines |
| statsmodels | pip | `statsmodels` | instalável | Modelos estatísticos, regressões e séries temporais com testes de hipótese |
| xgboost | pip | `xgboost` | instalável | Gradient boosting de alta performance, padrão em dados tabulares |
| lightgbm | pip | `lightgbm` | instalável | Gradient boosting leve da Microsoft, rápido em grandes tabelas |
| optuna | pip | `optuna` | instalável | Otimização de hiperparâmetros com busca inteligente e painel de acompanhamento |
| scikit-image | pip | `scikit-image` | instalável | Processamento de imagens científicas: filtros, segmentação e features |
| torch | pip | `torch` | template | PyTorch, framework de deep learning. *Pesado demais para instalar a cada execução; exige template próprio.* |
| tensorflow | pip | `tensorflow` | template | TensorFlow, framework de deep learning. *Pesado demais para instalar a cada execução; exige template próprio.* |
| prophet | pip | `prophet` | template | Previsão de séries temporais com sazonalidade (Meta). *Depende do Stan (compilação); exige template próprio.* |
| mlflow | pip | `mlflow` | template | Rastreamento de experimentos e registro de modelos. *Pacote grande com muitas dependências; exige template próprio.* |

## Visualização

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| matplotlib | pip | `matplotlib` | instalável | Gráficos estáticos de qualquer tipo, para relatórios e publicações |
| seaborn | pip | `seaborn` | instalável | Gráficos estatísticos bonitos com poucas linhas de código |
| plotly | pip | `plotly` | instalável | Gráficos interativos com zoom e hover, exportáveis para HTML |
| altair | pip | `altair` | instalável | Gráficos declarativos baseados em Vega-Lite |
| bokeh | pip | `bokeh` | instalável | Gráficos interativos e dashboards para navegador |
| dash | pip | `dash` | instalável | Dashboards web interativos em Python, sobre Plotly |
| streamlit | pip | `streamlit` | instalável | Apps de dados em Python com poucas linhas, ideal para protótipos e painéis internos |
| gradio | pip | `gradio` | instalável | Interfaces web para modelos de IA e demos com um clique de publicação |

## Documentos e escritórios

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| openpyxl | pip | `openpyxl` | instalável | Ler e escrever planilhas .xlsx, com fórmulas e formatação |
| xlsxwriter | pip | `xlsxwriter` | instalável | Criar planilhas .xlsx com gráficos e formatação avançada |
| python-docx | pip | `python-docx` | instalável | Ler e escrever documentos Word .docx |
| python-pptx | pip | `python-pptx` | instalável | Criar e editar apresentações .pptx |
| pypdf | pip | `pypdf` | instalável | Ler, dividir, juntar e girar PDFs |
| pdfplumber | pip | `pdfplumber` | instalável | Extrair texto e tabelas de PDFs com posição de cada caractere |
| pymupdf | pip | `pymupdf` | instalável | Renderizar, ler e editar PDFs rapidamente (módulo fitz) |
| reportlab | pip | `reportlab` | instalável | Gerar PDFs do zero com layout preciso |
| pyyaml | pip | `pyyaml` | instalável | Ler e escrever YAML |
| toml | pip | `toml` | instalável | Ler e escrever arquivos TOML de configuração |
| xmltodict | pip | `xmltodict` | instalável | Converter XML em dicionários Python e vice-versa |
| tabulate | pip | `tabulate` | instalável | Tabelas formatadas em texto, Markdown e HTML |
| markdown | pip | `markdown` | instalável | Converter Markdown em HTML |
| jinja2 | pip | `jinja2` | instalável | Templates com lógica, para gerar HTML, e-mails e relatórios |

## Web e HTTP

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| requests | pip | `requests` | instalável | Cliente HTTP síncrono, o mais usado para chamar APIs |
| httpx | pip | `httpx` | instalável | Cliente HTTP síncrono e assíncrono, com suporte a HTTP/2 |
| aiohttp | pip | `aiohttp` | instalável | Cliente e servidor HTTP assíncronos |
| beautifulsoup4 | pip | `beautifulsoup4` | instalável | Extrair dados de HTML mal formado |
| lxml | pip | `lxml` | instalável | Parser rápido de HTML e XML, com XPath |
| html5lib | pip | `html5lib` | instalável | Parser de HTML que reproduz o comportamento dos navegadores |
| feedparser | pip | `feedparser` | instalável | Ler feeds RSS e Atom |
| trafilatura | pip | `trafilatura` | instalável | Extrair o texto principal de páginas web, sem menus e anúncios |
| scrapy | pip | `scrapy` | instalável | Framework de coleta de dados web em escala, com fila de requisições |
| websockets | pip | `websockets` | instalável | Servidores e clientes WebSocket |
| axios | npm | `axios` | referência | Cliente HTTP com interceptadores |
| resty | Go | `github.com/go-resty/resty/v2` | referência | Cliente HTTP com retentativas e JSON automático |
| colly | Go | `github.com/gocolly/colly/v2` | referência | Coleta de dados da web em Go |

## Backend e APIs

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| fastapi | pip | `fastapi` | instalável | API web moderna em Python, com validação automática e documentação OpenAPI |
| uvicorn | pip | `uvicorn` | instalável | Servidor ASGI rápido para FastAPI e Starlette |
| flask | pip | `flask` | instalável | Microframework web simples e flexível |
| pydantic | pip | `pydantic` | instalável | Validação e conversão de dados com tipos Python |
| pydantic-settings | pip | `pydantic-settings` | instalável | Configuração da aplicação lida de variáveis de ambiente e .env, com tipos |
| python-multipart | pip | `python-multipart` | instalável | Upload de arquivos e formulários para FastAPI e Starlette |
| apscheduler | pip | `apscheduler` | instalável | Agendamento de tarefas dentro do processo (cron e intervalos) |
| tenacity | pip | `tenacity` | instalável | Retentativas com backoff para chamadas instáveis |
| click | pip | `click` | instalável | Criar CLIs com subcomandos e opções |
| grpcio | pip | `grpcio` | instalável | Cliente e servidor gRPC |
| protobuf | pip | `protobuf` | instalável | Protocol Buffers para serialização e contratos de API |
| boto3 | pip | `boto3` | instalável | SDK oficial da AWS para Python (S3, DynamoDB, Lambda e mais) |
| stripe | pip | `stripe` | instalável | SDK oficial da Stripe para cobranças, assinaturas e webhooks |
| slack-sdk | pip | `slack-sdk` | instalável | SDK oficial do Slack para bots e mensagens |
| express | npm | `express` | referência | Servidor HTTP minimalista e o mais conhecido do Node |
| fastify | npm | `fastify` | referência | Servidor HTTP rápido com validação de schema |
| hono | npm | `hono` | referência | Servidor leve para edge, Workers e serverless |
| socket.io | npm | `socket.io` | referência | Comunicação em tempo real com fallback e salas |
| graphql | npm | `graphql` | referência | Implementação de referência do GraphQL |
| @trpc/server | npm | `@trpc/server` | referência | APIs tipadas de ponta a ponta sem gerar código |
| @apollo/client | npm | `@apollo/client` | referência | Cliente GraphQL com cache normalizado |
| bullmq | npm | `bullmq` | referência | Filas de tarefas com Redis |
| nodemailer | npm | `nodemailer` | referência | Envio de e-mails por SMTP |
| resend | npm | `resend` | referência | SDK da Resend para envio de e-mails transacionais |
| stripe | npm | `stripe` | referência | SDK oficial da Stripe para Node |
| next-auth | npm | `next-auth` | referência | Autenticação para Next.js com provedores OAuth |
| gin | Go | `github.com/gin-gonic/gin` | referência | Framework HTTP rápido, com middlewares e roteamento |
| fiber | Go | `github.com/gofiber/fiber/v2` | referência | Framework HTTP inspirado no Express, baseado em fasthttp |
| chi | Go | `github.com/go-chi/chi/v5` | referência | Roteador HTTP idiomático e componível |
| mux | Go | `github.com/gorilla/mux` | referência | Roteador HTTP clássico |
| echo | Go | `github.com/labstack/echo/v4` | referência | Framework HTTP minimalista com boa performance |
| websocket | Go | `github.com/gorilla/websocket` | referência | WebSocket para Go |
| cors | Go | `github.com/rs/cors` | referência | Middleware de CORS |
| jwt | Go | `github.com/golang-jwt/jwt/v5` | referência | Criar e verificar tokens JWT |
| grpc | Go | `google.golang.org/grpc` | referência | RPC de alto desempenho |
| protobuf | Go | `google.golang.org/protobuf` | referência | Protocol Buffers para Go |
| swag | Go | `github.com/swaggo/swag` | referência | Gerar documentação OpenAPI a partir de comentários |
| client_golang | Go | `github.com/prometheus/client_golang` | referência | Métricas no formato Prometheus |
| otel | Go | `go.opentelemetry.io/otel` | referência | Traces, métricas e logs padronizados (OpenTelemetry) |
| aws-sdk-go-v2 | Go | `github.com/aws/aws-sdk-go-v2` | referência | SDK oficial da AWS para Go |
| stripe-go | Go | `github.com/stripe/stripe-go/v79` | referência | SDK oficial da Stripe para Go |
| nats.go | Go | `github.com/nats-io/nats.go` | referência | Mensageria leve com NATS |
| kafka-go | Go | `github.com/segmentio/kafka-go` | referência | Cliente Kafka puro Go |
| amqp091-go | Go | `github.com/rabbitmq/amqp091-go` | referência | Cliente RabbitMQ (AMQP 0-9-1) |
| asynq | Go | `github.com/hibiken/asynq` | referência | Filas de tarefas em Go com Redis |
| cron | Go | `github.com/robfig/cron/v3` | referência | Agendamento de tarefas com sintaxe cron |

## Banco de dados

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| sqlalchemy | pip | `sqlalchemy` | instalável | ORM e toolkit SQL, com suporte a praticamente todos os bancos |
| sqlmodel | pip | `sqlmodel` | instalável | ORM que combina SQLAlchemy e Pydantic, ideal com FastAPI |
| alembic | pip | `alembic` | instalável | Migrações de schema para SQLAlchemy |
| peewee | pip | `peewee` | instalável | ORM pequeno e simples para SQLite e PostgreSQL |
| psycopg2-binary | pip | `psycopg2-binary` | instalável | Driver PostgreSQL síncrono |
| asyncpg | pip | `asyncpg` | instalável | Driver PostgreSQL assíncrono, muito rápido |
| pymongo | pip | `pymongo` | instalável | Driver oficial do MongoDB |
| motor | pip | `motor` | instalável | Driver MongoDB assíncrono para asyncio |
| redis | pip | `redis` | instalável | Cliente Redis para cache, filas e pub/sub |
| supabase | pip | `supabase` | instalável | Cliente Python oficial do Supabase |
| qdrant-client | pip | `qdrant-client` | instalável | Cliente do banco vetorial Qdrant para busca semântica |
| ioredis | npm | `ioredis` | referência | Cliente Redis para Node |
| prisma | npm | `prisma` | referência | ORM com migrações e tipos gerados |
| drizzle-orm | npm | `drizzle-orm` | referência | ORM SQL tipado e leve |
| knex | npm | `knex` | referência | Construtor de queries SQL com migrações |
| pg | npm | `pg` | referência | Driver PostgreSQL para Node |
| mysql2 | npm | `mysql2` | referência | Driver MySQL para Node |
| mongoose | npm | `mongoose` | referência | ODM para MongoDB com schemas |
| @supabase/supabase-js | npm | `@supabase/supabase-js` | referência | Cliente oficial do Supabase |
| gorm | Go | `gorm.io/gorm` | referência | ORM para Go com migrações e associações |
| pgx | Go | `github.com/jackc/pgx/v5` | referência | Driver PostgreSQL de alta performance |
| mysql | Go | `github.com/go-sql-driver/mysql` | referência | Driver MySQL |
| mongo-driver | Go | `go.mongodb.org/mongo-driver` | referência | Driver oficial do MongoDB |
| go-redis | Go | `github.com/redis/go-redis/v9` | referência | Cliente Redis |
| migrate | Go | `github.com/golang-migrate/migrate/v4` | referência | Migrações de banco em Go, em muitos bancos |
| goose | Go | `github.com/pressly/goose/v3` | referência | Migrações de banco com arquivos SQL ou Go |

## Testes e qualidade

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| pytest | pip | `pytest` | instalável | Framework de testes com fixtures e asserções simples |
| pytest-asyncio | pip | `pytest-asyncio` | instalável | Testes para código assíncrono com pytest |
| pytest-cov | pip | `pytest-cov` | instalável | Cobertura de código para o pytest |
| hypothesis | pip | `hypothesis` | instalável | Testes baseados em propriedades: gera casos e acha bugs de borda |
| faker | pip | `faker` | instalável | Gerar dados falsos realistas (nomes, endereços, datas) para testes e seeds |
| freezegun | pip | `freezegun` | instalável | Congelar o relógio nos testes para tornar datas determinísticas |
| respx | pip | `respx` | instalável | Simular respostas HTTP nos testes do httpx |
| ruff | pip | `ruff` | instalável | Linter e formatador extremamente rápido |
| black | pip | `black` | instalável | Formatador de código padronizado |
| flake8 | pip | `flake8` | instalável | Linter clássico de estilo e erros |
| mypy | pip | `mypy` | instalável | Checagem estática de tipos |
| selenium | pip | `selenium` | template | Automação de navegador real. *Precisa de navegador e driver no template.* |
| vitest | npm | `vitest` | referência | Testes unitários rápidos com a API do Jest |
| playwright | npm | `playwright` | referência | Testes e automação de navegadores reais |
| puppeteer | npm | `puppeteer` | referência | Automação do Chrome via protocolo DevTools |
| testify | Go | `github.com/stretchr/testify` | referência | Asserções e mocks para testes |

## IA e linguagem

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| openai | pip | `openai` | instalável | SDK oficial da OpenAI |
| anthropic | pip | `anthropic` | instalável | SDK oficial da Anthropic |
| google-generativeai | pip | `google-generativeai` | instalável | SDK do Gemini do Google |
| mistralai | pip | `mistralai` | instalável | SDK oficial da Mistral AI |
| groq | pip | `groq` | instalável | SDK da Groq para inferência rápida de modelos abertos |
| ollama | pip | `ollama` | instalável | Cliente para modelos rodando localmente com Ollama |
| cohere | pip | `cohere` | instalável | SDK da Cohere para geração, embeddings e busca |
| langchain | pip | `langchain` | instalável | Framework para compor chamadas de LLM, ferramentas e cadeias |
| tavily-python | pip | `tavily-python` | instalável | Busca na web otimizada para agentes de IA |
| pinecone | pip | `pinecone` | instalável | Cliente do banco vetorial Pinecone |
| tiktoken | pip | `tiktoken` | instalável | Contagem de tokens compatível com os modelos da OpenAI |
| nltk | pip | `nltk` | instalável | Processamento de linguagem natural clássico: tokenização, stemming e corpora |
| textblob | pip | `textblob` | instalável | NLP simples: sentimento, tradução e classificação de texto |
| vadersentiment | pip | `vadersentiment` | instalável | Análise de sentimento para textos curtos e redes sociais |
| transformers | pip | `transformers` | template | Modelos Hugging Face para texto, visão e áudio. *Depende de torch; exige template próprio.* |
| sentence-transformers | pip | `sentence-transformers` | template | Embeddings de texto para busca semântica. *Depende de torch; exige template próprio.* |
| spacy | pip | `spacy` | template | NLP de produção: entidades, dependências e pipelines. *Modelos grandes; exige template próprio.* |
| openai | npm | `openai` | referência | SDK oficial da OpenAI para Node e navegador |
| @anthropic-ai/sdk | npm | `@anthropic-ai/sdk` | referência | SDK oficial da Anthropic para Node |
| @google/generative-ai | npm | `@google/generative-ai` | referência | SDK do Gemini do Google |
| groq-sdk | npm | `groq-sdk` | referência | SDK da Groq para inferência rápida |
| ai | npm | `ai` | referência | SDK da Vercel para streaming de chat e agentes com vários modelos |

## Ciência

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| sympy | pip | `sympy` | instalável | Matemática simbólica: álgebra, cálculo e equações |
| networkx | pip | `networkx` | instalável | Grafos e redes: caminhos, centralidade e comunidades |
| shapely | pip | `shapely` | instalável | Geometria computacional 2D: polígonos, interseções e buffers |
| pint | pip | `pint` | instalável | Unidades físicas com conversão e checagem dimensional |
| biopython | pip | `biopython` | instalável | Bioinformática: sequências, estruturas e acesso a bancos biológicos |
| pyproj | pip | `pyproj` | instalável | Transformação entre sistemas de coordenadas geográficas |
| geopy | pip | `geopy` | instalável | Geocodificação e distâncias geográficas |
| geopandas | pip | `geopandas` | template | DataFrames geoespaciais: mapas, joins espaciais e leitura de shapefiles. *Dependências nativas GDAL/GEOS; exige template próprio.* |

## Web3 e criptografia

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| web3 | pip | `web3` | instalável | Interação com contratos Ethereum e redes compatíveis com EVM |
| eth-account | pip | `eth-account` | instalável | Carteiras, assinaturas e transações Ethereum offline |
| solana | pip | `solana` | instalável | SDK em Python para a rede Solana |
| ethers | npm | `ethers` | referência | Biblioteca Ethereum consolidada |
| viem | npm | `viem` | referência | Biblioteca Ethereum tipada e leve |
| wagmi | npm | `wagmi` | referência | Hooks React para carteiras e contratos |
| @solana/web3.js | npm | `@solana/web3.js` | referência | SDK oficial da Solana para JavaScript |
| go-ethereum | Go | `github.com/ethereum/go-ethereum` | referência | Cliente Ethereum (geth) e bibliotecas para contratos |

## Utilidades

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| typer | pip | `typer` | instalável | CLIs com tipos Python, construídas sobre o Click |
| python-dateutil | pip | `python-dateutil` | instalável | Datas, fusos horários e parsing flexível de datas |
| pytz | pip | `pytz` | instalável | Fusos horários da base IANA |
| arrow | pip | `arrow` | instalável | Datas e horários com API amigável |
| pendulum | pip | `pendulum` | instalável | Datas e fusos horários com aritmética segura |
| humanize | pip | `humanize` | instalável | Formatar números, datas e tamanhos de forma legível ("3 minutos atrás") |
| phonenumbers | pip | `phonenumbers` | instalável | Validar e formatar números de telefone do mundo inteiro |
| email-validator | pip | `email-validator` | instalável | Validar endereços de e-mail, incluindo domínios |
| pycountry | pip | `pycountry` | instalável | Países, moedas e idiomas com códigos ISO |
| babel | pip | `babel` | instalável | Internacionalização: formatação de datas e moedas por idioma |
| rich | pip | `rich` | instalável | Saída bonita no terminal: tabelas, cores e progresso |
| tqdm | pip | `tqdm` | instalável | Barras de progresso para loops |
| orjson | pip | `orjson` | instalável | JSON muito rápido |
| joblib | pip | `joblib` | instalável | Paralelismo simples e cache de resultados em disco |
| loguru | pip | `loguru` | instalável | Logs legíveis com uma linha de configuração |
| structlog | pip | `structlog` | instalável | Logs estruturados em JSON para produção |
| python-dotenv | pip | `python-dotenv` | instalável | Carregar variáveis de arquivos .env |
| qrcode | pip | `qrcode` | instalável | Gerar QR codes em imagem ou SVG |
| cobra | Go | `github.com/spf13/cobra` | referência | CLIs com subcomandos, como o kubectl |
| viper | Go | `github.com/spf13/viper` | referência | Configuração por arquivo, variáveis e flags |
| mapstructure | Go | `github.com/mitchellh/mapstructure` | referência | Converter mapas em structs |
| zap | Go | `go.uber.org/zap` | referência | Logs estruturados e rápidos |
| zerolog | Go | `github.com/rs/zerolog` | referência | Logs JSON sem alocações |
| logrus | Go | `github.com/sirupsen/logrus` | referência | Logs estruturados clássicos |
| uuid | Go | `github.com/google/uuid` | referência | Gerar UUIDs |
| godotenv | Go | `github.com/joho/godotenv` | referência | Carregar arquivos .env |
| validator | Go | `github.com/go-playground/validator/v10` | referência | Validação de structs por tags |
| gjson | Go | `github.com/tidwall/gjson` | referência | Ler campos de JSON sem decodificar tudo |
| backoff | Go | `github.com/cenkalti/backoff/v4` | referência | Retentativas com backoff exponencial |

## Imagens, áudio e vídeo

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| pillow | pip | `pillow` | instalável | Manipulação de imagens: redimensionar, recortar, converter e desenhar |
| opencv-python-headless | pip | `opencv-python-headless` | instalável | Visão computacional sem interface gráfica: detecção, filtros e vídeo |
| imageio | pip | `imageio` | instalável | Ler e escrever imagens, GIFs e vídeos |
| pydub | pip | `pydub` | instalável | Manipulação de áudio: cortar, juntar e converter |
| pytesseract | pip | `pytesseract` | template | OCR: reconhecer texto em imagens com Tesseract. *Precisa do binário Tesseract instalado no sistema.* |
| sharp | npm | `sharp` | referência | Redimensionar e converter imagens com libvips |

## Frontend (Next e React)

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| next | npm | `next` | referência | Framework React com renderização no servidor, rotas e API integradas |
| react | npm | `react` | referência | Biblioteca para construir interfaces com componentes |
| react-dom | npm | `react-dom` | referência | Renderização do React no navegador |
| typescript | npm | `typescript` | referência | Tipagem estática para JavaScript |
| tailwindcss | npm | `tailwindcss` | referência | Estilos por classes utilitárias |
| framer-motion | npm | `framer-motion` | referência | Animações declarativas e gestos para React |
| gsap | npm | `gsap` | referência | Animações de alto desempenho para timelines complexas |
| zustand | npm | `zustand` | referência | Estado global simples e leve |
| jotai | npm | `jotai` | referência | Estado atômico para React |
| @reduxjs/toolkit | npm | `@reduxjs/toolkit` | referência | Redux com o padrão recomendado, para estado complexo |
| @tanstack/react-query | npm | `@tanstack/react-query` | referência | Busca, cache e sincronização de dados do servidor |
| @tanstack/react-router | npm | `@tanstack/react-router` | referência | Roteamento de React com tipos de ponta a ponta |
| swr | npm | `swr` | referência | Busca de dados com cache e revalidação |
| react-hook-form | npm | `react-hook-form` | referência | Formulários performáticos com validação |
| @hookform/resolvers | npm | `@hookform/resolvers` | referência | Conecta o react-hook-form a Zod, Yup e outros validadores |
| zod | npm | `zod` | referência | Validação de schemas com inferência de tipos |
| recharts | npm | `recharts` | referência | Gráficos em React, declarativos |
| chart.js | npm | `chart.js` | referência | Gráficos em canvas, leves e animados |
| d3 | npm | `d3` | referência | Visualização de dados com SVG e controle total |
| leaflet | npm | `leaflet` | referência | Mapas interativos leves |
| lucide-react | npm | `lucide-react` | referência | Ícones em React |
| @radix-ui/react-dialog | npm | `@radix-ui/react-dialog` | referência | Diálogos acessíveis sem estilo, base de componentes de UI |
| class-variance-authority | npm | `class-variance-authority` | referência | Variantes de componentes com classes tipadas |
| clsx | npm | `clsx` | referência | Montar strings de classes condicionais |
| tailwind-merge | npm | `tailwind-merge` | referência | Resolver conflitos entre classes do Tailwind |
| sonner | npm | `sonner` | referência | Notificações (toasts) bonitas para React |
| react-markdown | npm | `react-markdown` | referência | Renderizar Markdown como componentes React |
| @monaco-editor/react | npm | `@monaco-editor/react` | referência | Editor de código do VS Code dentro da página |
| date-fns | npm | `date-fns` | referência | Datas com funções puras e tree-shaking |
| dayjs | npm | `dayjs` | referência | Datas pequenas com API parecida com o Moment |
| three | npm | `three` | referência | Gráficos 3D na web com WebGL |
| @react-three/fiber | npm | `@react-three/fiber` | referência | Three.js declarativo em React |
| vue | npm | `vue` | referência | Framework de interfaces reativo e progressivo |
| svelte | npm | `svelte` | referência | Compilador de interfaces sem runtime pesado |
| @sveltejs/kit | npm | `@sveltejs/kit` | referência | Framework full-stack para Svelte |
| nuxt | npm | `nuxt` | referência | Framework full-stack para Vue |
| astro | npm | `astro` | referência | Sites rápidos com ilhas de interatividade |
| @remix-run/react | npm | `@remix-run/react` | referência | Framework full-stack para React com foco em formulários e carregamento |

## Engenharia reversa

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| pefile | pip | `pefile` | instalável | Ler executáveis Windows (PE): seções, imports e recursos. *Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| pyelftools | pip | `pyelftools` | instalável | Ler executáveis Linux (ELF) e informações DWARF. *Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| capstone | pip | `capstone` | instalável | Desmontagem de código de máquina em várias arquiteturas. *Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| yara-python | pip | `yara-python` | instalável | Regras YARA para identificar padrões em arquivos (detecção defensiva). *Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| pyghidra | pip | `pyghidra` | template | Ghidra a partir do Python. *Precisa do Ghidra instalado no template. Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| ghidra-bridge | pip | `ghidra-bridge` | template | Ponte Python para o Ghidra. *Precisa do Ghidra instalado no template. Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |
| Ghidra | Java | `ghidra` | template | Framework de engenharia reversa da NSA, com decompilador e análise automática de binários. *Precisa de JDK e de um download grande; exige template próprio. Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.* |

## Ferramentas de desenvolvimento

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| ipython | pip | `ipython` | instalável | Shell interativo avançado |
| pygithub | pip | `pygithub` | instalável | Cliente da API do GitHub: repositórios, issues e pull requests |
| gitpython | pip | `gitpython` | instalável | Operar repositórios Git a partir do Python |

## Segurança e criptografia

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| bandit | pip | `bandit` | instalável | Análise estática de segurança para código Python (SAST) |
| cryptography | pip | `cryptography` | instalável | Criptografia moderna e segura: AES, RSA, hashes e assinaturas |
| pyjwt | pip | `pyjwt` | instalável | Criar e verificar tokens JWT |
| passlib | pip | `passlib` | instalável | Hash de senhas com algoritmos seguros e migração entre eles |
| bcrypt | pip | `bcrypt` | instalável | Hash de senhas com bcrypt |
| casbin | Go | `github.com/casbin/casbin/v2` | referência | Controle de acesso (RBAC e ABAC) com políticas |

## Finanças e cripto

| Biblioteca | Runtime | Instalação | Status | O que faz |
|---|---|---|---|---|
| yfinance | pip | `yfinance` | instalável | Cotações e dados históricos de ações e ETFs (Yahoo Finance) |
| pandas-ta | pip | `pandas-ta` | instalável | Indicadores técnicos de análise financeira sobre DataFrames |
| ccxt | pip | `ccxt` | instalável | Acesso unificado a dezenas de corretoras de cripto via API |


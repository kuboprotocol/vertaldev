// Catálogo de bibliotecas do Vibe Dev: a fonte única para o que a plataforma conhece,
// em Python, npm (Next e o ecossistema React e de backend), Go e engenharia reversa (Ghidra).
// Lógica pura, sem Deno nem browser: usada pela função `vibe-agents` e pelo front-end
// (via src/config/vibeLibraries.ts).
//
// Cada entrada tem um `status` que diz exatamente o que a plataforma faz com ela hoje:
//  - "ready"     : instalável na sandbox Python agora (entra na allowlist de pip).
//  - "reference" : conhecida pela plataforma para projetos gerados (npm/Go); a sandbox
//                  Python não a instala. Não é executada pelo agente ainda.
//  - "template"  : exige um template de sandbox próprio (pesada demais para o limite de
//                  60 s por execução, depende de binário/navegador do sistema, ou não é Python).
//
// Regras do catálogo:
//  - Nunca remover uma entrada: ids são estáveis. Mudanças de status são explícitas.
//  - Nomes foram verificados nos registros oficiais (PyPI, npm e proxy.golang.org).
//  - `importName` (pip) é o nome usado no `import` do Python, quando difere do pacote.

export type LibraryRuntime = "pip" | "npm" | "go" | "java" | "tool";
export type LibraryStatus = "ready" | "reference" | "template";
export type LibraryCategory =
  | "data"
  | "ml"
  | "viz"
  | "office"
  | "web"
  | "backend"
  | "database"
  | "testing"
  | "ai"
  | "science"
  | "web3"
  | "utils"
  | "media"
  | "frontend"
  | "devtools"
  | "security"
  | "finance"
  | "reverse-engineering";

export interface VibeLibrary {
  /** Identificador estável (slug). Nunca muda depois de publicado. */
  id: string;
  /** Nome para exibição. */
  name: string;
  runtime: LibraryRuntime;
  /** Como instalar: pacote pip, pacote npm, módulo Go (com /vN) ou nome da ferramenta. */
  package: string;
  /** Nome usado no `import` do Python, quando diferente do pacote pip. */
  importName?: string;
  category: LibraryCategory;
  status: LibraryStatus;
  /** Uma linha, em português: o que a biblioteca faz e para quê serve. */
  description: string;
  /** Restrição de uso ou requisito, quando houver. */
  note?: string;
  /** Projeto de origem, quando a entrada veio de outro repositório (ex.: "REA"). */
  source?: string;
}

const pip = (
  package_: string,
  category: LibraryCategory,
  description: string,
  status: LibraryStatus = "ready",
  note?: string,
  importName?: string,
): VibeLibrary => ({
  id: package_,
  name: package_,
  runtime: "pip",
  package: package_,
  importName,
  category,
  status,
  description,
  note,
});

const npm = (package_: string, category: LibraryCategory, description: string, name = package_, id = package_): VibeLibrary => ({
  id,
  name,
  runtime: "npm",
  package: package_,
  category,
  status: "reference",
  description,
});

const go = (module: string, category: LibraryCategory, description: string): VibeLibrary => {
  const parts = module.split("/");
  const last = parts[parts.length - 1];
  // Módulos com sufixo de versão (/v2, /v5) usam o segmento anterior como nome.
  const name = /^v\d+$/.test(last) ? parts[parts.length - 2] : last;
  return { id: module, name, runtime: "go", package: module, category, status: "reference", description };
};

const REVERSE_NOTE =
  "Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.";

/** Origem das entradas que vieram do REA (morluto/rea, MIT). */
const REA_SOURCE = "REA (morluto/rea, MIT)";

/** Ferramenta externa (binário/app próprio), não uma biblioteca instalável pela plataforma. Sempre template. */
const tool = (
  name: string,
  category: LibraryCategory,
  description: string,
  note?: string,
  source?: string,
): VibeLibrary => ({
  id: name.toLowerCase(),
  name,
  runtime: "tool",
  package: name,
  category,
  status: "template",
  description,
  note,
  source,
});

const EXPLOIT_NOTE =
  "Biblioteca de desenvolvimento de exploits. Só para CTF, laboratórios e pesquisa autorizada. A plataforma não gera nem executa exploits contra alvos de terceiros.";

export const VIBE_LIBRARIES: VibeLibrary[] = [
  // ======================= Python: instaláveis na sandbox (ready) =======================

  // Dados
  pip("pandas", "data", "Tabelas e análise de dados, com DataFrames, agrupamentos e leitura de CSV, Excel e SQL"),
  pip("numpy", "data", "Arrays multidimensionais e álgebra linear, base de quase todo o ecossistema científico"),
  pip("scipy", "data", "Estatística, otimização, integração numérica e processamento de sinais"),
  pip("polars", "data", "DataFrames muito mais rápidos que o pandas em grandes volumes, escritos em Rust"),
  pip("pyarrow", "data", "Formato colunar Arrow e leitura e escrita de Parquet, para trocar dados entre ferramentas"),
  pip("duckdb", "data", "Banco SQL analítico embutido: consulta CSV, Parquet e DataFrames sem servidor"),
  pip("pandera", "data", "Validação de DataFrames com schemas e testes de qualidade de dados", "ready", undefined, "pandera"),

  // Machine learning e estatística
  pip("scikit-learn", "ml", "Modelos clássicos de machine learning: classificação, regressão, clustering e pipelines", "ready", undefined, "sklearn"),
  pip("statsmodels", "ml", "Modelos estatísticos, regressões e séries temporais com testes de hipótese"),
  pip("xgboost", "ml", "Gradient boosting de alta performance, padrão em dados tabulares"),
  pip("lightgbm", "ml", "Gradient boosting leve da Microsoft, rápido em grandes tabelas"),
  pip("optuna", "ml", "Otimização de hiperparâmetros com busca inteligente e painel de acompanhamento"),
  pip("scikit-image", "ml", "Processamento de imagens científicas: filtros, segmentação e features", "ready", undefined, "skimage"),

  // Visualização
  pip("matplotlib", "viz", "Gráficos estáticos de qualquer tipo, para relatórios e publicações"),
  pip("seaborn", "viz", "Gráficos estatísticos bonitos com poucas linhas de código"),
  pip("plotly", "viz", "Gráficos interativos com zoom e hover, exportáveis para HTML"),
  pip("altair", "viz", "Gráficos declarativos baseados em Vega-Lite"),
  pip("bokeh", "viz", "Gráficos interativos e dashboards para navegador"),
  pip("dash", "viz", "Dashboards web interativos em Python, sobre Plotly"),
  pip("streamlit", "viz", "Apps de dados em Python com poucas linhas, ideal para protótipos e painéis internos"),
  pip("gradio", "viz", "Interfaces web para modelos de IA e demos com um clique de publicação"),

  // Documentos e escritórios
  pip("openpyxl", "office", "Ler e escrever planilhas .xlsx, com fórmulas e formatação"),
  pip("xlsxwriter", "office", "Criar planilhas .xlsx com gráficos e formatação avançada"),
  pip("python-docx", "office", "Ler e escrever documentos Word .docx", "ready", undefined, "docx"),
  pip("python-pptx", "office", "Criar e editar apresentações .pptx", "ready", undefined, "pptx"),
  pip("pypdf", "office", "Ler, dividir, juntar e girar PDFs"),
  pip("pdfplumber", "office", "Extrair texto e tabelas de PDFs com posição de cada caractere"),
  pip("pymupdf", "office", "Renderizar, ler e editar PDFs rapidamente (módulo fitz)", "ready", undefined, "fitz"),
  pip("reportlab", "office", "Gerar PDFs do zero com layout preciso"),
  pip("pyyaml", "office", "Ler e escrever YAML", "ready", undefined, "yaml"),
  pip("toml", "office", "Ler e escrever arquivos TOML de configuração"),
  pip("xmltodict", "office", "Converter XML em dicionários Python e vice-versa"),
  pip("tabulate", "office", "Tabelas formatadas em texto, Markdown e HTML"),
  pip("markdown", "office", "Converter Markdown em HTML"),
  pip("jinja2", "office", "Templates com lógica, para gerar HTML, e-mails e relatórios"),

  // Web e HTTP
  pip("requests", "web", "Cliente HTTP síncrono, o mais usado para chamar APIs"),
  pip("httpx", "web", "Cliente HTTP síncrono e assíncrono, com suporte a HTTP/2"),
  pip("aiohttp", "web", "Cliente e servidor HTTP assíncronos"),
  pip("beautifulsoup4", "web", "Extrair dados de HTML mal formado", "ready", undefined, "bs4"),
  pip("lxml", "web", "Parser rápido de HTML e XML, com XPath"),
  pip("html5lib", "web", "Parser de HTML que reproduz o comportamento dos navegadores"),
  pip("feedparser", "web", "Ler feeds RSS e Atom"),
  pip("trafilatura", "web", "Extrair o texto principal de páginas web, sem menus e anúncios"),
  pip("scrapy", "web", "Framework de coleta de dados web em escala, com fila de requisições"),
  pip("websockets", "web", "Servidores e clientes WebSocket"),

  // Backend e APIs
  pip("fastapi", "backend", "API web moderna em Python, com validação automática e documentação OpenAPI"),
  pip("uvicorn", "backend", "Servidor ASGI rápido para FastAPI e Starlette"),
  pip("flask", "backend", "Microframework web simples e flexível"),
  pip("pydantic", "backend", "Validação e conversão de dados com tipos Python"),
  pip("pydantic-settings", "backend", "Configuração da aplicação lida de variáveis de ambiente e .env, com tipos", "ready", undefined, "pydantic_settings"),
  pip("python-multipart", "backend", "Upload de arquivos e formulários para FastAPI e Starlette", "ready", undefined, "multipart"),
  pip("apscheduler", "backend", "Agendamento de tarefas dentro do processo (cron e intervalos)"),
  pip("tenacity", "backend", "Retentativas com backoff para chamadas instáveis"),
  pip("click", "backend", "Criar CLIs com subcomandos e opções"),
  pip("typer", "utils", "CLIs com tipos Python, construídas sobre o Click"),
  pip("grpcio", "backend", "Cliente e servidor gRPC", "ready", undefined, "grpc"),
  pip("protobuf", "backend", "Protocol Buffers para serialização e contratos de API", "ready", undefined, "google.protobuf"),
  pip("boto3", "backend", "SDK oficial da AWS para Python (S3, DynamoDB, Lambda e mais)"),

  // Banco de dados
  pip("sqlalchemy", "database", "ORM e toolkit SQL, com suporte a praticamente todos os bancos"),
  pip("sqlmodel", "database", "ORM que combina SQLAlchemy e Pydantic, ideal com FastAPI"),
  pip("alembic", "database", "Migrações de schema para SQLAlchemy"),
  pip("peewee", "database", "ORM pequeno e simples para SQLite e PostgreSQL"),
  pip("psycopg2-binary", "database", "Driver PostgreSQL síncrono", "ready", undefined, "psycopg2"),
  pip("asyncpg", "database", "Driver PostgreSQL assíncrono, muito rápido"),
  pip("pymongo", "database", "Driver oficial do MongoDB"),
  pip("motor", "database", "Driver MongoDB assíncrono para asyncio"),
  pip("redis", "database", "Cliente Redis para cache, filas e pub/sub"),
  pip("supabase", "database", "Cliente Python oficial do Supabase"),
  pip("qdrant-client", "database", "Cliente do banco vetorial Qdrant para busca semântica", "ready", undefined, "qdrant_client"),

  // Testes e qualidade de código
  pip("pytest", "testing", "Framework de testes com fixtures e asserções simples"),
  pip("pytest-asyncio", "testing", "Testes para código assíncrono com pytest", "ready", undefined, "pytest_asyncio"),
  pip("pytest-cov", "testing", "Cobertura de código para o pytest", "ready", undefined, "pytest_cov"),
  pip("hypothesis", "testing", "Testes baseados em propriedades: gera casos e acha bugs de borda"),
  pip("faker", "testing", "Gerar dados falsos realistas (nomes, endereços, datas) para testes e seeds"),
  pip("freezegun", "testing", "Congelar o relógio nos testes para tornar datas determinísticas"),
  pip("respx", "testing", "Simular respostas HTTP nos testes do httpx"),
  pip("ruff", "testing", "Linter e formatador extremamente rápido"),
  pip("black", "testing", "Formatador de código padronizado"),
  pip("flake8", "testing", "Linter clássico de estilo e erros"),
  pip("mypy", "testing", "Checagem estática de tipos"),
  pip("bandit", "security", "Análise estática de segurança para código Python (SAST)"),
  pip("ipython", "devtools", "Shell interativo avançado"),

  // IA e linguagem natural
  pip("openai", "ai", "SDK oficial da OpenAI"),
  pip("anthropic", "ai", "SDK oficial da Anthropic"),
  pip("google-generativeai", "ai", "SDK do Gemini do Google", "ready", undefined, "google.generativeai"),
  pip("mistralai", "ai", "SDK oficial da Mistral AI"),
  pip("groq", "ai", "SDK da Groq para inferência rápida de modelos abertos"),
  pip("ollama", "ai", "Cliente para modelos rodando localmente com Ollama"),
  pip("cohere", "ai", "SDK da Cohere para geração, embeddings e busca"),
  pip("langchain", "ai", "Framework para compor chamadas de LLM, ferramentas e cadeias"),
  pip("tavily-python", "ai", "Busca na web otimizada para agentes de IA", "ready", undefined, "tavily"),
  pip("pinecone", "ai", "Cliente do banco vetorial Pinecone"),
  pip("tiktoken", "ai", "Contagem de tokens compatível com os modelos da OpenAI"),
  pip("nltk", "ai", "Processamento de linguagem natural clássico: tokenização, stemming e corpora"),
  pip("textblob", "ai", "NLP simples: sentimento, tradução e classificação de texto"),
  pip("vadersentiment", "ai", "Análise de sentimento para textos curtos e redes sociais", "ready", undefined, "vaderSentiment"),

  // Ciência
  pip("sympy", "science", "Matemática simbólica: álgebra, cálculo e equações"),
  pip("networkx", "science", "Grafos e redes: caminhos, centralidade e comunidades"),
  pip("shapely", "science", "Geometria computacional 2D: polígonos, interseções e buffers"),
  pip("pint", "science", "Unidades físicas com conversão e checagem dimensional"),
  pip("biopython", "science", "Bioinformática: sequências, estruturas e acesso a bancos biológicos", "ready", undefined, "Bio"),
  pip("pyproj", "science", "Transformação entre sistemas de coordenadas geográficas"),
  pip("geopy", "science", "Geocodificação e distâncias geográficas"),

  // Finanças e cripto
  pip("yfinance", "finance", "Cotações e dados históricos de ações e ETFs (Yahoo Finance)"),
  pip("pandas-ta", "finance", "Indicadores técnicos de análise financeira sobre DataFrames", "ready", undefined, "pandas_ta"),
  pip("ccxt", "finance", "Acesso unificado a dezenas de corretoras de cripto via API"),

  // Web3 e criptografia
  pip("web3", "web3", "Interação com contratos Ethereum e redes compatíveis com EVM"),
  pip("eth-account", "web3", "Carteiras, assinaturas e transações Ethereum offline", "ready", undefined, "eth_account"),
  pip("solana", "web3", "SDK em Python para a rede Solana"),
  pip("cryptography", "security", "Criptografia moderna e segura: AES, RSA, hashes e assinaturas"),
  pip("pyjwt", "security", "Criar e verificar tokens JWT", "ready", undefined, "jwt"),
  pip("passlib", "security", "Hash de senhas com algoritmos seguros e migração entre eles"),
  pip("bcrypt", "security", "Hash de senhas com bcrypt"),

  // Pagamentos e comunicação
  pip("stripe", "backend", "SDK oficial da Stripe para cobranças, assinaturas e webhooks"),
  pip("slack-sdk", "backend", "SDK oficial do Slack para bots e mensagens", "ready", undefined, "slack_sdk"),
  pip("pygithub", "devtools", "Cliente da API do GitHub: repositórios, issues e pull requests", "ready", undefined, "github"),
  pip("gitpython", "devtools", "Operar repositórios Git a partir do Python", "ready", undefined, "git"),

  // Utilidades
  pip("python-dateutil", "utils", "Datas, fusos horários e parsing flexível de datas", "ready", undefined, "dateutil"),
  pip("pytz", "utils", "Fusos horários da base IANA"),
  pip("arrow", "utils", "Datas e horários com API amigável"),
  pip("pendulum", "utils", "Datas e fusos horários com aritmética segura"),
  pip("humanize", "utils", "Formatar números, datas e tamanhos de forma legível (\"3 minutos atrás\")"),
  pip("phonenumbers", "utils", "Validar e formatar números de telefone do mundo inteiro"),
  pip("email-validator", "utils", "Validar endereços de e-mail, incluindo domínios", "ready", undefined, "email_validator"),
  pip("pycountry", "utils", "Países, moedas e idiomas com códigos ISO"),
  pip("babel", "utils", "Internacionalização: formatação de datas e moedas por idioma"),
  pip("rich", "utils", "Saída bonita no terminal: tabelas, cores e progresso"),
  pip("tqdm", "utils", "Barras de progresso para loops"),
  pip("orjson", "utils", "JSON muito rápido"),
  pip("joblib", "utils", "Paralelismo simples e cache de resultados em disco"),
  pip("loguru", "utils", "Logs legíveis com uma linha de configuração"),
  pip("structlog", "utils", "Logs estruturados em JSON para produção"),
  pip("python-dotenv", "utils", "Carregar variáveis de arquivos .env", "ready", undefined, "dotenv"),
  pip("qrcode", "utils", "Gerar QR codes em imagem ou SVG"),

  // Mídia
  pip("pillow", "media", "Manipulação de imagens: redimensionar, recortar, converter e desenhar", "ready", undefined, "PIL"),
  pip("opencv-python-headless", "media", "Visão computacional sem interface gráfica: detecção, filtros e vídeo", "ready", undefined, "cv2"),
  pip("imageio", "media", "Ler e escrever imagens, GIFs e vídeos"),
  pip("pydub", "media", "Manipulação de áudio: cortar, juntar e converter"),

  // Engenharia reversa: só leitura e análise de arquivos, sem exploração
  pip("pefile", "reverse-engineering", "Ler executáveis Windows (PE): seções, imports e recursos", "ready", REVERSE_NOTE),
  pip("pyelftools", "reverse-engineering", "Ler executáveis Linux (ELF) e informações DWARF", "ready", REVERSE_NOTE, "elftools"),
  pip("capstone", "reverse-engineering", "Desmontagem de código de máquina em várias arquiteturas", "ready", REVERSE_NOTE),
  pip("yara-python", "reverse-engineering", "Regras YARA para identificar padrões em arquivos (detecção defensiva)", "ready", REVERSE_NOTE, "yara"),

  // ======================= Python pesado ou com dependência do sistema (template) =======================
  pip("torch", "ml", "PyTorch, framework de deep learning", "template", "Pesado demais para instalar a cada execução; exige template próprio."),
  pip("tensorflow", "ml", "TensorFlow, framework de deep learning", "template", "Pesado demais para instalar a cada execução; exige template próprio."),
  pip("transformers", "ai", "Modelos Hugging Face para texto, visão e áudio", "template", "Depende de torch; exige template próprio."),
  pip("sentence-transformers", "ai", "Embeddings de texto para busca semântica", "template", "Depende de torch; exige template próprio."),
  pip("spacy", "ai", "NLP de produção: entidades, dependências e pipelines", "template", "Modelos grandes; exige template próprio."),
  pip("prophet", "ml", "Previsão de séries temporais com sazonalidade (Meta)", "template", "Depende do Stan (compilação); exige template próprio."),
  pip("geopandas", "science", "DataFrames geoespaciais: mapas, joins espaciais e leitura de shapefiles", "template", "Dependências nativas GDAL/GEOS; exige template próprio."),
  pip("mlflow", "ml", "Rastreamento de experimentos e registro de modelos", "template", "Pacote grande com muitas dependências; exige template próprio."),
  pip("pytesseract", "media", "OCR: reconhecer texto em imagens com Tesseract", "template", "Precisa do binário Tesseract instalado no sistema."),
  pip("selenium", "testing", "Automação de navegador real", "template", "Precisa de navegador e driver no template."),
  pip("pyghidra", "reverse-engineering", "Ghidra a partir do Python", "template", `Precisa do Ghidra instalado no template. ${REVERSE_NOTE}`),
  pip("ghidra-bridge", "reverse-engineering", "Ponte Python para o Ghidra", "template", `Precisa do Ghidra instalado no template. ${REVERSE_NOTE}`),

  // ======================= Ghidra (Java; fora do Python) =======================
  {
    id: "ghidra",
    name: "Ghidra",
    runtime: "java",
    package: "ghidra",
    category: "reverse-engineering",
    status: "template",
    description: "Framework de engenharia reversa da NSA, com decompilador e análise automática de binários",
    note: `Precisa de JDK e de um download grande; exige template próprio. ${REVERSE_NOTE}`,
  },

  // ======================= npm: Next, React e ecossistema web (reference) =======================
  // Next e React
  npm("next", "frontend", "Framework React com renderização no servidor, rotas e API integradas"),
  npm("react", "frontend", "Biblioteca para construir interfaces com componentes"),
  npm("react-dom", "frontend", "Renderização do React no navegador"),
  npm("typescript", "frontend", "Tipagem estática para JavaScript"),
  npm("tailwindcss", "frontend", "Estilos por classes utilitárias"),
  npm("framer-motion", "frontend", "Animações declarativas e gestos para React"),
  npm("gsap", "frontend", "Animações de alto desempenho para timelines complexas"),
  npm("zustand", "frontend", "Estado global simples e leve"),
  npm("jotai", "frontend", "Estado atômico para React"),
  npm("@reduxjs/toolkit", "frontend", "Redux com o padrão recomendado, para estado complexo"),
  npm("@tanstack/react-query", "frontend", "Busca, cache e sincronização de dados do servidor"),
  npm("@tanstack/react-router", "frontend", "Roteamento de React com tipos de ponta a ponta"),
  npm("swr", "frontend", "Busca de dados com cache e revalidação"),
  npm("react-hook-form", "frontend", "Formulários performáticos com validação"),
  npm("@hookform/resolvers", "frontend", "Conecta o react-hook-form a Zod, Yup e outros validadores"),
  npm("zod", "frontend", "Validação de schemas com inferência de tipos"),
  npm("recharts", "frontend", "Gráficos em React, declarativos"),
  npm("chart.js", "frontend", "Gráficos em canvas, leves e animados"),
  npm("d3", "frontend", "Visualização de dados com SVG e controle total"),
  npm("leaflet", "frontend", "Mapas interativos leves"),
  npm("lucide-react", "frontend", "Ícones em React"),
  npm("@radix-ui/react-dialog", "frontend", "Diálogos acessíveis sem estilo, base de componentes de UI"),
  npm("class-variance-authority", "frontend", "Variantes de componentes com classes tipadas"),
  npm("clsx", "frontend", "Montar strings de classes condicionais"),
  npm("tailwind-merge", "frontend", "Resolver conflitos entre classes do Tailwind"),
  npm("sonner", "frontend", "Notificações (toasts) bonitas para React"),
  npm("react-markdown", "frontend", "Renderizar Markdown como componentes React"),
  npm("@monaco-editor/react", "frontend", "Editor de código do VS Code dentro da página"),
  npm("date-fns", "frontend", "Datas com funções puras e tree-shaking"),
  npm("dayjs", "frontend", "Datas pequenas com API parecida com o Moment"),
  npm("three", "frontend", "Gráficos 3D na web com WebGL"),
  npm("@react-three/fiber", "frontend", "Three.js declarativo em React"),
  // Outros frameworks de frontend
  npm("vue", "frontend", "Framework de interfaces reativo e progressivo"),
  npm("svelte", "frontend", "Compilador de interfaces sem runtime pesado"),
  npm("@sveltejs/kit", "frontend", "Framework full-stack para Svelte"),
  npm("nuxt", "frontend", "Framework full-stack para Vue"),
  npm("astro", "frontend", "Sites rápidos com ilhas de interatividade"),
  npm("@remix-run/react", "frontend", "Framework full-stack para React com foco em formulários e carregamento"),
  // Backend e dados (Node)
  npm("express", "backend", "Servidor HTTP minimalista e o mais conhecido do Node"),
  npm("fastify", "backend", "Servidor HTTP rápido com validação de schema"),
  npm("hono", "backend", "Servidor leve para edge, Workers e serverless"),
  npm("socket.io", "backend", "Comunicação em tempo real com fallback e salas"),
  npm("graphql", "backend", "Implementação de referência do GraphQL"),
  npm("@trpc/server", "backend", "APIs tipadas de ponta a ponta sem gerar código"),
  npm("@apollo/client", "backend", "Cliente GraphQL com cache normalizado"),
  npm("bullmq", "backend", "Filas de tarefas com Redis"),
  npm("nodemailer", "backend", "Envio de e-mails por SMTP"),
  npm("resend", "backend", "SDK da Resend para envio de e-mails transacionais"),
  npm("stripe", "backend", "SDK oficial da Stripe para Node", "stripe", "npm:stripe"),
  npm("next-auth", "backend", "Autenticação para Next.js com provedores OAuth"),
  npm("axios", "web", "Cliente HTTP com interceptadores"),
  npm("ioredis", "database", "Cliente Redis para Node"),
  npm("prisma", "database", "ORM com migrações e tipos gerados"),
  npm("drizzle-orm", "database", "ORM SQL tipado e leve"),
  npm("knex", "database", "Construtor de queries SQL com migrações"),
  npm("pg", "database", "Driver PostgreSQL para Node"),
  npm("mysql2", "database", "Driver MySQL para Node"),
  npm("mongoose", "database", "ODM para MongoDB com schemas"),
  npm("@supabase/supabase-js", "database", "Cliente oficial do Supabase"),
  // IA
  npm("openai", "ai", "SDK oficial da OpenAI para Node e navegador", "openai", "npm:openai"),
  npm("@anthropic-ai/sdk", "ai", "SDK oficial da Anthropic para Node"),
  npm("@google/generative-ai", "ai", "SDK do Gemini do Google"),
  npm("groq-sdk", "ai", "SDK da Groq para inferência rápida"),
  npm("ai", "ai", "SDK da Vercel para streaming de chat e agentes com vários modelos"),
  // Testes e automação
  npm("vitest", "testing", "Testes unitários rápidos com a API do Jest"),
  npm("playwright", "testing", "Testes e automação de navegadores reais"),
  npm("puppeteer", "testing", "Automação do Chrome via protocolo DevTools"),
  // Web3
  npm("ethers", "web3", "Biblioteca Ethereum consolidada"),
  npm("viem", "web3", "Biblioteca Ethereum tipada e leve"),
  npm("wagmi", "web3", "Hooks React para carteiras e contratos"),
  npm("@solana/web3.js", "web3", "SDK oficial da Solana para JavaScript"),
  // Mídia
  npm("sharp", "media", "Redimensionar e converter imagens com libvips"),

  // ======================= Go (reference) =======================
  // Backend e HTTP
  go("github.com/gin-gonic/gin", "backend", "Framework HTTP rápido, com middlewares e roteamento"),
  go("github.com/gofiber/fiber/v2", "backend", "Framework HTTP inspirado no Express, baseado em fasthttp"),
  go("github.com/go-chi/chi/v5", "backend", "Roteador HTTP idiomático e componível"),
  go("github.com/gorilla/mux", "backend", "Roteador HTTP clássico"),
  go("github.com/labstack/echo/v4", "backend", "Framework HTTP minimalista com boa performance"),
  go("github.com/gorilla/websocket", "backend", "WebSocket para Go"),
  go("github.com/rs/cors", "backend", "Middleware de CORS"),
  go("github.com/golang-jwt/jwt/v5", "backend", "Criar e verificar tokens JWT"),
  go("github.com/casbin/casbin/v2", "security", "Controle de acesso (RBAC e ABAC) com políticas"),
  go("google.golang.org/grpc", "backend", "RPC de alto desempenho"),
  go("google.golang.org/protobuf", "backend", "Protocol Buffers para Go"),
  go("github.com/swaggo/swag", "backend", "Gerar documentação OpenAPI a partir de comentários"),
  go("github.com/prometheus/client_golang", "backend", "Métricas no formato Prometheus"),
  go("go.opentelemetry.io/otel", "backend", "Traces, métricas e logs padronizados (OpenTelemetry)"),
  go("github.com/aws/aws-sdk-go-v2", "backend", "SDK oficial da AWS para Go"),
  go("github.com/stripe/stripe-go/v79", "backend", "SDK oficial da Stripe para Go"),
  // Mensageria e jobs
  go("github.com/nats-io/nats.go", "backend", "Mensageria leve com NATS"),
  go("github.com/segmentio/kafka-go", "backend", "Cliente Kafka puro Go"),
  go("github.com/rabbitmq/amqp091-go", "backend", "Cliente RabbitMQ (AMQP 0-9-1)"),
  go("github.com/hibiken/asynq", "backend", "Filas de tarefas em Go com Redis"),
  go("github.com/robfig/cron/v3", "backend", "Agendamento de tarefas com sintaxe cron"),
  // Banco de dados
  go("gorm.io/gorm", "database", "ORM para Go com migrações e associações"),
  go("github.com/jackc/pgx/v5", "database", "Driver PostgreSQL de alta performance"),
  go("github.com/go-sql-driver/mysql", "database", "Driver MySQL"),
  go("go.mongodb.org/mongo-driver", "database", "Driver oficial do MongoDB"),
  go("github.com/redis/go-redis/v9", "database", "Cliente Redis"),
  go("github.com/golang-migrate/migrate/v4", "database", "Migrações de banco em Go, em muitos bancos"),
  go("github.com/pressly/goose/v3", "database", "Migrações de banco com arquivos SQL ou Go"),
  // Utilidades e CLI
  go("github.com/spf13/cobra", "utils", "CLIs com subcomandos, como o kubectl"),
  go("github.com/spf13/viper", "utils", "Configuração por arquivo, variáveis e flags"),
  go("github.com/mitchellh/mapstructure", "utils", "Converter mapas em structs"),
  go("go.uber.org/zap", "utils", "Logs estruturados e rápidos"),
  go("github.com/rs/zerolog", "utils", "Logs JSON sem alocações"),
  go("github.com/sirupsen/logrus", "utils", "Logs estruturados clássicos"),
  go("github.com/google/uuid", "utils", "Gerar UUIDs"),
  go("github.com/joho/godotenv", "utils", "Carregar arquivos .env"),
  go("github.com/go-playground/validator/v10", "utils", "Validação de structs por tags"),
  go("github.com/tidwall/gjson", "utils", "Ler campos de JSON sem decodificar tudo"),
  go("github.com/go-resty/resty/v2", "web", "Cliente HTTP com retentativas e JSON automático"),
  go("github.com/cenkalti/backoff/v4", "utils", "Retentativas com backoff exponencial"),
  // Testes e web
  go("github.com/stretchr/testify", "testing", "Asserções e mocks para testes"),
  go("github.com/gocolly/colly/v2", "web", "Coleta de dados da web em Go"),
  // Web3
  go("github.com/ethereum/go-ethereum", "web3", "Cliente Ethereum (geth) e bibliotecas para contratos"),
  // Ghidra não é Go: fica no bloco próprio acima.
  // ======================= Vindas do REA (morluto/rea, MIT) =======================
  // Bibliotecas Python (instaláveis: só as sem risco de uso ofensivo)
  { ...pip("markdownify", "office", "Converter HTML em Markdown"), source: REA_SOURCE },
  { ...pip("polib", "office", "Ler e escrever catálogos de tradução gettext (.po e .pot)"), source: REA_SOURCE },
  { ...pip("cairosvg", "media", "Converter SVG em PNG e PDF", "template", "Precisa da biblioteca Cairo instalada no sistema; exige template próprio.") , source: REA_SOURCE },

  // Engenharia reversa em Python: template, com restrição de uso
  { ...pip("pwntools", "reverse-engineering", "Biblioteca para análise e desenvolvimento de exploits em binários (ELF, conexões, shellcode)", "template", EXPLOIT_NOTE), source: REA_SOURCE },
  { ...pip("unicorn", "reverse-engineering", "Emulação de instruções de CPU, para analisar código sem executá-lo no sistema", "template", `Licença GPL-2.0. ${REVERSE_NOTE}`), source: REA_SOURCE },
  { ...pip("binwalk", "reverse-engineering", "Análise e extração de firmware e arquivos embarcados", "template", REVERSE_NOTE), source: REA_SOURCE },
  { ...pip("unblob", "reverse-engineering", "Extração recursiva de firmware e de arquivos aninhados", "template", REVERSE_NOTE), source: REA_SOURCE },
  { ...pip("mitmproxy", "reverse-engineering", "Proxy para inspecionar tráfego HTTP e HTTPS", "template", "Intercepta comunicação: use só no próprio tráfego ou com autorização. Não use em terceiros."), source: REA_SOURCE },

  // Ferramentas externas (binários e apps, fora da allowlist)
  tool("JADX", "reverse-engineering", "Decompilador de Android (APK e DEX) para código Java legível", `Apache-2.0; precisa do JAR do JADX instalado. ${REVERSE_NOTE}`, REA_SOURCE),
  tool("Apktool", "reverse-engineering", "Decodificar recursos e manifest de APKs Android", `Apache-2.0; ferramenta Java instalada à parte. ${REVERSE_NOTE}`, REA_SOURCE),
  tool("WABT", "reverse-engineering", "Ferramentas WebAssembly: wat2wasm, wasm2wat e afins", "Apache-2.0; binários à parte.", REA_SOURCE),
  tool("GDB", "reverse-engineering", "Depurador GNU para inspecionar programas em execução", `GPL-3.0-or-later; depurador instalado pelo usuário. ${REVERSE_NOTE}`, REA_SOURCE),
  tool("LLDB", "reverse-engineering", "Depurador do projeto LLVM", `Apache-2.0 com exceções LLVM; instalado pelo usuário. ${REVERSE_NOTE}`, REA_SOURCE),
  tool("pwndbg", "reverse-engineering", "Extensão do GDB para análise de binários e core dumps", `MIT; extensão para o GDB. ${REVERSE_NOTE}`, REA_SOURCE),
  tool("adb", "reverse-engineering", "Android Debug Bridge, para falar com dispositivos Android seus", "Apache-2.0; sujeito aos termos do Android SDK quando instalado com ele.", REA_SOURCE),
  tool("ILSpy", "reverse-engineering", "Decompilador de .NET (ICSharpCode.Decompiler)", `MIT; instalado à parte. ${REVERSE_NOTE}`, REA_SOURCE),

  // npm: bibliotecas de runtime e de dev que o REA usa (referência para projetos gerados)
  { ...npm("@modelcontextprotocol/server", "backend", "Servidor MCP oficial, para expor ferramentas a agentes de IA"), source: REA_SOURCE },
  { ...npm("@modelcontextprotocol/client", "backend", "Cliente MCP oficial, para conectar a servidores de ferramentas"), source: REA_SOURCE },
  { ...npm("isomorphic-git", "devtools", "Git em JavaScript puro, para navegador e Node"), source: REA_SOURCE },
  { ...npm("openpgp", "security", "Criptografia e assinaturas OpenPGP em JavaScript"), source: REA_SOURCE },
  { ...npm("pino", "utils", "Logs JSON de alto desempenho para Node"), source: REA_SOURCE },
  { ...npm("ajv", "utils", "Validação de JSON Schema muito rápida"), source: REA_SOURCE },
  { ...npm("ajv-formats", "utils", "Formatos extras (e-mail, URI, data) para o Ajv"), source: REA_SOURCE },
  { ...npm("ws", "backend", "WebSocket para Node"), source: REA_SOURCE },
  { ...npm("yaml", "utils", "Ler e escrever YAML em JavaScript"), source: REA_SOURCE },
  { ...npm("semver", "utils", "Comparar e validar versões semânticas"), source: REA_SOURCE },
  { ...npm("@msgpack/msgpack", "utils", "Serialização binária compacta MessagePack"), source: REA_SOURCE },
  { ...npm("cborg", "utils", "Serialização binária CBOR"), source: REA_SOURCE },
  { ...npm("@xterm/headless", "devtools", "Terminal virtual sem interface, para testes e servidores"), source: REA_SOURCE },
  { ...npm("@lydell/node-pty", "devtools", "Pseudo-terminal para rodar processos interativos no Node"), source: REA_SOURCE },
  { ...npm("@zip.js/zip.js", "utils", "Ler e criar arquivos ZIP no navegador e no Node"), source: REA_SOURCE },
  { ...npm("evmole", "web3", "Análise de bytecode EVM: detecta funções e seletores de contratos"), source: REA_SOURCE },
  { ...npm("parse5", "web", "Parser de HTML conforme o padrão WHATWG"), source: REA_SOURCE },
  { ...npm("@bufbuild/protobuf", "backend", "Protocol Buffers para TypeScript"), source: REA_SOURCE },
  { ...npm("@babel/parser", "devtools", "Parser de JavaScript e TypeScript que gera AST"), source: REA_SOURCE },
  { ...npm("@babel/types", "devtools", "Tipos e construtores para ASTs do Babel"), source: REA_SOURCE },
  { ...npm("smol-toml", "utils", "Ler e escrever TOML"), source: REA_SOURCE },
  { ...npm("stream-json", "utils", "Processar JSON grande em streaming, sem carregar tudo na memória"), source: REA_SOURCE },
  { ...npm("jsonc-parser", "utils", "Ler JSON com comentários (JSONC)"), source: REA_SOURCE },
  { ...npm("canonicalize", "utils", "JSON canônico (RFC 8785), para assinaturas e hashes estáveis"), source: REA_SOURCE },
  { ...npm("diff", "utils", "Diferenças entre textos: linhas, palavras e caracteres"), source: REA_SOURCE },
  { ...npm("@electron/asar", "devtools", "Empacotar e ler arquivos .asar do Electron"), source: REA_SOURCE },
  { ...npm("@clack/prompts", "devtools", "Prompts bonitos de terminal para CLIs"), source: REA_SOURCE },
  { ...npm("cross-spawn", "utils", "Executar processos de forma consistente no Windows e no Unix"), source: REA_SOURCE },
  { ...npm("ignore", "utils", "Regras de .gitignore em JavaScript"), source: REA_SOURCE },
  { ...npm("tokenx", "ai", "Contagem aproximada de tokens de LLM, sem depender do tokenizer do modelo"), source: REA_SOURCE },
  { ...npm("lossless-json", "utils", "JSON que preserva números grandes sem perder precisão"), source: REA_SOURCE },
  // Ferramentas de desenvolvimento e teste do REA
  { ...npm("@stryker-mutator/core", "testing", "Teste de mutação: mede se os testes pegam bugs de verdade"), source: REA_SOURCE },
  { ...npm("@fast-check/vitest", "testing", "Testes com propriedades (fast-check) integrados ao Vitest"), source: REA_SOURCE },
  { ...npm("knip", "devtools", "Encontra arquivos, exports e dependências sem uso"), source: REA_SOURCE },
  { ...npm("oxlint", "devtools", "Linter muito rápido escrito em Rust"), source: REA_SOURCE },
  { ...npm("turbo", "devtools", "Orquestra builds e tarefas em monorepos, com cache"), source: REA_SOURCE },
  { ...npm("tsx", "devtools", "Executa TypeScript direto no Node"), source: REA_SOURCE },
  { ...npm("vitepress", "devtools", "Documentação estática rápida sobre Vite"), source: REA_SOURCE },
  { ...npm("jscpd", "devtools", "Detecta código duplicado no projeto"), source: REA_SOURCE },
  { ...npm("husky", "devtools", "Git hooks versionados no projeto"), source: REA_SOURCE },

];

/** Allowlist de `pip install` da sandbox Python: só bibliotecas pip com status "ready". */
export const PYTHON_PACKAGES: string[] = VIBE_LIBRARIES.filter((l) => l.runtime === "pip" && l.status === "ready").map(
  (l) => l.package,
);

export function findLibrary(id: string): VibeLibrary | undefined {
  const key = id.toLowerCase().trim();
  return VIBE_LIBRARIES.find((l) => l.id.toLowerCase() === key);
}

export function librariesByStatus(status: LibraryStatus): VibeLibrary[] {
  return VIBE_LIBRARIES.filter((l) => l.status === status);
}

/** Nome para `import` no Python de um pacote da allowlist (ex.: "beautifulsoup4" -> "bs4"). */
export function pythonImportName(pkg: string): string | undefined {
  const lib = findLibrary(pkg);
  if (!lib || lib.runtime !== "pip") return undefined;
  return lib.importName ?? lib.package.replace(/-/g, "_");
}

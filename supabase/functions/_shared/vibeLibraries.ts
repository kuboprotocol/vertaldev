// Catálogo de bibliotecas do Vibe Dev: a fonte única da verdade para o que a
// plataforma conhece, em Python, npm (Next e o ecossistema React), Go e engenharia
// reversa (Ghidra). Lógica pura, sem Deno nem browser: usada pela função
// `vibe-agents` e pelo front-end (via src/config/vibeLibraries.ts).
//
// Cada entrada tem um `status` que diz exatamente o que a plataforma faz com ela hoje:
//  - "ready"     : instalável na sandbox Python agora (entra na allowlist de pip).
//  - "reference" : conhecida pela plataforma para projetos gerados (npm/Go); a sandbox
//                  Python não a instala. Não é executada pelo agente ainda.
//  - "template"  : exige um template de sandbox próprio (pesado demais para o limite
//                  de 60 s por execução, ou runtime fora do Python, como o Ghidra).
//
// Os nomes foram verificados nos registros oficiais (PyPI, npm e proxy.golang.org).

export type LibraryRuntime = "pip" | "npm" | "go" | "java";
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
  | "reverse-engineering";

export interface VibeLibrary {
  /** Identificador estável (slug). */
  id: string;
  /** Nome para exibição. */
  name: string;
  runtime: LibraryRuntime;
  /** Como instalar: pacote pip, pacote npm, módulo Go (com /vN) ou nome da ferramenta. */
  package: string;
  category: LibraryCategory;
  status: LibraryStatus;
  /** Uma linha, em português. */
  description: string;
  /** Restrição de uso, quando houver. */
  note?: string;
}

const pip = (
  package_: string,
  category: LibraryCategory,
  description: string,
  status: LibraryStatus = "ready",
  note?: string,
): VibeLibrary => ({ id: package_, name: package_, runtime: "pip", package: package_, category, status, description, note });

const npm = (
  package_: string,
  category: LibraryCategory,
  description: string,
  name = package_,
): VibeLibrary => ({ id: package_, name, runtime: "npm", package: package_, category, status: "reference", description });

const go = (module: string, category: LibraryCategory, description: string): VibeLibrary => {
  const name = module.split("/").slice(-1)[0].replace(/^v\d+$/, module.split("/").slice(-2)[0]);
  return { id: module, name, runtime: "go", package: module, category, status: "reference", description };
};

const REVERSE_NOTE =
  "Análise de binários só em arquivos seus ou com autorização (CTF, pesquisa, análise defensiva). A plataforma não faz exploração automática.";

export const VIBE_LIBRARIES: VibeLibrary[] = [
  // --- Python: instaláveis na sandbox (status "ready") ---
  // Dados
  pip("pandas", "data", "Tabelas e análise de dados"),
  pip("numpy", "data", "Arrays e álgebra numérica"),
  pip("scipy", "data", "Estatística, otimização e álgebra linear"),
  pip("polars", "data", "DataFrames rápidos, escritos em Rust"),
  pip("pyarrow", "data", "Formato colunar Arrow e Parquet"),
  pip("duckdb", "data", "Banco analítico SQL embutido"),
  // Machine learning e estatística
  pip("scikit-learn", "ml", "Modelos clássicos de machine learning"),
  pip("statsmodels", "ml", "Modelos estatísticos e séries temporais"),
  pip("xgboost", "ml", "Gradient boosting de alta performance"),
  pip("lightgbm", "ml", "Gradient boosting leve da Microsoft"),
  // Visualização
  pip("matplotlib", "viz", "Gráficos estáticos"),
  pip("seaborn", "viz", "Gráficos estatísticos sobre o Matplotlib"),
  pip("plotly", "viz", "Gráficos interativos"),
  pip("altair", "viz", "Gráficos declarativos"),
  pip("bokeh", "viz", "Gráficos interativos para web"),
  // Documentos e escritórios
  pip("openpyxl", "office", "Ler e escrever planilhas .xlsx"),
  pip("xlsxwriter", "office", "Criar planilhas .xlsx com formatação"),
  pip("python-docx", "office", "Ler e escrever documentos .docx"),
  pip("python-pptx", "office", "Criar apresentações .pptx"),
  pip("pypdf", "office", "Ler, dividir e juntar PDFs"),
  pip("reportlab", "office", "Gerar PDFs do zero"),
  pip("pyyaml", "office", "Ler e escrever YAML"),
  pip("tabulate", "office", "Tabelas em texto e Markdown"),
  pip("markdown", "office", "Converter Markdown em HTML"),
  // Web e HTTP
  pip("requests", "web", "Cliente HTTP síncrono"),
  pip("httpx", "web", "Cliente HTTP síncrono e assíncrono"),
  pip("aiohttp", "web", "Cliente e servidor HTTP assíncronos"),
  pip("beautifulsoup4", "web", "Extrair dados de HTML"),
  pip("lxml", "web", "Parser rápido de HTML e XML"),
  pip("feedparser", "web", "Ler feeds RSS e Atom"),
  // Backend
  pip("fastapi", "backend", "API web moderna em Python"),
  pip("uvicorn", "backend", "Servidor ASGI"),
  pip("flask", "backend", "Microframework web"),
  pip("pydantic", "backend", "Validação de dados com tipos"),
  // Banco de dados
  pip("sqlalchemy", "database", "ORM e SQL toolkit"),
  pip("psycopg2-binary", "database", "Driver PostgreSQL"),
  pip("asyncpg", "database", "Driver PostgreSQL assíncrono"),
  pip("pymongo", "database", "Driver MongoDB"),
  pip("redis", "database", "Cliente Redis"),
  pip("supabase", "database", "Cliente Python do Supabase"),
  // Testes e qualidade
  pip("pytest", "testing", "Framework de testes"),
  pip("hypothesis", "testing", "Testes baseados em propriedades"),
  pip("ruff", "testing", "Linter e formatador rápido"),
  pip("mypy", "testing", "Checagem estática de tipos"),
  // IA e linguagem natural
  pip("openai", "ai", "SDK oficial da OpenAI"),
  pip("anthropic", "ai", "SDK oficial da Anthropic"),
  pip("tiktoken", "ai", "Contagem de tokens"),
  pip("nltk", "ai", "Processamento de linguagem natural clássico"),
  // Ciência
  pip("sympy", "science", "Matemática simbólica"),
  pip("networkx", "science", "Grafos e redes"),
  pip("shapely", "science", "Geometria computacional 2D"),
  // Web3 e criptografia
  pip("web3", "web3", "Interação com contratos Ethereum e EVM"),
  pip("eth-account", "web3", "Carteiras e assinaturas Ethereum"),
  pip("cryptography", "web3", "Criptografia moderna e segura"),
  // Utilidades
  pip("python-dateutil", "utils", "Datas e fusos horários"),
  pip("pytz", "utils", "Fusos horários"),
  pip("rich", "utils", "Saída formatada no terminal"),
  pip("typer", "utils", "CLIs com tipos"),
  pip("tqdm", "utils", "Barras de progresso"),
  pip("orjson", "utils", "JSON muito rápido"),
  pip("joblib", "utils", "Paralelismo e cache em disco"),
  // Mídia
  pip("pillow", "media", "Manipulação de imagens"),
  pip("opencv-python-headless", "media", "Visão computacional sem interface gráfica"),
  pip("imageio", "media", "Ler e escrever imagens e vídeos"),
  pip("pydub", "media", "Manipulação de áudio"),
  // Engenharia reversa (só leitura de arquivos; sem exploração)
  pip("pefile", "reverse-engineering", "Ler executáveis Windows (PE)", "ready", REVERSE_NOTE),
  pip("pyelftools", "reverse-engineering", "Ler executáveis Linux (ELF) e DWARF", "ready", REVERSE_NOTE),
  pip("capstone", "reverse-engineering", "Desmontagem de código de máquina", "ready", REVERSE_NOTE),
  pip("yara-python", "reverse-engineering", "Regras YARA para detectar padrões em arquivos", "ready", REVERSE_NOTE),

  // --- Python pesado ou dependente de template próprio (status "template") ---
  pip("torch", "ml", "PyTorch", "template", "Pesado demais para instalar a cada execução; exige template próprio."),
  pip("tensorflow", "ml", "TensorFlow", "template", "Pesado demais para instalar a cada execução; exige template próprio."),
  pip("transformers", "ai", "Modelos Hugging Face", "template", "Depende de torch; exige template próprio."),
  pip("spacy", "ai", "NLP de produção", "template", "Modelos grandes; exige template próprio."),
  pip("sentence-transformers", "ai", "Embeddings de texto", "template", "Depende de torch; exige template próprio."),
  pip("pyghidra", "reverse-engineering", "Ghidra a partir do Python", "template", `Precisa do Ghidra instalado no template. ${REVERSE_NOTE}`),
  pip("ghidra-bridge", "reverse-engineering", "Ponte Python para o Ghidra", "template", `Precisa do Ghidra instalado no template. ${REVERSE_NOTE}`),

  // --- Ghidra (Java; fora do Python) ---
  {
    id: "ghidra",
    name: "Ghidra",
    runtime: "java",
    package: "ghidra",
    category: "reverse-engineering",
    status: "template",
    description: "Framework de engenharia reversa da NSA, com decompilador e análise automática",
    note: `Precisa de JDK e de um download grande; exige template próprio. ${REVERSE_NOTE}`,
  },

  // --- npm: Next e o ecossistema React (status "reference") ---
  npm("next", "frontend", "Framework React com SSR, rotas e API"),
  npm("react", "frontend", "Biblioteca de interfaces"),
  npm("react-dom", "frontend", "Renderização do React no navegador"),
  npm("typescript", "frontend", "Tipagem estática para JavaScript"),
  npm("tailwindcss", "frontend", "Estilos utilitários"),
  npm("framer-motion", "frontend", "Animações declarativas"),
  npm("zustand", "frontend", "Estado global simples"),
  npm("@tanstack/react-query", "frontend", "Dados do servidor com cache"),
  npm("react-hook-form", "frontend", "Formulários performáticos"),
  npm("zod", "frontend", "Validação de schemas com tipos"),
  npm("recharts", "frontend", "Gráficos em React"),
  npm("chart.js", "frontend", "Gráficos em canvas"),
  npm("d3", "frontend", "Visualização de dados com SVG"),
  npm("lucide-react", "frontend", "Ícones em React"),
  npm("date-fns", "frontend", "Datas sem mutação"),
  npm("three", "frontend", "Gráficos 3D na web"),
  npm("@react-three/fiber", "frontend", "Three.js declarativo em React"),
  // Backend e dados (Node)
  npm("express", "backend", "Servidor HTTP minimalista"),
  npm("fastify", "backend", "Servidor HTTP rápido"),
  npm("hono", "backend", "Servidor leve para edge e serverless"),
  npm("socket.io", "backend", "Comunicação em tempo real"),
  npm("prisma", "database", "ORM com migrações"),
  npm("drizzle-orm", "database", "ORM SQL tipado"),
  npm("@supabase/supabase-js", "database", "Cliente oficial do Supabase"),
  npm("axios", "web", "Cliente HTTP"),
  // Testes, web3 e mídia
  npm("vitest", "testing", "Testes unitários com Vite"),
  npm("playwright", "testing", "Testes e automação de navegador"),
  npm("ethers", "web3", "Biblioteca Ethereum"),
  npm("viem", "web3", "Biblioteca Ethereum tipada"),
  npm("wagmi", "web3", "Hooks React para carteiras e contratos"),
  npm("@solana/web3.js", "web3", "SDK da Solana"),
  npm("sharp", "media", "Redimensionar e converter imagens"),

  // --- Go (status "reference") ---
  go("github.com/gin-gonic/gin", "backend", "Framework HTTP rápido"),
  go("github.com/gofiber/fiber/v2", "backend", "Framework HTTP inspirado no Express"),
  go("github.com/go-chi/chi/v5", "backend", "Roteador HTTP idiomático"),
  go("github.com/gorilla/mux", "backend", "Roteador HTTP clássico"),
  go("github.com/labstack/echo/v4", "backend", "Framework HTTP minimalista"),
  go("gorm.io/gorm", "database", "ORM para Go"),
  go("github.com/jackc/pgx/v5", "database", "Driver PostgreSQL de alta performance"),
  go("github.com/redis/go-redis/v9", "database", "Cliente Redis"),
  go("github.com/spf13/cobra", "utils", "CLIs com subcomandos"),
  go("github.com/spf13/viper", "utils", "Configuração por arquivo e variáveis"),
  go("go.uber.org/zap", "utils", "Logs estruturados e rápidos"),
  go("github.com/sirupsen/logrus", "utils", "Logs estruturados"),
  go("github.com/google/uuid", "utils", "Gerador de UUID"),
  go("github.com/joho/godotenv", "utils", "Carregar arquivos .env"),
  go("github.com/go-playground/validator/v10", "utils", "Validação de structs"),
  go("github.com/golang-jwt/jwt/v5", "backend", "Tokens JWT"),
  go("github.com/stretchr/testify", "testing", "Asserções e mocks para testes"),
  go("google.golang.org/grpc", "backend", "RPC de alto desempenho"),
  go("google.golang.org/protobuf", "backend", "Protocol Buffers"),
  go("github.com/prometheus/client_golang", "backend", "Métricas no formato Prometheus"),
  go("github.com/gocolly/colly/v2", "web", "Coleta de dados da web"),
  go("github.com/ethereum/go-ethereum", "web3", "Cliente Ethereum (geth)"),
  go("github.com/aws/aws-sdk-go-v2", "backend", "SDK da AWS"),
  go("github.com/nats-io/nats.go", "backend", "Mensageria com NATS"),
];

/** Allowlist de `pip install` da sandbox Python: só bibliotecas com status "ready". */
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

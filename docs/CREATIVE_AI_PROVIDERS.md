# Creative Panel - Provedores de IA

Documentação centralizada dos provedores de IA utilizados no painel criativo da KUBO Vibe.

## Arquitetura de Provedores

```
KUBO Vibe Creative Panel
├── Text Generation
│   ├── Claude (via OpenRouter)
│   ├── Llama (via OpenRouter)
│   └── DeepSeek (via API direta)
├── Image Generation
│   ├── DALL-E 3 (via OpenRouter)
│   └── Stable Diffusion (via API)
├── Music Generation
│   ├── Llama 2 70B + Music APIs (via OpenRouter)
│   └── Suno (para geração de áudio)
├── Code Generation
│   └── Claude / Llama (via OpenRouter)
└── Video Generation
    └── Suno / Remotion
```

## Provedores Ativos

### 1. **OpenRouter** (Primary LLM Gateway)

**Responsabilidade**: Chat, geração de código, slides, processamento de texto

**Modelos Disponíveis**:
- Claude (Claude 3 Opus, Sonnet, Haiku)
- Llama (Llama 2 70B, Llama 3 70B)
- Mixtral 8x7B
- DeepSeek v2
- GPT-3.5 Turbo, GPT-4

**Integração**:
```typescript
// supabase/functions/_shared/openrouterService.ts
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const API_URL = "https://openrouter.io/api/v1/chat/completions";
```

**Modelos Recomendados por Caso de Uso**:
| Caso | Modelo | Razão |
|------|--------|-------|
| Chat Rápido | Claude 3 Haiku | Baixa latência, custos reduzidos |
| Geração de Código | Claude 3 Sonnet | Excelente qualidade de código |
| Análise Complexa | Claude 3 Opus | Melhor reasoning |
| Geração de Slides | Llama 3 70B | Custo-benefício |
| Geração de Música | Llama 2 70B | Integração existente com Music APIs |

**Custos (aprox.)**:
- Claude 3 Haiku: $0.15 / 1M input tokens
- Claude 3 Sonnet: $3.00 / 1M input tokens
- Claude 3 Opus: $15.00 / 1M input tokens
- Llama 3 70B: $0.70 / 1M input tokens

---

### 2. **OpenAI** (Fallback & Audio)

**Responsabilidade**: Geração de imagens, transcrição de áudio (Whisper)

**Modelos**:
- DALL-E 3 (texto → imagem)
- Whisper Large v3 (áudio → texto)

**Integração**:
```typescript
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
```

**Casos de Uso**:
- Imagens de alta qualidade (quando Stable Diffusion não suficiente)
- Transcrição de áudio em português (Whisper)

---

### 3. **Suno AI** (Música)

**Responsabilidade**: Geração de áudio completo (música, voz, efeitos)

**Modelos**:
- Chirp v3 (geração de áudio com lirics)
- Chirp v2.5

**Status**: ✅ Ativo (configurado em `src/config/musicPricing.ts`)

**Integração**:
```typescript
// supabase/functions/api-health-check/index.ts
const SUNO_API_KEY = Deno.env.get("SUNO_API_KEY");
```

---

### 4. **DeepSeek** (SaaS Generator)

**Responsabilidade**: Geração de aplicativos SaaS, arquitetura de sistemas

**Modelos**:
- DeepSeek v2 (via API direta)
- DeepSeek via OpenRouter

**Status**: ✅ Ativo (verificado em `ApiStatusPanel`)

---

## Removido: Groq

**Status**: ❌ Descontinuado

**Razão**: Duplicação com OpenRouter
- Groq oferecia: Chat ultra-rápido + Whisper (transcrição)
- OpenRouter oferece: Mesmos modelos (Llama, Mixtral) com melhor estabilidade
- Whisper está disponível via OpenAI quando necessário

**Migração**:
```typescript
// Antes (Groq)
POST /functions/v1/creative-groq
- Chat: llama-3.3-70b-versatile
- Transcribe: whisper-large-v3

// Depois (OpenRouter + OpenAI)
POST /functions/v1/openrouter      // Chat com qualquer modelo
POST /functions/v1/transcribe       // Whisper via OpenAI
```

---

## Fluxo de Requisições

```
User Request (Creative Panel)
    ↓
[Determinar tipo de IA necessária]
    ↓
    ├─→ Chat/Código/Slides → OpenRouter
    ├─→ Imagem → OpenRouter ou DALL-E 3
    ├─→ Música → Suno AI
    ├─→ Transcrição → OpenAI Whisper
    └─→ SaaS → DeepSeek
    ↓
[Deduzir créditos do usuário]
    ↓
[Registrar em auditoria]
    ↓
Response ao usuário
```

---

## Configuração de Créditos

| Função | Custo (Créditos) | Custo (R$) | Custo Real |
|--------|-----------------|-----------|-----------|
| Chat via OpenRouter | 1 | R$0.40 | ~$0.001-0.005 |
| Geração de Imagem | 5 | R$2.00 | ~$0.01-0.05 |
| Geração de Música | 3 | R$1.20 | ~$0.005 |
| Transcrição de Áudio | 2 | R$0.80 | ~$0.003 |
| Geração de SaaS | 10 | R$4.00 | ~$0.02-0.1 |

**Margin de Lucro**: 95%+ por serviço

---

## Health Check

Todos os provedores são monitorados em tempo real via:

```typescript
// src/components/creative/ApiStatusPanel.tsx
PROVIDERS = [
  { key: "openrouter", label: "OpenRouter", purpose: "Chat, código, slides" },
  { key: "deepseek", label: "DeepSeek", purpose: "Geração de SaaS" },
  { key: "suno", label: "Suno", purpose: "Geração de música" },
  { key: "moonshot", label: "Moonshot", purpose: "Kimi (fallback)" },
];
```

Acesso: `Creative Panel` → canto superior direito → "Status das APIs"

---

## Environment Variables Necessárias

```bash
# .env.local
VITE_OPENROUTER_API_KEY=sk-or-...
OPENAI_API_KEY=sk-...
SUNO_API_KEY=...
DEEPSEEK_API_KEY=...
MOONSHOT_API_KEY=...
```

---

## Migration Path (Groq → OpenRouter)

### Step 1: Remover referências ao Groq
```bash
rm supabase/functions/creative-groq/index.ts
rm supabase/functions/ping-groq/index.ts
git rm supabase/functions/creative-groq/
git rm supabase/functions/ping-groq/
```

### Step 2: Atualizar ApiStatusPanel
```typescript
// Remover "groq" da lista PROVIDERS
// Manter apenas: openrouter, deepseek, suno, moonshot
```

### Step 3: Verificar integração
```bash
npm test -- src/components/creative/ApiStatusPanel.tsx
```

### Step 4: Deploy
```bash
git commit -m "feat: remove Groq, consolidate to OpenRouter"
git push origin claude/kubo-vibe-dev-continue-vw754h
```

---

## Music Generator - Documentação Completa

Ver: `src/config/musicPricing.ts`, `src/services/musicGeneratorService.ts`

### Arquitetura

```
Music Generator (Phase 4)
├── Service Layer
│   └── musicGeneratorService.ts
│       ├── generateMusic(prompt, genre, mood)
│       ├── generateMusicInfo(prompt, genre, style, mood)
│       ├── generateLyrics(prompt, genre, style, mood)
│       ├── exportAsJSON()
│       ├── exportAsHTML()
│       └── createPlaylistM3U()
├── State Management
│   └── useMusicGenerator.ts
│       ├── galleries state
│       ├── currentGallery
│       ├── isGenerating
│       ├── error
│       └── CRUD operations
├── Configuration
│   └── musicPricing.ts
│       ├── 7 genres (Pop, Rock, Jazz, Classical, Electronic, Hip-Hop, Ambient)
│       ├── 5 moods (Happy, Sad, Energetic, Calm, Melancholic)
│       ├── Pricing: 3 credits/song = R$1.20
│       └── Credit packages (Starter, Professional, Enterprise)
├── UI Component
│   └── CreativeMusic.tsx
│       ├── Generator panel (form inputs)
│       ├── Gallery view (song cards)
│       ├── Theme selection (5 themes)
│       └── Export functionality
├── Styling
│   └── CreativeMusic.css
│       ├── Dark theme
│       ├── Responsive breakpoints
│       └── Animations
└── Integration
    └── CreativePanel.tsx
        ├── Added 'music' type
        ├── Music generator card
        └── Back navigation
```

### Modelos de IA

**Llama 2 70B** (via OpenRouter)
- Chat completion para geração de metadados
- Geração de letras criativas
- BPM e instrumentação baseada em gênero

### Fluxo de Geração

```
1. Usuário insere prompt + seleciona gênero + seleciona mood
2. Sistema valida créditos (3 necessários)
3. Chamar Llama 2 70B para:
   - Título da música
   - BPM e chave (Key)
   - Instrumentos
   - Estrutura (verso, pré-refrão, refrão, ponte)
   - Duração (segundos)
4. Chamar Llama 2 70B para:
   - Gerar letras completas
5. Salvar galeria com metadados
6. Exibir música na interface
7. Permitir export (JSON/HTML/M3U)
```

### Suportado Gêneros

| Gênero | Ícone | BPM | Instrumentos |
|--------|-------|-----|--------------|
| Pop | 🎤 | 120 | voz, guitarra, bateria, baixo, teclado |
| Rock | 🎸 | 140 | voz, guitarra elétrica, bateria, baixo |
| Jazz | 🎷 | 100 | saxofone, piano, contrabaixo, bateria, trompete |
| Clássica | 🎻 | 80 | violino, violoncelo, flauta, harpa, orquestra |
| Eletrônica | 🎛️ | 128 | sintetizador, vocoder, pad, bateria eletrônica |
| Hip-Hop | 🎤 | 90 | voz, bateria, baixo, sampler, turntable |
| Ambient | 🌌 | 60 | sintetizador, pad, reverb, delay |

### Créditos e Monetização

- **Custo ao Usuário**: 3 créditos = R$1.20
- **Custo Real**: ~$0.005 (via OpenRouter free tier + Llama 2)
- **Margin**: 99.6%
- **Pacotes**:
  - Iniciante: 10 créditos ($5) = 3 músicas
  - Profissional: 50 créditos ($20) = 16 músicas ⭐ Popular
  - Empresarial: 500 créditos ($150) = 166 músicas
- **Free Tier**: 1 música/mês

### Testes

**23/23 testes passando**:
- ✅ Cálculos de preço (11 testes)
- ✅ Configuração de gêneros (3 testes)
- ✅ Configuração de moods (3 testes)
- ✅ Pacotes de crédito (6 testes)

Executar:
```bash
npm test -- src/components/__tests__/CreativeMusic.test.ts
```

### Exports

**JSON**: Metadados completos
```json
{
  "id": "gallery-123",
  "title": "Minhas Músicas",
  "songs": [
    {
      "id": "song-123",
      "title": "Nova Canção",
      "genre": "Pop",
      "mood": "Happy",
      "duration": 240,
      "lyrics": "..."
    }
  ]
}
```

**HTML**: Página temática (5 temas: Modern, Retro, Minimalist, Vibrant, Dark)

**M3U**: Playlist (compatível com players)
```
#EXTM3U
#EXTINF:240,Nova Canção
local://song-123.mp3
```

---

## Próximos Passos

1. ✅ Documentar arquitetura de IA (este arquivo)
2. ✅ Implementar Music Generator (Phase 4)
3. ✅ Remover Groq e consolidar em OpenRouter
4. ✅ Adicionar transcrição de áudio via Whisper
5. ✅ Integrar chat melhorado (Claude via OpenRouter)
6. ✅ Criar Editor de Imagens (corte, resize, filtros)

---

**Última atualização**: 2026-10-10  
**Mantido por**: Claude Code (KUBO Protocol)

## Ferramentas Adicionais

### Editor de Imagens (Novo)

**Status**: ✅ Implementado (v1.0)

**Localização**: `src/components/creative/ImageEditorDialog.tsx`

**Funcionalidades**:
- Corte com proporções preconfiguradas (1:1, 4:5, 9:16, 16:9, etc.)
- Redimensionamento para qualquer tamanho
- Filtros: brilho, contraste, saturação, rotação
- Qualidade de exportação configurável
- Upload local ou via URL
- Processamento 100% no cliente (sem servidor)

**Custo**: Grátis (0 créditos)

**Documentação**: `/docs/IMAGE_EDITOR.md`  
**Versão**: 2.0 (Music Generator + OpenRouter consolidation)

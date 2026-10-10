# Editor de Imagens - Documentação Completa

## Visão Geral

O **Editor de Imagens** é uma ferramenta completa e gratuita integrada ao painel criativo da KUBO Vibe. Permite que os usuários editem, cortem, redimensionem e apliquem filtros a qualquer imagem com interface intuitiva e sem limite de uso.

## Arquitetura

### Componentes Principais

```
ImageEditorDialog (src/components/creative/ImageEditorDialog.tsx)
├── Cropper (react-easy-crop)
├── Slider (controles de ajuste)
├── Tabs (interface com abas)
└── Canvas API (processamento de imagens)
```

### Integração no Painel Criativo

O editor está integrado como uma ferramenta de primeiro nível no `CreativeToolInterface`:
- **Chave**: `image_editor`
- **Custo**: Grátis (0 créditos)
- **Ícone**: Sliders
- **Posição**: Segunda ferramente no painel (após Imagens Premium)

## Funcionalidades

### 1. Corte Avançado (Crop)

**Proporções Preconfiguradas:**
- Livre (sem restrição)
- 1:1 (Quadrado)
- 16:9 (Widescreen)
- 9:16 (Vertical)
- 4:5 (Retrato)
- 3:2 (Clássico)
- 2:3 (Clássico Invertido)

**Controles:**
- Zoom de 1x até 4x com step de 0.05
- Arrastar a imagem para posicionamento perfeito
- Grade visual (grid) para alinhamento preciso
- Dimensões em pixels personalizáveis

### 2. Filtros e Ajustes

**Filtros Disponíveis:**
- **Brilho**: 0% - 200% (padrão: 100%)
- **Contraste**: 0% - 200% (padrão: 100%)
- **Saturação**: 0% - 200% (padrão: 100%)
- **Rotação**: 0°, 90°, 180°, 270° (em passos de 90°)

**Preview em Tempo Real:**
Todos os ajustes são visualizados instantaneamente na pré-visualização

### 3. Redimensionamento

**Presets de Tamanho:**
- 640x480
- 800x600
- 1024x768
- 1280x720
- 1920x1080
- 2560x1440
- 512x512 (Avatar)
- 1024x1024 (Quadrado)

**Tamanho Customizado:**
- Campo de entrada para largura (pixels)
- Campo de entrada para altura (pixels)
- Proporção automática atualizada

### 4. Qualidade de Exportação

- Slider de 50% a 100%
- Padrão: 95% (excelente qualidade com ótima compressão)
- Ajuste fino para otimizar tamanho vs. qualidade

## Interface

### Abas Principais

#### Aba 1: Cortar
```
┌─────────────────────────────────┐
│  Visualização de Corte          │
│  [Imagem com Grid]              │
├─────────────────────────────────┤
│ Proporção: [Select]             │
│ Zoom: [Slider] 1.0x             │
│ Largura: [Input] | Altura: [Input]
│ [Resetar] [Presets]             │
└─────────────────────────────────┘
```

#### Aba 2: Filtros
```
┌─────────────────────────────────┐
│  Preview com Filtros            │
│  [Imagem Processada]            │
├─────────────────────────────────┤
│ Brilho: [Slider] 100%           │
│ Contraste: [Slider] 100%        │
│ Saturação: [Slider] 100%        │
│ [Girar 90°] [Reiniciar]         │
└─────────────────────────────────┘
```

#### Aba 3: Tamanho
```
┌─────────────────────────────────┐
│ [Botões de Presets]             │
│ 640x480 | 800x600 | 1024x768    │
│ 1280x720 | 1920x1080 | ...      │
├─────────────────────────────────┤
│ Tamanho Customizado:            │
│ Largura: [Input] | Altura: [Input]
│ Qualidade: [Slider] 95%         │
└─────────────────────────────────┘
```

## Fluxo de Uso

### Passo 1: Acessar o Editor
1. Ir para o painel criativo
2. Encontrar "Editor de Imagens"
3. Cole a URL da imagem OU clique em "Carregar Arquivo"

### Passo 2: Cortar (Opcional)
1. Vá para a aba "Cortar"
2. Selecione uma proporção ou deixe em "Livre"
3. Use o zoom para ajustar
4. Arraste a imagem para posicionar o corte
5. Ajuste largura/altura se necessário

### Passo 3: Aplicar Filtros (Opcional)
1. Vá para a aba "Filtros"
2. Ajuste brilho, contraste e saturação
3. Clique em "Girar 90°" se necessário
4. Clique em "Reiniciar" para desfazer todos os ajustes

### Passo 4: Redimensionar (Opcional)
1. Vá para a aba "Tamanho"
2. Selecione um preset OU insira dimensões customizadas
3. Ajuste a qualidade se necessário

### Passo 5: Salvar
1. Clique em "Salvar Imagem"
2. A imagem será baixada automaticamente
3. O histórico será atualizado

## Formato de Saída

### Especificações
- **Formato**: PNG (sem perda de dados)
- **Compressão**: Controlada pelo slider de qualidade
- **Metadata**: Inclusas dimensões e formato
- **Tamanho**: Otimizado automaticamente

### Exemplo de Metadata Retornado
```json
{
  "width": 1920,
  "height": 1080,
  "format": "png"
}
```

## Casos de Uso

### 1. Redes Sociais
- **Instagram**: 1080x1350 (Retrato) ou 1080x1080 (Quadrado)
- **Twitter**: 1200x675 (16:9)
- **TikTok**: 1080x1920 (9:16)
- **Facebook**: 1200x628 (16:9)

### 2. Avatares
- **Discord**: 512x512
- **Profissional**: 200x200
- **LinkedIn**: 400x400
- **Genérico**: 1024x1024

### 3. Banners
- **Website**: 1920x1080 ou 1200x400
- **Email**: 600x200
- **YouTube**: 1280x720

### 4. Documentos
- **Scans**: 1024x1024
- **Documentos**: 800x1200
- **Recibos**: 640x480

## Código Implementado

### Estrutura do Componente

```typescript
interface Props {
  open: boolean;
  imageUrl: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob, metadata: { 
    width: number; 
    height: number; 
    format: string 
  }) => void | Promise<void>;
}
```

### Função Principal: getCroppedImage

```typescript
async function getCroppedImage(
  imageSrc: string,
  area: Area,
  quality: number
): Promise<Blob>
```

**Processo:**
1. Carrega a imagem com CORS
2. Cria um Canvas com as dimensões do corte
3. Desenha a porção cortada no Canvas
4. Exporta como PNG com qualidade especificada

### Estados Gerenciados

```typescript
- crop: { x: number; y: number }      // Posição do corte
- zoom: number                         // Nível de zoom (1-4)
- aspect: number | undefined           // Proporção de aspecto
- croppedArea: Area | null             // Área cortada em pixels
- quality: number                      // Qualidade (50-100)
- rotation: number                     // Rotação (0, 90, 180, 270)
- brightness: number                   // Brilho (0-200)
- contrast: number                     // Contraste (0-200)
- saturation: number                   // Saturação (0-200)
- previewWidth: number | null          // Largura customizada
- previewHeight: number | null         // Altura customizada
```

## Performance

### Otimizações

1. **Processamento no Cliente**
   - Nenhuma requisição ao servidor
   - Execução instantânea
   - Sem limite de uso

2. **Renders Eficientes**
   - Uso de `useCallback` para funções
   - Controle granular de re-renders
   - Canvas processing assíncrono

3. **Memória**
   - URL.createObjectURL para downloads eficientes
   - Limpeza automática com URL.revokeObjectURL
   - Blob reutilizado

## Segurança

### Medidas de Proteção

1. **CORS**
   - Uso de `crossOrigin="anonymous"`
   - Suporta qualquer domínio com CORS habilitado

2. **Validação**
   - Verificação de tipo de arquivo (image/*)
   - Validação de dimensões
   - Tratamento de erros

3. **Privacidade**
   - Processamento local (não em servidor)
   - Sem rastreamento
   - Sem envio de dados para terceiros

## Integração com CreativePanel

### Adição de Nova Ferramenta

```typescript
type ToolKey = "chat" | "nano_banana" | "image_editor" | ...;

const TOOLS = [
  { 
    key: "image_editor", 
    title: "Editor de Imagens", 
    desc: "Edite, corte e redimensione suas imagens perfeitamente", 
    icon: Sliders, 
    cost: "Grátis" 
  },
  ...
];

const TOOL_CONFIGS = {
  image_editor: {
    title: "Editor de Imagens",
    description: "Editor completo com corte, redimensionamento, filtros e ajustes avançados.",
    cost: 0,
    promptLabel: "Cole a URL da imagem ou carregue um arquivo",
    placeholder: "https://exemplo.com/imagem.jpg ou selecione um arquivo local...",
  },
  ...
};
```

## Histórico de Sessão

As operações de edição são rastreadas no histórico:

```typescript
{
  id: "uuid",
  timestamp: "HH:MM:SS",
  prompt: "Imagem editada: 1920x1080",
  status: "success",
  metadata: {
    width: 1920,
    height: 1080,
    format: "png"
  }
}
```

## Limitações Conhecidas

1. **CORS**: Algumas imagens podem não carregar se o servidor não permitir CORS
2. **Navegadores antigos**: IE11 e versões anteriores não são suportadas
3. **Tamanho de arquivo**: Limitado à memória do navegador (geralmente ~500MB)
4. **Formatos**: Entrada suporta todos os formatos (JPG, PNG, WebP, etc.), saída é PNG

## Roadmap Futuro

- [ ] Suporte a múltiplos formatos de saída (JPG, WebP, GIF)
- [ ] Efeitos avançados (desfoque, sharpen, etc.)
- [ ] Camadas (layers)
- [ ] Desfazer/Refazer
- [ ] Salvamento de presets de edição
- [ ] Conversão de batch
- [ ] Compressão automática

## Dependências

```json
{
  "react-easy-crop": "^10.0.0",
  "lucide-react": "^latest",
  "sonner": "^latest",
  "shadcn/ui": "^latest"
}
```

## Exemplo de Uso Prático

### Preparar imagem para Instagram Stories
1. Cole a URL ou carregue a imagem
2. Vá para "Tamanho" → Selecione "9:16 (Vertical)"
3. Vá para "Filtros" → Aumente a saturação para 120%
4. Clique em "Salvar Imagem"
5. Use no Instagram

### Criar avatar profissional
1. Carregue sua foto
2. Corte para proporção 1:1
3. Vá para "Tamanho" → Selecione "512x512 (Avatar)"
4. Aumente o contraste para 120% se necessário
5. Salve para usar em perfis profissionais

## Troubleshooting

### "Imagem não carrega"
- Verifique se a URL tem CORS habilitado
- Tente carregar um arquivo local em vez disso

### "Corte não aparece"
- Recarregue o diálogo
- Redefinir zoom com botão "Resetar"

### "Arquivo fica muito grande"
- Reduza a qualidade para 70-80%
- Use presets menores como 512x512

## Support

Para questões sobre o Editor de Imagens:
- Documentação completa: `/docs/IMAGE_EDITOR.md`
- Issues: GitHub Issues
- Chat: Painel de chat da KUBO Vibe

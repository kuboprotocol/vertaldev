import React, { useRef, useState } from 'react';
import { Sparkles, Zap, Image, Music, Code, Video, Pen, Layout, BarChart3, Palette, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import ChatWidget from './ChatWidget';
import { CreativeChat } from './CreativeChat';
import { CreativeSlides } from './CreativeSlides';
import { CreativeImages } from './CreativeImages';
import { CreativeSheets } from './CreativeSheets';
import { CreativeMusic } from './CreativeMusic';
import { CreativeDesign } from './CreativeDesign';
import { useAuth } from '@/hooks/useAuth';

type CategoryId = 'design' | 'content' | 'media' | 'digital';

interface CreativeItem {
  id: string;
  type: 'text' | 'image' | 'audio' | 'code' | 'video' | 'slides' | 'spreadsheet' | 'music' | 'design';
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  category: CategoryId;
  // 'development': o card aparece, mas não abre nada. Não simular ferramenta que não existe.
  status: 'available' | 'development';
}

const CATEGORIES: Array<{ id: CategoryId; title: string; description: string }> = [
  { id: 'design', title: 'Design e comunicação', description: 'Artes, apresentações e imagens para divulgação' },
  { id: 'content', title: 'Conteúdo e documentos', description: 'Textos e planilhas' },
  { id: 'media', title: 'Mídia e audiovisual', description: 'Músicas e vídeos' },
  { id: 'digital', title: 'Criação digital e negócios', description: 'Código para páginas e produtos digitais' },
];

const ARROW_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-slate-200 transition-colors hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40';

// Altura de um slide do carrossel vertical (h-40 = 10rem).
const SLIDE_REM = 10;

/** Faixa horizontal de categorias, com setas para os lados. Cada chip leva à categoria. */
function CategoryStrip({ onSelect }: { onSelect: (id: CategoryId) => void }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const scrollStrip = (direction: number) => stripRef.current?.scrollBy({ left: direction * 240, behavior: 'smooth' });

  return (
    <nav aria-label="Categorias" className="flex items-center gap-2">
      <button type="button" aria-label="Categorias anteriores" onClick={() => scrollStrip(-1)} className={ARROW_BUTTON}>
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div ref={stripRef} className="flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none]">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className="shrink-0 rounded-full border border-slate-700 bg-slate-800/60 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500"
          >
            {category.title}
          </button>
        ))}
      </div>
      <button type="button" aria-label="Próximas categorias" onClick={() => scrollStrip(1)} className={ARROW_BUTTON}>
        <ChevronRight className="h-5 w-5" />
      </button>
    </nav>
  );
}

/** Um card de ferramenta. Ferramenta sem fluxo fica desativada, com a etiqueta "Em desenvolvimento". */
function ToolCard({ item, onOpen }: { item: CreativeItem; onOpen: (id: string) => void }) {
  const inDevelopment = item.status === 'development';
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      disabled={inDevelopment}
      aria-disabled={inDevelopment}
      className={`group relative h-full w-full overflow-hidden rounded-xl text-left transition-all duration-300 ${
        inDevelopment ? 'cursor-not-allowed opacity-60' : 'hover:scale-[1.01]'
      }`}
    >
      {!inDevelopment && (
        <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 transition-opacity group-hover:opacity-100`} />
      )}
      <div className="relative flex h-full items-center gap-5 rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm group-hover:border-slate-600">
        <div className={`shrink-0 rounded-lg bg-gradient-to-br ${item.color} p-3`}>
          <div className="text-white">{item.icon}</div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-white">{item.title}</h3>
          <p className="text-sm text-slate-400 group-hover:text-slate-300">{item.description}</p>
        </div>
        {inDevelopment ? (
          <span className="shrink-0 rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300">Em desenvolvimento</span>
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-white opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>
    </button>
  );
}

/** Uma categoria como carrossel vertical: um card por vez, com setas para cima e para baixo. */
function CategoryCarousel({
  category,
  cards,
  onOpen,
}: {
  category: (typeof CATEGORIES)[number];
  cards: CreativeItem[];
  onOpen: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const last = cards.length - 1;
  const go = (next: number) => setIndex(Math.min(Math.max(next, 0), last));

  return (
    <section aria-labelledby={`creative-category-${category.id}`} id={`creative-category-section-${category.id}`} className="scroll-mt-6">
      <div className="mb-4">
        <h2 id={`creative-category-${category.id}`} className="text-xl font-semibold text-white">
          {category.title}
        </h2>
        <p className="text-sm text-slate-400">{category.description}</p>
      </div>

      <div className="flex items-center gap-3">
        {cards.length > 1 && (
          <div className="flex flex-col gap-2">
            <button type="button" aria-label={`Anterior em ${category.title}`} onClick={() => go(index - 1)} disabled={index === 0} className={ARROW_BUTTON}>
              <ChevronUp className="h-5 w-5" />
            </button>
            <button type="button" aria-label={`Próximo em ${category.title}`} onClick={() => go(index + 1)} disabled={index === last} className={ARROW_BUTTON}>
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="relative min-w-0 flex-1 overflow-hidden" style={{ height: `${SLIDE_REM}rem` }}>
          <div className="transition-transform duration-500 ease-out" style={{ transform: `translateY(-${index * SLIDE_REM}rem)` }}>
            {cards.map((item) => (
              <div key={item.id} style={{ height: `${SLIDE_REM}rem` }}>
                <ToolCard item={item} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </div>

        {cards.length > 1 && (
          <span className="w-12 shrink-0 text-center text-xs text-slate-500">
            {index + 1}/{cards.length}
          </span>
        )}
      </div>
    </section>
  );
}

export default function CreativePanel() {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [creditsAvailable] = useState(100); // TODO: Get from user account

  const creativeItems: CreativeItem[] = [
    {
      id: 'writing',
      type: 'text',
      title: 'Escritor IA',
      description: 'Crie textos, artigos e conteúdo com IA',
      icon: <Pen className="w-6 h-6" />,
      color: 'from-blue-500 to-cyan-500',
      category: 'content',
      status: 'available',
    },
    {
      id: 'slides',
      type: 'slides',
      title: 'Gerador de Slides',
      description: 'Crie apresentações profissionais com IA',
      icon: <Layout className="w-6 h-6" />,
      color: 'from-green-500 to-teal-500',
      category: 'design',
      status: 'available',
    },
    {
      id: 'image',
      type: 'image',
      title: 'Gerador de Imagens',
      description: 'Crie imagens profissionais com IA',
      icon: <Image className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      category: 'design',
      status: 'available',
    },
    {
      id: 'spreadsheet',
      type: 'spreadsheet',
      title: 'Gerador de Planilhas',
      description: 'Crie planilhas automáticas com IA',
      icon: <BarChart3 className="w-6 h-6" />,
      color: 'from-cyan-500 to-blue-500',
      category: 'content',
      status: 'available',
    },
    {
      id: 'music',
      type: 'music',
      title: 'Gerador de Músicas',
      description: 'Crie músicas profissionais com IA',
      icon: <Music className="w-6 h-6" />,
      color: 'from-yellow-500 to-orange-500',
      category: 'media',
      status: 'available',
    },
    {
      id: 'design',
      type: 'design',
      title: 'Design Premium',
      description: 'Artes profissionais com direção de arte IA · 1 a 2 créditos',
      icon: <Palette className="w-6 h-6" />,
      color: 'from-amber-400 to-rose-500',
      category: 'design',
      status: 'available',
    },
    {
      id: 'code',
      type: 'code',
      title: 'Gerador de Código',
      description: 'Crie código profissional com IA',
      icon: <Code className="w-6 h-6" />,
      color: 'from-orange-500 to-red-500',
      category: 'digital',
      status: 'development',
    },
    {
      id: 'video',
      type: 'video',
      title: 'Criador de Vídeos',
      description: 'Crie vídeos e animações com IA',
      icon: <Video className="w-6 h-6" />,
      color: 'from-indigo-500 to-blue-500',
      category: 'media',
      status: 'development',
    },
  ];

  // Escritor IA
  if (selectedType === 'writing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
        <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => setSelectedType(null)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-all"
            >
              ← Voltar
            </button>
          </div>
        </div>
        <CreativeChat />
      </div>
    );
  }

  // Slides view
  if (selectedType === 'slides') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
        <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => setSelectedType(null)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-all"
            >
              ← Voltar
            </button>
          </div>
        </div>
        <CreativeSlides creditsAvailable={creditsAvailable} />
      </div>
    );
  }

  // Images view
  if (selectedType === 'image') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
        <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => setSelectedType(null)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-all"
            >
              ← Voltar
            </button>
          </div>
        </div>
        <CreativeImages creditsAvailable={creditsAvailable} />
      </div>
    );
  }

  // Spreadsheet view
  if (selectedType === 'spreadsheet') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
        <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => setSelectedType(null)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-all"
            >
              ← Voltar
            </button>
          </div>
        </div>
        <CreativeSheets creditsAvailable={creditsAvailable} />
      </div>
    );
  }

  // Design view
  if (selectedType === 'design') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
        <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => setSelectedType(null)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-all"
            >
              ← Voltar
            </button>
          </div>
        </div>
        <CreativeDesign creditsAvailable={creditsAvailable} />
      </div>
    );
  }

  // Music view
  if (selectedType === 'music') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
        <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => setSelectedType(null)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-all"
            >
              ← Voltar
            </button>
          </div>
        </div>
        <CreativeMusic creditsAvailable={creditsAvailable} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Painel Criativo</h1>
                <p className="text-sm text-slate-400">Crie conteúdo incrível com IA</p>
              </div>
            </div>
            <button
              onClick={() => setShowChat(!showChat)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:shadow-lg hover:shadow-blue-500/20 transition-all"
            >
              <Zap className="w-4 h-4" />
              Chat IA
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
        {/* Chat Widget */}
        {showChat && (
          <div className="mb-12">
            <ChatWidget onClose={() => setShowChat(false)} />
          </div>
        )}

        {/* Faixa de categorias no topo: rolagem horizontal com setas */}
        <CategoryStrip
          onSelect={(id) => document.getElementById(`creative-category-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />

        {/* Cada categoria é um carrossel vertical de cards */}
        {CATEGORIES.map((category) => (
          <CategoryCarousel
            key={category.id}
            category={category}
            cards={creativeItems.filter((item) => item.category === category.id)}
            onOpen={setSelectedType}
          />
        ))}

        {/* Featured Section */}
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 blur-3xl" />
          <div className="relative bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 md:p-12">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold text-white mb-4">
                Crie Sem Limites
              </h2>
              <p className="text-slate-400 mb-6">
                Use nossa IA avançada para criar conteúdo profissional em segundos. Desde textos até vídeos, tudo em um único lugar.
              </p>
              <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/20 transition-all font-semibold">
                Começar Agora
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

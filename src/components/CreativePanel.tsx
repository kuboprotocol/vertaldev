import React, { useState } from 'react';
import { Sparkles, Zap, Image, Music, Code, Video, Pen, Layout, BarChart3, Palette, ArrowLeft, ChevronRight } from 'lucide-react';
import ChatWidget from './ChatWidget';
import { CreativeChat } from './CreativeChat';
import { CreativeSlides } from './CreativeSlides';
import { CreativeImages } from './CreativeImages';
import { CreativeSheets } from './CreativeSheets';
import { CreativeMusic } from './CreativeMusic';
import { CreativeDesign } from './CreativeDesign';
import { DesignWorld, PendingPage } from './creative/DesignWorld';
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
  // 'development': a ferramenta aparece como página, mas não abre nada. Não simular ferramenta que não existe.
  status: 'available' | 'development';
}

interface CreativeCategory {
  id: CategoryId;
  title: string;
  description: string;
  color: string;
  icon: React.ReactNode;
}

const CATEGORIES: CreativeCategory[] = [
  {
    id: 'design',
    title: 'Design e comunicação',
    description: 'Apresentações e imagens para divulgação',
    color: 'from-purple-500 to-pink-500',
    icon: <Layout className="h-7 w-7" />,
  },
  {
    id: 'content',
    title: 'Conteúdo e documentos',
    description: 'Textos e planilhas',
    color: 'from-cyan-500 to-blue-500',
    icon: <Pen className="h-7 w-7" />,
  },
  {
    id: 'media',
    title: 'Mídia e audiovisual',
    description: 'Músicas e vídeos',
    color: 'from-yellow-500 to-orange-500',
    icon: <Music className="h-7 w-7" />,
  },
  {
    id: 'digital',
    title: 'Criação digital e negócios',
    description: 'Código para páginas e produtos digitais',
    color: 'from-orange-500 to-red-500',
    icon: <Code className="h-7 w-7" />,
  },
];

// Ferramentas. O Design Premium não entra aqui: tem destaque próprio na home e é um mundo completo.
const CREATIVE_ITEMS: CreativeItem[] = [
  {
    id: 'writing',
    type: 'text',
    title: 'Escritor IA',
    description: 'Crie textos, artigos e conteúdo com IA',
    icon: <Pen className="h-5 w-5" />,
    color: 'from-blue-500 to-cyan-500',
    category: 'content',
    status: 'available',
  },
  {
    id: 'slides',
    type: 'slides',
    title: 'Gerador de Slides',
    description: 'Crie apresentações profissionais com IA',
    icon: <Layout className="h-5 w-5" />,
    color: 'from-green-500 to-teal-500',
    category: 'design',
    status: 'available',
  },
  {
    id: 'image',
    type: 'image',
    title: 'Gerador de Imagens',
    description: 'Crie imagens profissionais com IA',
    icon: <Image className="h-5 w-5" />,
    color: 'from-purple-500 to-pink-500',
    category: 'design',
    status: 'available',
  },
  {
    id: 'spreadsheet',
    type: 'spreadsheet',
    title: 'Gerador de Planilhas',
    description: 'Crie planilhas automáticas com IA',
    icon: <BarChart3 className="h-5 w-5" />,
    color: 'from-cyan-500 to-blue-500',
    category: 'content',
    status: 'available',
  },
  {
    id: 'music',
    type: 'music',
    title: 'Gerador de Músicas',
    description: 'Crie músicas profissionais com IA',
    icon: <Music className="h-5 w-5" />,
    color: 'from-yellow-500 to-orange-500',
    category: 'media',
    status: 'available',
  },
  {
    id: 'code',
    type: 'code',
    title: 'Gerador de Código',
    description: 'Crie código profissional com IA',
    icon: <Code className="h-5 w-5" />,
    color: 'from-orange-500 to-red-500',
    category: 'digital',
    status: 'development',
  },
  {
    id: 'video',
    type: 'video',
    title: 'Criador de Vídeos',
    description: 'Crie vídeos e animações com IA',
    icon: <Video className="h-5 w-5" />,
    color: 'from-indigo-500 to-blue-500',
    category: 'media',
    status: 'development',
  },
];

const PAGE_BACKGROUND = 'min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900';

/** Conteúdo de uma ferramenta disponível. Ferramentas em desenvolvimento não chegam aqui. */
function renderTool(type: CreativeItem['type'], creditsAvailable: number) {
  switch (type) {
    case 'text':
      return <CreativeChat />;
    case 'slides':
      return <CreativeSlides creditsAvailable={creditsAvailable} />;
    case 'image':
      return <CreativeImages creditsAvailable={creditsAvailable} />;
    case 'spreadsheet':
      return <CreativeSheets creditsAvailable={creditsAvailable} />;
    case 'music':
      return <CreativeMusic creditsAvailable={creditsAvailable} />;
    default:
      return null;
  }
}

/** Mundo de uma categoria: cada ferramenta é uma página, com a navegação lateral do mundo. */
function CategoryWorld({
  category,
  items,
  creditsAvailable,
  onExit,
}: {
  category: CreativeCategory;
  items: CreativeItem[];
  creditsAvailable: number;
  onExit: () => void;
}) {
  return (
    <div className={PAGE_BACKGROUND}>
      <DesignWorld
        backLabel="Painel Criativo"
        eyebrow="Painel Criativo"
        title={category.title}
        description={category.description}
        onExit={onExit}
        pages={items.map((item) => ({
          key: item.id,
          label: item.title,
          render: () =>
            item.status === 'development' ? (
              <PendingPage title={item.title} description={item.description} />
            ) : (
              <div className="min-w-0">{renderTool(item.type, creditsAvailable)}</div>
            ),
        }))}
      />
    </div>
  );
}

export default function CreativePanel() {
  useAuth();
  const [showChat, setShowChat] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState<CategoryId | null>(null);
  const [creditsAvailable] = useState(100); // TODO: Get from user account

  if (designOpen) {
    return (
      <div className={PAGE_BACKGROUND + ' flex flex-col'}>
        <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => setDesignOpen(false)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-all"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar
            </button>
          </div>
        </div>
        <CreativeDesign creditsAvailable={creditsAvailable} />
      </div>
    );
  }

  const activeCategory = CATEGORIES.find((category) => category.id === openCategory);
  if (activeCategory) {
    return (
      <CategoryWorld
        category={activeCategory}
        items={CREATIVE_ITEMS.filter((item) => item.category === activeCategory.id)}
        creditsAvailable={creditsAvailable}
        onExit={() => setOpenCategory(null)}
      />
    );
  }

  return (
    <div className={PAGE_BACKGROUND}>
      {/* Cabeçalho */}
      <div className="border-b border-slate-700/50 backdrop-blur-xl bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="shrink-0 p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-white">Painel Criativo</h1>
                <p className="text-sm text-slate-400">Crie conteúdo incrível com IA</p>
              </div>
            </div>
            <button
              onClick={() => setShowChat(!showChat)}
              className="flex shrink-0 items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:shadow-lg hover:shadow-blue-500/20 transition-all"
            >
              <Zap className="w-4 h-4" />
              Chat IA
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {showChat && (
          <div>
            <ChatWidget onClose={() => setShowChat(false)} />
          </div>
        )}

        {/* Destaque: o Design Premium é um mundo completo */}
        <button
          type="button"
          onClick={() => setDesignOpen(true)}
          className="group relative w-full overflow-hidden rounded-2xl border border-amber-300/30 bg-gradient-to-r from-amber-400/15 to-rose-500/15 p-6 text-left transition-colors hover:border-amber-300/60 md:p-8"
        >
          <div className="flex items-center gap-5">
            <div className="shrink-0 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 p-4">
              <Palette className="h-8 w-8 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-white">Design Premium</h2>
              <p className="mt-1 text-slate-300">Artes profissionais com direção de arte IA · 1 a 2 créditos</p>
            </div>
            <ChevronRight className="h-6 w-6 shrink-0 text-white opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </div>
        </button>

        {/* Categorias: cada uma abre um mundo com as ferramentas como páginas */}
        <section aria-labelledby="creative-categories-title" className="space-y-5">
          <h2 id="creative-categories-title" className="text-xl font-semibold text-white">
            Escolha uma categoria
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CATEGORIES.map((category) => {
              const tools = CREATIVE_ITEMS.filter((item) => item.category === category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setOpenCategory(category.id)}
                  className="group flex items-center gap-5 rounded-2xl border border-slate-700/60 bg-slate-800/50 p-5 text-left transition-colors hover:border-slate-500"
                >
                  <div className={`shrink-0 rounded-2xl bg-gradient-to-br ${category.color} p-4 text-white shadow-lg`}>{category.icon}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-white">{category.title}</h3>
                    <p className="text-sm text-slate-400">{category.description}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {tools.map((tool) => tool.title).join(' · ')}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-500 transition-colors group-hover:text-white" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

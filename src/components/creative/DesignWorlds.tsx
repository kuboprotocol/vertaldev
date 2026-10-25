import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { Layers, LayoutGrid, Loader2, Plus, Sparkles, User, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { DesignWorld, PendingPage, StartCard } from './DesignWorld';
import { DesignGalleryFeed, MyPublishedDesigns, type DesignCopy } from './DesignGallery';
import { FreeCreativeTools } from './FreeCreativeTools';
import { ManualDesignEditor } from './ManualDesignEditor';
import { PhotocraftEditor } from './PhotocraftEditor';

// O canvas (tldraw) é pesado: só carrega quando o mundo Canvas é aberto.
const CanvasDesignStudio = lazy(() =>
  import('./CanvasDesignStudio').then((module) => ({ default: module.CanvasDesignStudio })),
);

interface WorldProps {
  onExit: () => void;
}

interface WorldStart {
  title: string;
  description: string;
  onSelect: () => void;
  icon?: ReactNode;
  gradient?: string;
}

function WorldHome({ heading, items }: { heading: string; items: WorldStart[] }) {
  return (
    <section aria-label={heading} className="space-y-4">
      <h3 className="font-['Unbounded'] text-lg font-bold text-white">{heading}</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <StartCard
            key={item.title}
            title={item.title}
            description={item.description}
            onClick={item.onSelect}
            icon={item.icon}
            gradient={item.gradient}
          />
        ))}
      </div>
    </section>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-amber-300" aria-label="Carregando" />
    </div>
  );
}

/** Mundo Canvas: início, editor e modelos. Uma cópia vinda da galeria abre direto no editor. */
export function CanvasWorld({
  onExit,
  initialCopy,
  onCopyConsumed,
}: WorldProps & { initialCopy?: DesignCopy | null; onCopyConsumed?: () => void }) {
  const jumpTo = useMemo(() => (initialCopy ? { key: 'editor' } : undefined), [initialCopy]);
  return (
    <DesignWorld
      eyebrow="Canvas"
      title="Canvas infinito"
      description="Monte sua arte livremente, com texto, formas e imagens."
      onExit={onExit}
      jumpTo={jumpTo}
      pages={[
        {
          key: 'home',
          label: 'Início',
          render: (goTo) => (
            <WorldHome
              heading="Comece um canvas"
              items={[
                {
                  title: 'Novo canvas',
                  description: 'Abra o editor em branco e comece do zero',
                  onSelect: () => goTo('editor'),
                  icon: <Plus className="h-5 w-5" />,
                  gradient: 'from-rose-500 to-orange-400',
                },
                {
                  title: 'Modelos',
                  description: 'Comece de um modelo publicado',
                  onSelect: () => goTo('models'),
                  icon: <LayoutGrid className="h-5 w-5" />,
                  gradient: 'from-amber-400 to-yellow-300',
                },
              ]}
            />
          ),
        },
        {
          key: 'editor',
          label: 'Editor',
          render: () => (
            <Suspense fallback={<Spinner />}>
              <CanvasDesignStudio initialCopy={initialCopy} onCopyConsumed={onCopyConsumed} />
            </Suspense>
          ),
        },
        {
          key: 'models',
          label: 'Modelos',
          render: () => (
            <PendingPage title="Modelos do Canvas" description="Modelos publicados para começar um canvas pronto aparecem aqui." />
          ),
        },
      ]}
    />
  );
}

/** Mundo Estúdio Pro: editor manual, PhotoCraft e ferramentas grátis. */
export function StudioWorld({ onExit }: WorldProps) {
  return (
    <DesignWorld
      eyebrow="Estúdio Pro"
      title="Estúdio Pro"
      description="Camadas, fotos e ferramentas abertas, em um só lugar."
      onExit={onExit}
      pages={[
        {
          key: 'home',
          label: 'Início',
          render: (goTo) => (
            <WorldHome
              heading="Ferramentas"
              items={[
                {
                  title: 'Editor manual',
                  description: 'Monte a arte à mão: textos, formas e imagens',
                  onSelect: () => goTo('manual'),
                  icon: <Layers className="h-5 w-5" />,
                  gradient: 'from-orange-400 to-rose-500',
                },
                {
                  title: 'PhotoCraft',
                  description: 'Edição de fotos no navegador',
                  onSelect: () => goTo('photocraft'),
                  icon: <Sparkles className="h-5 w-5" />,
                  gradient: 'from-violet-500 to-blue-500',
                },
                {
                  title: 'Ferramentas grátis',
                  description: 'Hub com ferramentas abertas',
                  onSelect: () => goTo('free'),
                  icon: <Wrench className="h-5 w-5" />,
                  gradient: 'from-emerald-400 to-teal-600',
                },
              ]}
            />
          ),
        },
        {
          key: 'manual',
          label: 'Editor manual',
          render: () => (
            <div className="mx-auto max-w-6xl">
              <ManualDesignEditor />
            </div>
          ),
        },
        {
          key: 'photocraft',
          label: 'PhotoCraft',
          render: () => <PhotocraftEditor />,
        },
        {
          key: 'free',
          label: 'Ferramentas grátis',
          render: (goTo) => (
            <div className="mx-auto max-w-6xl">
              <FreeCreativeTools onOpenMode={goTo} />
            </div>
          ),
        },
      ]}
    />
  );
}

/** Mundo Avatares: criar avatar (ferramenta já existente) e galeria de avatares. */
export function AvatarsWorld({ onExit }: WorldProps) {
  const navigate = useNavigate();
  return (
    <DesignWorld
      eyebrow="Avatares"
      title="Avatares"
      description="Avatares falantes, com voz e narração por IA."
      onExit={onExit}
      pages={[
        {
          key: 'home',
          label: 'Início',
          render: () => (
            <WorldHome
              heading="Crie seu avatar"
              items={[
                {
                  title: 'Criar avatar',
                  description: 'Avatar falante com narração por IA',
                  onSelect: () => navigate('/creative/avatar'),
                  icon: <User className="h-5 w-5" />,
                  gradient: 'from-emerald-400 to-cyan-600',
                },
              ]}
            />
          ),
        },
        {
          key: 'gallery',
          label: 'Galeria de avatares',
          render: () => (
            <PendingPage title="Galeria de avatares" description="Avatares que você decidir mostrar aparecem aqui para outras pessoas." />
          ),
        },
      ]}
    />
  );
}

/** Mundo Galeria: feed de designs publicados e os publicados por você. Usar um design abre uma cópia no Canvas. */
export function GalleryWorld({ onExit, onOpenCopy }: WorldProps & { onOpenCopy: (copy: DesignCopy) => void }) {
  return (
    <DesignWorld
      eyebrow="Galeria premium"
      title="Galeria"
      description="Designs publicados por outras pessoas. Quem usa um design como base gera crédito para o autor."
      onExit={onExit}
      pages={[
        {
          key: 'feed',
          label: 'Feed',
          render: () => <DesignGalleryFeed onOpenCopy={onOpenCopy} />,
        },
        {
          key: 'mine',
          label: 'Meus publicados',
          render: () => <MyPublishedDesigns />,
        },
      ]}
    />
  );
}

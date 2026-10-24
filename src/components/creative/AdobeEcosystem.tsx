import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';

// Ecossistema Adobe Creative Cloud. Cada app abre o site oficial da Adobe em nova aba.
// Não há integração por API aqui: a Adobe exige credenciais de desenvolvedor para isso.

type AdobeCategory = 'design' | 'foto' | 'video' | 'ia' | 'docs' | 'recursos';

interface AdobeApp {
  id: string;
  name: string;
  category: AdobeCategory;
  summary: string;
  useFor: string;
  url: string;
}

const ADOBE_CATEGORIES: Record<AdobeCategory, string> = {
  design: 'Design',
  foto: 'Foto',
  video: 'Vídeo e motion',
  ia: 'IA generativa',
  docs: 'Documentos',
  recursos: 'Recursos',
};

const ADOBE_APPS: AdobeApp[] = [
  {
    id: 'express',
    name: 'Adobe Express',
    category: 'design',
    summary: 'Design rápido com modelos, redes sociais e marca.',
    useFor: 'Posts, stories e banners prontos para publicar',
    url: 'https://express.adobe.com',
  },
  {
    id: 'photoshop',
    name: 'Photoshop',
    category: 'design',
    summary: 'Edição de imagens em camadas, máscaras e retoque avançado.',
    useFor: 'Acabamento final de artes e fotos',
    url: 'https://www.adobe.com/products/photoshop.html',
  },
  {
    id: 'illustrator',
    name: 'Illustrator',
    category: 'design',
    summary: 'Vetores, logotipos e ilustrações em escala infinita.',
    useFor: 'Logotipos, ícones e peças vetoriais',
    url: 'https://www.adobe.com/products/illustrator.html',
  },
  {
    id: 'indesign',
    name: 'InDesign',
    category: 'design',
    summary: 'Diagramação de páginas, revistas, e-books e catálogos.',
    useFor: 'Documentos impressos e PDFs editoriais',
    url: 'https://www.adobe.com/products/indesign.html',
  },
  {
    id: 'fresco',
    name: 'Fresco',
    category: 'design',
    summary: 'Pintura digital e desenho com pincéis realistas.',
    useFor: 'Ilustração à mão livre e texturas',
    url: 'https://www.adobe.com/products/fresco.html',
  },
  {
    id: 'lightroom',
    name: 'Lightroom',
    category: 'foto',
    summary: 'Organização e ajuste de cor em lotes de fotos.',
    useFor: 'Tratamento de fotos de produto e de evento',
    url: 'https://www.adobe.com/products/photoshop-lightroom.html',
  },
  {
    id: 'firefly',
    name: 'Firefly',
    category: 'ia',
    summary: 'Geração de imagens, efeitos de texto e extensão de cena com IA da Adobe.',
    useFor: 'Criar variações e elementos visuais a partir de texto',
    url: 'https://firefly.adobe.com',
  },
  {
    id: 'premiere',
    name: 'Premiere Pro',
    category: 'video',
    summary: 'Edição de vídeo profissional em linha do tempo.',
    useFor: 'Cortes de vídeo, reels e vídeos longos',
    url: 'https://www.adobe.com/products/premiere.html',
  },
  {
    id: 'aftereffects',
    name: 'After Effects',
    category: 'video',
    summary: 'Motion graphics, títulos animados e composição visual.',
    useFor: 'Animar logotipos, títulos e transições',
    url: 'https://www.adobe.com/products/aftereffects.html',
  },
  {
    id: 'audition',
    name: 'Audition',
    category: 'video',
    summary: 'Edição e restauração de áudio multipista.',
    useFor: 'Narração, trilha sonora e limpeza de som',
    url: 'https://www.adobe.com/products/audition.html',
  },
  {
    id: 'acrobat',
    name: 'Acrobat',
    category: 'docs',
    summary: 'Criação, edição e assinatura de arquivos PDF.',
    useFor: 'Entregar e revisar PDFs finais',
    url: 'https://www.adobe.com/acrobat.html',
  },
  {
    id: 'fonts',
    name: 'Adobe Fonts',
    category: 'recursos',
    summary: 'Biblioteca de fontes licenciadas para uso no design.',
    useFor: 'Tipografia profissional sem comprar licenças extras',
    url: 'https://fonts.adobe.com',
  },
  {
    id: 'stock',
    name: 'Adobe Stock',
    category: 'recursos',
    summary: 'Fotos, vetores, vídeos e modelos de ativos licenciados.',
    useFor: 'Imagens e vídeos de apoio para as artes',
    url: 'https://stock.adobe.com',
  },
  {
    id: 'behance',
    name: 'Behance',
    category: 'recursos',
    summary: 'Portfólio e vitrine para publicar os trabalhos criativos.',
    useFor: 'Mostrar e divulgar o portfólio',
    url: 'https://www.behance.net',
  },
];

const WORKFLOW_STEPS = [
  { title: 'Crie no editor manual', detail: 'Monte a arte com texto, formas e imagens na aba Editor manual.' },
  { title: 'Gere variações com IA', detail: 'Use o modo Com IA para criar alternativas de direção de arte.' },
  { title: 'Refine no Express ou Photoshop', detail: 'Baixe o PNG e finalize cor, retoque e camadas.' },
  { title: 'Vetorize no Illustrator', detail: 'Logotipos e ícones seguem para o Illustrator em formato vetorial.' },
  { title: 'Anime no After Effects', detail: 'Transforme a arte estática em motion para stories e reels.' },
  { title: 'Entregue em PDF no Acrobat', detail: 'Feche o material para impressão ou envio ao cliente.' },
];

export function AdobeEcosystem() {
  const [category, setCategory] = useState<AdobeCategory | 'todos'>('todos');

  const visibleApps = useMemo(
    () => ADOBE_APPS.filter((app) => category === 'todos' || app.category === category),
    [category],
  );

  const filters: Array<{ key: AdobeCategory | 'todos'; label: string }> = [
    { key: 'todos', label: 'Todos' },
    ...(Object.keys(ADOBE_CATEGORIES) as AdobeCategory[]).map((key) => ({ key, label: ADOBE_CATEGORIES[key] })),
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-rose-300/80">Ecossistema criativo</p>
        <h2 className="mt-2 text-3xl font-bold text-white">Adobe Creative Cloud</h2>
        <p className="mt-2 text-slate-400">
          Leve sua arte para as ferramentas profissionais da Adobe. Cada app abre no site oficial.
        </p>
      </header>

      <nav aria-label="Filtrar apps Adobe" className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const selected = category === filter.key;
          return (
            <button
              key={filter.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setCategory(filter.key)}
              className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                selected
                  ? 'border-slate-200 bg-white text-slate-900'
                  : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-500'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </nav>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleApps.map((app) => (
          <li key={app.id} className="flex flex-col rounded-xl border border-slate-700/60 bg-slate-800/50 p-5">
            <span className="text-xs uppercase tracking-wider text-slate-500">{ADOBE_CATEGORIES[app.category]}</span>
            <h3 className="mt-1 text-lg font-semibold text-white">{app.name}</h3>
            <p className="mt-2 text-sm text-slate-400">{app.summary}</p>
            <p className="mt-3 text-xs text-slate-500">Use para: {app.useFor}</p>
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto pt-4 inline-flex items-center gap-2 text-sm text-amber-300 hover:text-amber-200"
            >
              Abrir {app.name}
              <ExternalLink className="w-4 h-4" aria-hidden />
            </a>
          </li>
        ))}
      </ul>

      <section aria-label="Fluxo sugerido" className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-white">Fluxo sugerido de produção</h3>
        <ol className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-rose-500 text-xs font-bold text-slate-900">
                {index + 1}
              </span>
              <div>
                <p className="font-medium text-slate-100">{step.title}</p>
                <p className="text-sm text-slate-400">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs text-slate-500">
        A integração direta por API (por exemplo, Firefly Services) depende de credenciais de desenvolvedor da Adobe. Enquanto isso, os links acima levam ao site oficial de cada app.
      </p>
    </div>
  );
}

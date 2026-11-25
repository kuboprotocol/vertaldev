// Tela cheia do cartão ao vivo do Vertal Navigator SEM recarregar a tela ao vivo.
// Mover um <iframe> no DOM (portal) recarrega o noVNC e reconecta o stream; por isso o
// cartão continua no mesmo lugar do DOM e só vira `position: fixed; inset: 0`.
// Ancestrais com transform/filter/backdrop-filter (ex.: o Card "glass" do Vibe Code)
// prenderiam o `fixed` dentro deles: enquanto a tela cheia está aberta, neutralizamos
// esses estilos nos ancestrais e restauramos tudo ao recolher.
// Também: Esc fecha, Tab fica preso dentro da tela cheia, rolagem da página travada e o
// foco volta para o botão que abriu.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', 'iframe', 'audio[controls]', '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Elementos focáveis visíveis dentro do contêiner (ordem do DOM). */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true');
}

const NEUTRALIZE: Array<[string, (cs: CSSStyleDeclaration) => boolean, string]> = [
  ['transform', (cs) => !!cs.transform && cs.transform !== 'none', 'none'],
  ['filter', (cs) => !!cs.filter && cs.filter !== 'none', 'none'],
  ['backdrop-filter', (cs) => !!cs.backdropFilter && cs.backdropFilter !== 'none', 'none'],
  ['-webkit-backdrop-filter', (cs) => {
    const v = (cs as unknown as Record<string, string>).webkitBackdropFilter;
    return !!v && v !== 'none';
  }, 'none'],
  ['perspective', (cs) => !!cs.perspective && cs.perspective !== 'none', 'none'],
  ['contain', (cs) => !!cs.contain && cs.contain !== 'none', 'none'],
  ['will-change', (cs) => /transform|filter|perspective/.test(cs.willChange || ''), 'auto'],
  ['opacity', (cs) => !!cs.opacity && cs.opacity !== '1', '1'],
];

/**
 * Tira dos ancestrais o que cria "containing block"/contexto de empilhamento para o
 * `position: fixed` e devolve a função que restaura os estilos originais.
 */
export function escapeContainingBlocks(el: HTMLElement): () => void {
  const saved: Array<{ node: HTMLElement; prop: string; value: string; priority: string }> = [];
  const view = el.ownerDocument.defaultView;
  if (!view) return () => undefined;
  for (let node = el.parentElement; node && node !== el.ownerDocument.body && node !== el.ownerDocument.documentElement; node = node.parentElement) {
    const cs = view.getComputedStyle(node);
    const patch = (prop: string, value: string) => {
      saved.push({ node, prop, value: node.style.getPropertyValue(prop), priority: node.style.getPropertyPriority(prop) });
      node.style.setProperty(prop, value, 'important');
    };
    for (const [prop, has, value] of NEUTRALIZE) if (has(cs)) patch(prop, value);
    // Ancestral posicionado com z-index: sobe a pilha inteira para a tela cheia ficar por cima.
    if (cs.position && cs.position !== 'static' && cs.zIndex && cs.zIndex !== 'auto') patch('z-index', '2147483000');
  }
  return () => {
    for (const s of saved.reverse()) {
      if (s.value) s.node.style.setProperty(s.prop, s.value, s.priority);
      else s.node.style.removeProperty(s.prop);
    }
  };
}

export interface NavigatorFullscreen {
  fullscreen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Contêiner que vira tela cheia (fica sempre montado no mesmo lugar). */
  shellRef: RefObject<HTMLDivElement>;
  /** Botão que abre a tela cheia (recebe o foco de volta ao recolher). */
  triggerRef: RefObject<HTMLButtonElement>;
  /** Botão "Recolher" (recebe o foco ao abrir). */
  closeRef: RefObject<HTMLButtonElement>;
  /** Esc fecha e Tab/Shift+Tab ficam dentro da tela cheia. */
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
}

export function useNavigatorFullscreen(): NavigatorFullscreen {
  const [fullscreen, setFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  const open = useCallback(() => setFullscreen(true), []);
  const close = useCallback(() => setFullscreen(false), []);
  const toggle = useCallback(() => setFullscreen((v) => !v), []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!fullscreen || !shell) {
      if (wasOpen.current) {
        wasOpen.current = false;
        // O botão "Expandir" existe de novo depois do render: devolve o foco a ele.
        triggerRef.current?.focus();
      }
      return undefined;
    }
    wasOpen.current = true;
    const restoreAncestors = escapeContainingBlocks(shell);
    const body = shell.ownerDocument.body;
    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    closeRef.current?.focus();
    // Esc com o foco fora do cartão (ex.: depois de clicar no fundo): também fecha.
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setFullscreen(false);
    };
    shell.ownerDocument.addEventListener('keydown', onDocKey);
    return () => {
      shell.ownerDocument.removeEventListener('keydown', onDocKey);
      body.style.overflow = prevOverflow;
      restoreAncestors();
    };
  }, [fullscreen]);

  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    if (!fullscreen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setFullscreen(false);
      return;
    }
    if (e.key !== 'Tab' || !shellRef.current) return;
    const items = focusableIn(shellRef.current);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = shellRef.current.ownerDocument.activeElement;
    if (e.shiftKey && (active === first || !shellRef.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !shellRef.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }, [fullscreen]);

  return { fullscreen, open, close, toggle, shellRef, triggerRef, closeRef, onKeyDown };
}

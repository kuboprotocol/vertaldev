// Monta no editor do Canvas (tldraw) o layout que o agente do Vertal Chat desenhou.
// Tudo entra como formas normais, dentro de um quadro: o usuário edita, move e exporta à vontade.
import { createShapeId, type Editor, type TLShapePartial } from 'tldraw';
import type { CanvasSpec } from '@/lib/chatAgent/contract';
import { CANVAS_BASE_FONT_PX } from '@/lib/chatAgent/canvasSpec';

const ALIGN = { left: 'start', center: 'middle', right: 'end' } as const;

/** Texto do tldraw (TipTap): um parágrafo por linha, com negrito opcional. */
function richText(text: string, bold: boolean) {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line
        ? { content: [{ type: 'text', text: line, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }] }
        : {}),
    })),
  };
}

export function applyCanvasSpec(editor: Editor, spec: CanvasSpec): void {
  const frameId = createShapeId();
  const shapes: TLShapePartial[] = [
    { id: frameId, type: 'frame', x: 0, y: 0, props: { w: spec.width, h: spec.height, name: spec.name } },
    {
      id: createShapeId(), type: 'geo', parentId: frameId, x: 0, y: 0,
      props: { geo: 'rectangle', w: spec.width, h: spec.height, color: spec.background, fill: 'fill', dash: 'solid', size: 's' },
    },
  ];
  for (const el of spec.elements) {
    if (el.type === 'text') {
      const scale = el.size / CANVAS_BASE_FONT_PX;
      shapes.push({
        id: createShapeId(), type: 'text', parentId: frameId, x: el.x, y: el.y,
        props: {
          richText: richText(el.text, el.bold), color: el.color, size: 'm', font: 'sans',
          textAlign: ALIGN[el.align], autoSize: false, w: el.w / scale, scale,
        },
      });
    } else {
      shapes.push({
        id: createShapeId(), type: 'geo', parentId: frameId, x: el.x, y: el.y,
        props: { geo: el.type === 'ellipse' ? 'ellipse' : 'rectangle', w: el.w, h: el.h, color: el.color, fill: 'fill', dash: 'solid', size: 's' },
      });
    }
  }
  editor.run(() => {
    editor.createShapes(shapes);
  });
  editor.zoomToFit({ animation: { duration: 0 } });
}

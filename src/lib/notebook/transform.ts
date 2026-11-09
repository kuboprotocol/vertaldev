import { newId, nowIso, type Insight, type Notebook, type Source, type Transformation } from './model';
import { runNotebookAi } from '@/services/notebookAiService';

/** Roda uma transformação numa fonte e devolve o insight (cobra 1 crédito). */
export async function runTransformation(source: Source, t: Transformation, notebook: Notebook): Promise<Insight> {
  const out = await runNotebookAi({
    action: 'transform',
    notebook: { name: notebook.name, description: notebook.description },
    context: [{ id: `source:${source.id}`, title: source.title, content: source.content }],
    transformation: { title: t.title, prompt: t.prompt },
  });
  return { id: newId('i'), transformationId: t.id, title: t.title, content: out.content, createdAt: nowIso() };
}

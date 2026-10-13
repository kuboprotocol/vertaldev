import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  ArrowLeft, BookOpen, Coins, Download, Eye, FileText, ImagePlus, Languages, Loader2, Pencil, Plus,
  Save, Sparkles, SpellCheck, Trash2, Wand2, ChevronUp, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  EBOOK_ADDON_CREDITS, EBOOK_DEFAULT_CHAPTERS, EBOOK_LAUNCH_DISCOUNT_PERCENT, EBOOK_MAX_CHAPTERS, EBOOK_MIN_CHAPTERS, ebookCost,
} from "@/config/ebookPricing";
import { EBOOK_EDITOR_MAX_CHAPTERS, ebookToMarkdown, markdownToEbook, type EbookChapter, type EbookDoc } from "@/lib/ebook/ebookDoc";
import { downloadBlob, ebookFileName, exportDocx, exportEpub, exportPdf } from "@/lib/ebook/ebookExport";

const LANGUAGES = ["pt-BR", "en-US", "es-ES", "fr-FR", "de-DE", "it-IT", "ja-JP", "zh-CN"];

interface EbookAsset {
  id: string;
  created_at: string;
  prompt: string | null;
  output_text: string | null;
  output_url: string | null;
  metadata: Record<string, unknown>;
}

function assetToDoc(a: EbookAsset): EbookDoc {
  const m = a.metadata ?? {};
  if (m.doc && typeof m.doc === "object" && Array.isArray((m.doc as EbookDoc).chapters)) return m.doc as EbookDoc;
  return markdownToEbook(a.output_text ?? "", {
    title: typeof m.title === "string" ? m.title : a.prompt ?? undefined,
    language: typeof m.language === "string" ? m.language : "pt-BR",
    cover: a.output_url,
  });
}

async function invokeFn<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch { /* corpo não-JSON */ }
    if (/deduction_failed|insufficient/i.test(msg)) msg = "Créditos insuficientes";
    throw new Error(msg);
  }
  return data as T;
}

export function EbookStudio() {
  const [open, setOpen] = useState<EbookAsset | null>(null);
  const [assets, setAssets] = useState<EbookAsset[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadAssets = useCallback(async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("creative_assets")
      .select("id, created_at, prompt, output_text, output_url, metadata")
      .eq("tool", "ebook")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error("Não foi possível carregar seus e-books", { description: error.message });
    setAssets((data ?? []) as EbookAsset[]);
    setLoadingList(false);
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const openById = async (id: string) => {
    const { data } = await supabase.from("creative_assets").select("id, created_at, prompt, output_text, output_url, metadata").eq("id", id).maybeSingle();
    if (data) setOpen(data as EbookAsset);
    loadAssets();
  };

  if (open) {
    return (
      <EbookEditor
        key={open.id}
        asset={open}
        onBack={() => { setOpen(null); loadAssets(); }}
        onOpenAsset={openById}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CreateEbookCard onCreated={openById} />

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <h4 className="text-xs font-bold uppercase tracking-widest">Meus e-books</h4>
        </div>
        {loadingList ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não criou nenhum e-book.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {assets.map((a) => {
              const doc = assetToDoc(a);
              return (
                <button
                  key={a.id}
                  onClick={() => setOpen(a)}
                  className="text-left rounded-xl overflow-hidden border border-border/10 bg-background/30 hover:border-primary/40 transition-all group"
                >
                  <div className="aspect-[2/3] bg-gradient-to-br from-primary/20 via-background to-background flex items-center justify-center overflow-hidden">
                    {doc.cover ? (
                      <img src={doc.cover} alt={doc.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    ) : (
                      <BookOpen className="h-10 w-10 text-primary/50" />
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-semibold line-clamp-2">{doc.title}</p>
                    <p className="text-[11px] text-muted-foreground">{doc.chapters.length} capítulos · {doc.language} · {new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateEbookCard({ onCreated }: { onCreated: (assetId: string) => void }) {
  const [topic, setTopic] = useState("");
  const [chapters, setChapters] = useState(EBOOK_DEFAULT_CHAPTERS);
  const [language, setLanguage] = useState("pt-BR");
  const [busy, setBusy] = useState(false);
  const price = ebookCost(chapters);

  const create = async () => {
    if (!topic.trim()) return toast.error("Descreva o tema do e-book");
    setBusy(true);
    try {
      const data = await invokeFn<{ asset_id?: string; credits: number }>("creative-ebook", { topic, chapters, language });
      toast.success("E-book criado!", { description: `${data.credits} créditos usados. Abrindo o editor…` });
      setTopic("");
      if (data.asset_id) onCreated(data.asset_id);
    } catch (e) {
      toast.error("Falha ao criar e-book", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6 bg-background/40 backdrop-blur-xl border-primary/10 relative overflow-hidden shadow-2xl">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><BookOpen className="h-6 w-6" /></div>
        <div>
          <h3 className="text-lg font-orbitron font-bold tracking-tight">Vertal Ebook Engine</h3>
          <p className="text-sm text-muted-foreground">Crie → edite → aprimore → publique. Editar e exportar é grátis.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Tema do e-book</Label>
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Guia definitivo de marketing digital para pequenos negócios em 2026…"
            className="min-h-[110px] bg-background/50 border-border/10 resize-none text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Capítulos: {chapters}</Label>
            <Slider value={[chapters]} min={EBOOK_MIN_CHAPTERS} max={EBOOK_MAX_CHAPTERS} step={1} onValueChange={([v]) => setChapters(v)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Idioma</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="bg-background/50 border-border/10 h-10"><SelectValue /></SelectTrigger>
              <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/60 border border-border/10 w-fit">
            <Coins className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold text-amber-500/90 flex items-center gap-1.5">
              {price.tier.label}: <span className="line-through opacity-50 font-normal">{price.listCredits}</span> {price.credits} créditos
              <Badge variant="secondary" className="text-[9px] h-4">-{EBOOK_LAUNCH_DISCOUNT_PERCENT}% lançamento</Badge>
            </span>
          </div>
          <Button onClick={create} disabled={busy} className="font-bold font-orbitron px-8 h-12">
            {busy ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Sparkles className="h-5 w-5 mr-2" />}
            {busy ? "ESCREVENDO… (1–2 min)" : "CRIAR E-BOOK"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

type PaidAction = "new_chapter" | "rewrite_chapter" | "cover" | "illustration" | "review" | "translate";

const ACTION_INFO: Record<PaidAction, { label: string; credits: number; icon: typeof Wand2; hint: string }> = {
  new_chapter: { label: "Novo capítulo com IA", credits: EBOOK_ADDON_CREDITS.newChapter, icon: Plus, hint: "Título e/ou instruções (opcional)" },
  rewrite_chapter: { label: "Reescrever capítulo", credits: EBOOK_ADDON_CREDITS.rewriteChapter, icon: Wand2, hint: "Ex.: mais exemplos práticos, tom mais leve…" },
  cover: { label: "Nova capa com IA", credits: EBOOK_ADDON_CREDITS.cover, icon: ImagePlus, hint: "Estilo da capa (opcional): minimalista, fotográfico…" },
  illustration: { label: "Ilustração do capítulo", credits: EBOOK_ADDON_CREDITS.illustrations, icon: ImagePlus, hint: "Descreva a cena (opcional)" },
  review: { label: "Revisão completa", credits: EBOOK_ADDON_CREDITS.fullReview, icon: SpellCheck, hint: "Observações para o revisor (opcional)" },
  translate: { label: "Traduzir livro", credits: EBOOK_ADDON_CREDITS.translation, icon: Languages, hint: "" },
};

function EbookEditor({ asset, onBack, onOpenAsset }: { asset: EbookAsset; onBack: () => void; onOpenAsset: (id: string) => void }) {
  const [doc, setDoc] = useState<EbookDoc>(() => assetToDoc(asset));
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<PaidAction | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [dialog, setDialog] = useState<PaidAction | null>(null);
  const [instruction, setInstruction] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en-US");

  const chapter = doc.chapters[sel] ?? doc.chapters[0];
  const words = useMemo(() => doc.chapters.reduce((n, c) => n + (c.content.match(/\S+/g)?.length ?? 0), 0), [doc]);

  const update = (next: EbookDoc) => { setDoc(next); setDirty(true); };
  const updateChapter = (i: number, patch: Partial<EbookChapter>) =>
    update({ ...doc, chapters: doc.chapters.map((c, k) => (k === i ? { ...c, ...patch } : c)) });

  const save = useCallback(async (d: EbookDoc, silent = false) => {
    setSaving(true);
    const metadata = { ...(asset.metadata ?? {}), doc: d, title: d.title, chapters: d.chapters.length, cover: d.cover ?? null, language: d.language };
    const { error } = await supabase
      .from("creative_assets")
      .update({ output_text: ebookToMarkdown(d), output_url: d.cover ?? null, metadata: metadata as unknown as Json })
      .eq("id", asset.id);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    setDirty(false);
    if (!silent) toast.success("E-book salvo");
  }, [asset]);

  const runAction = async (action: PaidAction) => {
    setDialog(null);
    setBusy(action);
    try {
      const body: Record<string, unknown> = { action, doc, index: sel, instruction, asset_id: asset.id };
      if (action === "new_chapter") { body.title = newTitle; body.position = sel + 1; }
      if (action === "translate") body.target_language = targetLanguage;
      const r = await invokeFn<{ credits: number; chapter?: EbookChapter; position?: number; cover?: string; image_url?: string; chapters?: EbookChapter[]; asset_id?: string }>("creative-ebook-edit", body);

      let next = doc;
      if (action === "new_chapter" && r.chapter) {
        const pos = r.position ?? doc.chapters.length;
        next = { ...doc, chapters: [...doc.chapters.slice(0, pos), r.chapter, ...doc.chapters.slice(pos)] };
        setSel(pos);
      } else if (action === "rewrite_chapter" && r.chapter) {
        next = { ...doc, chapters: doc.chapters.map((c, k) => (k === sel ? { ...c, content: r.chapter!.content } : c)) };
      } else if (action === "cover" && r.cover) {
        next = { ...doc, cover: r.cover };
      } else if (action === "illustration" && r.image_url) {
        next = { ...doc, chapters: doc.chapters.map((c, k) => (k === sel ? { ...c, content: `![Ilustração — ${c.title}](${r.image_url})\n\n${c.content}` } : c)) };
      } else if (action === "review" && r.chapters) {
        next = { ...doc, chapters: r.chapters };
      }

      if (action === "translate") {
        toast.success(`Tradução pronta (${r.credits} créditos)`, { description: "Uma cópia traduzida foi criada em Meus e-books." });
        if (dirty) await save(doc, true);
        if (r.asset_id) onOpenAsset(r.asset_id);
      } else {
        setDoc(next);
        await save(next, true); // recurso pago: salva na hora para não perder o resultado
        toast.success(`${ACTION_INFO[action].label} concluído`, { description: `${r.credits} créditos usados` });
      }
    } catch (e) {
      toast.error(`Falha: ${ACTION_INFO[action].label}`, { description: (e as Error).message });
    } finally {
      setBusy(null);
      setInstruction("");
      setNewTitle("");
    }
  };

  const doExport = async (kind: "epub" | "pdf" | "docx") => {
    setExporting(kind);
    try {
      const blob = kind === "epub" ? await exportEpub(doc) : kind === "pdf" ? await exportPdf(doc) : await exportDocx(doc);
      downloadBlob(blob, ebookFileName(doc, kind));
    } catch (e) {
      toast.error("Falha ao exportar", { description: (e as Error).message });
    } finally {
      setExporting(null);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= doc.chapters.length) return;
    const chapters = [...doc.chapters];
    [chapters[i], chapters[j]] = [chapters[j], chapters[i]];
    update({ ...doc, chapters });
    setSel(j);
  };

  const remove = (i: number) => {
    if (doc.chapters.length <= 1) return;
    if (!confirm(`Excluir o capítulo "${doc.chapters[i].title}"?`)) return;
    update({ ...doc, chapters: doc.chapters.filter((_, k) => k !== i) });
    setSel(Math.max(0, i - 1));
  };

  const addBlank = () => {
    if (doc.chapters.length >= EBOOK_EDITOR_MAX_CHAPTERS) return toast.error(`Máximo de ${EBOOK_EDITOR_MAX_CHAPTERS} capítulos`);
    update({ ...doc, chapters: [...doc.chapters, { title: "Novo capítulo", content: "" }] });
    setSel(doc.chapters.length);
  };

  const ActionButton = ({ action, className }: { action: PaidAction; className?: string }) => {
    const info = ACTION_INFO[action];
    const Icon = info.icon;
    return (
      <Button variant="outline" size="sm" disabled={!!busy} onClick={() => setDialog(action)} className={cn("justify-between gap-2", className)}>
        <span className="flex items-center gap-2">{busy === action ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{info.label}</span>
        <Badge variant="secondary" className="text-[10px] h-5">{info.credits} cr</Badge>
      </Button>
    );
  };

  const dialogInfo = dialog ? ACTION_INFO[dialog] : null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => { if (!dirty || confirm("Sair sem salvar as alterações?")) onBack(); }}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Meus e-books
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{doc.chapters.length} capítulos · {words.toLocaleString()} palavras</span>
          {(["epub", "pdf", "docx"] as const).map((k) => (
            <Button key={k} variant="outline" size="sm" disabled={!!exporting} onClick={() => doExport(k)}>
              {exporting === k ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}{k.toUpperCase()}
            </Button>
          ))}
          <Button size="sm" disabled={!dirty || saving} onClick={() => save(doc)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}{dirty ? "Salvar" : "Salvo"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_240px] gap-4">
        {/* Capa + capítulos */}
        <Card className="p-3 bg-background/40 border-border/10 space-y-3 h-fit">
          <div className="aspect-[2/3] rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-background flex items-center justify-center">
            {doc.cover ? <img src={doc.cover} alt="Capa" className="w-full h-full object-cover" /> : <BookOpen className="h-10 w-10 text-primary/50" />}
          </div>
          <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
            {doc.chapters.map((c, i) => (
              <div key={i} className={cn("group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer", i === sel ? "bg-primary/15 text-primary" : "hover:bg-muted/40")} onClick={() => setSel(i)}>
                <span className="text-[10px] opacity-50 w-5">{i + 1}</span>
                <span className="flex-1 truncate">{c.title || "Sem título"}</span>
                <span className="hidden group-hover:flex items-center">
                  <button onClick={(e) => { e.stopPropagation(); move(i, -1); }} aria-label="Subir"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); move(i, 1); }} aria-label="Descer"><ChevronDown className="h-3.5 w-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); remove(i); }} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                </span>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="w-full" onClick={addBlank}><Plus className="h-4 w-4 mr-1" /> Capítulo em branco (grátis)</Button>
        </Card>

        {/* Editor */}
        <Card className="p-4 bg-background/40 border-border/10 space-y-3 min-w-0">
          <Input value={doc.title} onChange={(e) => update({ ...doc, title: e.target.value })} className="text-xl font-bold font-orbitron bg-transparent border-border/10" placeholder="Título do livro" />
          <Input value={doc.subtitle ?? ""} onChange={(e) => update({ ...doc, subtitle: e.target.value })} className="text-sm italic bg-transparent border-border/10" placeholder="Subtítulo" />
          <div className="border-t border-border/10 pt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Capítulo {sel + 1}</span>
            <Input value={chapter.title} onChange={(e) => updateChapter(sel, { title: e.target.value })} className="font-semibold bg-transparent border-border/10" />
            <Button variant="ghost" size="icon" onClick={() => setPreview((p) => !p)} aria-label={preview ? "Editar" : "Visualizar"}>
              {preview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {preview ? (
            <div className="min-h-[480px] text-sm leading-relaxed space-y-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_img]:rounded-lg [&_img]:w-full [&_a]:text-primary [&_a]:underline">
              <ReactMarkdown>{chapter.content}</ReactMarkdown>
            </div>
          ) : (
            <Textarea
              value={chapter.content}
              onChange={(e) => updateChapter(sel, { content: e.target.value })}
              className="min-h-[480px] bg-background/50 border-border/10 font-mono text-[13px] leading-relaxed"
              placeholder="Escreva em markdown: ## subtítulo, **negrito**, *itálico*, - listas…"
            />
          )}
        </Card>

        {/* Recursos de IA */}
        <Card className="p-3 bg-background/40 border-border/10 space-y-2 h-fit">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary/80 flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Recursos de IA</p>
          <p className="text-[10px] uppercase opacity-50 pt-1">Este capítulo</p>
          <ActionButton action="rewrite_chapter" className="w-full" />
          <ActionButton action="illustration" className="w-full" />
          <p className="text-[10px] uppercase opacity-50 pt-2">Livro</p>
          <ActionButton action="new_chapter" className="w-full" />
          <ActionButton action="cover" className="w-full" />
          <ActionButton action="review" className="w-full" />
          <ActionButton action="translate" className="w-full" />
          <p className="text-[10px] text-muted-foreground pt-2 flex items-start gap-1"><FileText className="h-3 w-3 mt-0.5 shrink-0" /> Edição manual e exportação EPUB, PDF e DOCX são sempre grátis.</p>
        </Card>
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogInfo?.label}</DialogTitle>
            <DialogDescription>
              Custa {dialogInfo?.credits} créditos{dialog === "rewrite_chapter" || dialog === "illustration" ? ` · capítulo ${sel + 1}: ${chapter.title}` : ""}.
              {dialog === "review" && " Revisa todos os capítulos (gramática, clareza e fluidez)."}
              {dialog === "translate" && " Cria uma cópia traduzida; o original não muda."}
              {dialog === "new_chapter" && ` Entra depois do capítulo ${sel + 1}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {dialog === "new_chapter" && <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Título do capítulo (opcional)" />}
            {dialog === "translate" ? (
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGUAGES.filter((l) => l !== doc.language).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={dialogInfo?.hint} className="min-h-[90px]" />
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={() => dialog && runAction(dialog)}>
              <Coins className="h-4 w-4 mr-1" /> Usar {dialogInfo?.credits} créditos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

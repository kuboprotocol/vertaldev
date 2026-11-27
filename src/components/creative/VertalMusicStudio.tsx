// Vertal Music AI · painel de criação de música (porte do Studio da MusKAI para o design do Vertal Dev).
// Super prompt + Vibe DNA + letra Auto/Assistida/Pronta → edge function creative-music (assíncrona).
// Preço: 1 crédito por música; se a geração falhar, o crédito volta automaticamente.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Music, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { functionErrorCode } from "@/lib/functionError";
import {
  MUSIC_STUDIO_COST, MUSIC_STUDIO_KEYS, MUSIC_STUDIO_LANGUAGES, MUSIC_STUDIO_MOODS,
  MUSIC_STUDIO_VOCAL_TONES, MUSIC_STUDIO_VOCAL_TYPES, musicErrorMessage, musicStage, type MusicJobView, type StudioLyricsMode,
} from "./vertalMusicStudio";
import {
  buildSuperPrompt, normalizeMusicRequest, type MusicRequest,
} from "../../../supabase/functions/_shared/music/vertalMusicCore";
import { musicStyleOptions } from "../../../supabase/functions/_shared/music/worldGenres";

const MUSIC_STYLE_OPTIONS = musicStyleOptions();
// "Usar minha voz" (Clonador de voz): não renderiza nada para contas fora da flag.
import { MusicVoiceClone } from "./MusicVoiceClone";

const POLL_MS = 5000;
const ETA_SECONDS = 90;

async function call<T>(body: Record<string, unknown>, idem?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("creative-music", {
    body,
    headers: idem ? { "X-Idempotency-Key": idem } : undefined,
  });
  if (error) {
    let msg = "";
    let code = "";
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.clone().json() : null;
      msg = j?.error ?? "";
      code = j?.code ?? "";
    } catch { /* sem corpo */ }
    if (!msg) code = (await functionErrorCode(error)) ?? "";
    throw new Error(musicErrorMessage(msg, code));
  }
  return data as T;
}

function SliderRow({ label, value, onChange, min = 0, max = 100, hint }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold uppercase tracking-wider opacity-60">{label}</span>
        <span className="font-mono tabular-nums text-primary">{value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={1} onValueChange={(v) => onChange(v[0] ?? value)} aria-label={label} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function VertalMusicStudio() {
  const { editsRemaining, refetch } = useSubscription();

  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("Pop");
  const [mood, setMood] = useState("Esperançoso");
  const [language, setLanguage] = useState("Português");
  const [energy, setEnergy] = useState(70);
  const [tempo, setTempo] = useState(110);
  const [depth, setDepth] = useState(60);
  const [punch, setPunch] = useState(65);
  const [space, setSpace] = useState(55);
  const [texture, setTexture] = useState(40);
  const [vocalType, setVocalType] = useState("Feminino");
  const [vocalTone, setVocalTone] = useState("Suave");
  const [musicKey, setMusicKey] = useState("C major");
  const [primary, setPrimary] = useState("violão, bateria, baixo");
  const [secondary, setSecondary] = useState("pads, cordas");
  const [lyricsMode, setLyricsMode] = useState<StudioLyricsMode>("assist");
  const [lyricsInput, setLyricsInput] = useState("Música sobre recomeçar e acreditar nos sonhos");
  const [reference, setReference] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<MusicJobView | null>(null);
  const [history, setHistory] = useState<MusicJobView[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  const request: MusicRequest = useMemo(() => ({
    title, style, mood, energy, tempo, music_key: musicKey, language,
    vocal_type: vocalType, vocal_tone: vocalTone, instruments_primary: primary, instruments_secondary: secondary,
    lyrics_mode: lyricsMode, lyrics_input: lyricsMode === "auto" ? "" : lyricsInput, reference,
    vibe_dna: { depth, punch, space, texture },
  }), [title, style, mood, energy, tempo, musicKey, language, vocalType, vocalTone, primary, secondary, lyricsMode, lyricsInput, reference, depth, punch, space, texture]);
  const superPrompt = useMemo(() => buildSuperPrompt(normalizeMusicRequest(request)), [request]);

  const generating = submitting || job?.status === "processing";
  const noCredits = editsRemaining < MUSIC_STUDIO_COST;

  const loadHistory = useCallback(async () => {
    try {
      const r = await call<{ items: MusicJobView[] }>({ action: "history" });
      setHistory(r.items ?? []);
    } catch { /* histórico é opcional */ }
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Retoma uma geração em andamento (ex.: recarregou a página).
  // Isto NÃO inicia música nova: só volta a acompanhar uma que já estava em andamento (pedida antes no Studio
  // ou pelo Vertal Chat). O aviso abaixo deixa isso claro, para não parecer que abrir o painel gerou uma música.
  const [resumed, setResumed] = useState(false);
  useEffect(() => {
    if (!job && history[0]?.status === "processing") {
      setJob(history[0]);
      setResumed(true);
    }
  }, [history, job]);

  useEffect(() => {
    if (!generating) { setElapsed(0); startedAt.current = null; return; }
    startedAt.current = startedAt.current ?? Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000)), 500);
    return () => clearInterval(t);
  }, [generating]);

  useEffect(() => {
    if (!job || job.status !== "processing") return;
    let stop = false;
    const t = setInterval(async () => {
      try {
        const st = await call<MusicJobView>({ action: "status", asset_id: job.asset_id });
        if (stop) return;
        if (st.status === "completed") {
          setJob(st);
          toast.success("Sua música está pronta!", { id: "music-gen" });
          void loadHistory();
          void refetch();
        } else if (st.status === "failed") {
          setJob(st);
          toast.error("A geração falhou", { id: "music-gen", description: st.refunded ? "O crédito foi devolvido." : undefined });
          void loadHistory();
          void refetch();
        }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [job, loadHistory, refetch]);

  const handleGenerate = async () => {
    if (generating) return;
    if (noCredits) { toast.error(`Créditos insuficientes: cada música usa ${MUSIC_STUDIO_COST} crédito.`); return; }
    if (lyricsMode === "paste" && lyricsInput.trim().length < 8 && vocalType !== "Sem vocal") {
      toast.error("Cole a letra completa ou troque o modo da letra."); return;
    }
    setSubmitting(true);
    setResumed(false);
    setJob(null);
    startedAt.current = Date.now();
    toast.loading("Compondo no Vertal Music Engine…", { id: "music-gen", description: "Leva de 1 a 3 minutos." });
    try {
      const r = await call<{ asset_id: string; title: string; lyrics: string; provider: string }>(
        { action: "generate", ...request }, crypto.randomUUID(),
      );
      setJob({ ok: true, asset_id: r.asset_id, status: "processing", title: r.title, lyrics: r.lyrics, provider: r.provider, items: [] });
      toast.loading("Compondo no Vertal Music Engine…", { id: "music-gen", description: `"${r.title}" · ${MUSIC_STUDIO_COST} crédito` });
      void refetch();
    } catch (e) {
      toast.error("Erro na geração", { id: "music-gen", description: e instanceof Error ? e.message : String(e), duration: 10000 });
    } finally {
      setSubmitting(false);
    }
  };

  const stage = musicStage(job, submitting);
  const pct = stage === "done" ? 100 : stage === "processing" ? Math.min(90, 20 + Math.round((elapsed / ETA_SECONDS) * 70)) : 8;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" data-testid="vertal-music-studio">
      <div className="text-center space-y-2">
        <h2 className="text-2xl md:text-3xl font-orbitron font-bold tracking-tight">
          Vertal Music <span className="text-primary">Studio</span>
        </h2>
        <p className="text-sm text-muted-foreground">Construa o super prompt. Ajuste o DNA. Gere sua música.</p>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {editsRemaining} créditos disponíveis · {MUSIC_STUDIO_COST} crédito por música · crédito devolvido se a geração falhar
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
        {/* CONTROLES */}
        <Card className="p-6 bg-background/40 backdrop-blur-xl border-primary/10 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="music-title" className="text-xs font-bold uppercase tracking-wider opacity-60">Título da música</Label>
              <Badge variant={title.trim() ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">{title.trim() ? "Personalizado" : "Auto"}</Badge>
            </div>
            <Input id="music-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Fogo do Céu (opcional)" maxLength={80} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Estilo</Label>
              {/* Ritmo/gênero: busca no catálogo do mundo (samba, forró, amapiano, k-pop, qawwali…) ou texto livre. */}
              <Input
                aria-label="Estilo"
                list="vertal-music-styles"
                value={style}
                maxLength={80}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="Busque ou escreva: samba, forró, amapiano, k-pop, fado…"
              />
              <datalist id="vertal-music-styles">
                {MUSIC_STYLE_OPTIONS.map((o) => <option key={o.name} value={o.name}>{o.region}</option>)}
              </datalist>
              <p className="text-[11px] text-muted-foreground">{MUSIC_STYLE_OPTIONS.length}+ ritmos do Brasil e do mundo, ou escreva o seu.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Mood</Label>
              <Select value={mood} onValueChange={setMood}>
                <SelectTrigger aria-label="Mood"><SelectValue /></SelectTrigger>
                <SelectContent>{MUSIC_STUDIO_MOODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SliderRow label="Energia" value={energy} onChange={setEnergy} />
            <SliderRow label="Tempo (BPM)" value={tempo} onChange={setTempo} min={60} max={200} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-orbitron font-semibold">Vibe DNA</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 p-5 rounded-xl bg-primary/5 border border-primary/20">
              <SliderRow label="Depth" value={depth} onChange={setDepth} hint="Profundidade / ambiência" />
              <SliderRow label="Punch" value={punch} onChange={setPunch} hint="Impacto da batida" />
              <SliderRow label="Space" value={space} onChange={setSpace} hint="Aberto vs fechado" />
              <SliderRow label="Texture" value={texture} onChange={setTexture} hint="Analógico vs digital" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Vocal</Label>
              <Select value={vocalType} onValueChange={setVocalType}>
                <SelectTrigger aria-label="Vocal"><SelectValue /></SelectTrigger>
                <SelectContent>{MUSIC_STUDIO_VOCAL_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Tom vocal</Label>
              <Select value={vocalTone} onValueChange={setVocalTone} disabled={vocalType === "Sem vocal"}>
                <SelectTrigger aria-label="Tom vocal"><SelectValue /></SelectTrigger>
                <SelectContent>{MUSIC_STUDIO_VOCAL_TONES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Tonalidade (key)</Label>
              <Select value={musicKey} onValueChange={setMusicKey}>
                <SelectTrigger aria-label="Tonalidade"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">{MUSIC_STUDIO_KEYS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger aria-label="Idioma"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">{MUSIC_STUDIO_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Instrumentos principais</Label>
              <Input value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="ex: 808, coral, piano" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Instrumentos secundários</Label>
              <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} placeholder="ex: strings, pads, fx" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Letra</Label>
            <Tabs value={lyricsMode} onValueChange={(v) => setLyricsMode(v as StudioLyricsMode)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="auto">Auto</TabsTrigger>
                <TabsTrigger value="assist">Assistido</TabsTrigger>
                <TabsTrigger value="paste">Letra pronta</TabsTrigger>
              </TabsList>
              <TabsContent value="auto" className="mt-3 text-sm text-muted-foreground p-4 rounded-lg bg-muted/30 border border-border/30">
                A IA cria toda a letra com base no estilo, mood e DNA.
              </TabsContent>
              <TabsContent value="assist" className="mt-3">
                <Textarea value={lyricsInput} onChange={(e) => setLyricsInput(e.target.value)} placeholder="Ex: música sobre superação e fé" className="min-h-[90px] bg-background/50 resize-none" />
              </TabsContent>
              <TabsContent value="paste" className="mt-3">
                <Textarea value={lyricsInput} onChange={(e) => setLyricsInput(e.target.value)} placeholder={"[verse]\nCole sua letra aqui...\n[chorus]\n..."} className="min-h-[140px] font-mono text-sm bg-background/50" />
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Referência (opcional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder='Ex: "tipo aquele beat espiritual com coral feminino"' />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || noCredits}
            className="w-full h-14 text-base font-semibold rounded-2xl"
            data-testid="vertal-music-generate"
          >
            {generating
              ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Compondo…</>
              : <><Music className="w-5 h-5 mr-2" /> Criar Música <span className="ml-2 text-xs opacity-80 font-normal">· {MUSIC_STUDIO_COST} crédito</span></>}
          </Button>
          {noCredits && <p role="alert" className="text-xs text-destructive text-center">Créditos insuficientes para gerar.</p>}
        </Card>

        {/* SUPER PROMPT + RESULTADO */}
        <div className="space-y-6">
          <Card className="p-6 bg-background/40 backdrop-blur-xl border-primary/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-orbitron font-semibold flex items-center gap-2"><Wand2 className="w-4 h-4 text-primary" /> Super Prompt</h3>
              <span className="text-xs text-muted-foreground">Vertal Music Engine</span>
            </div>
            <pre className="text-xs leading-relaxed font-mono text-muted-foreground bg-background/60 border border-border/30 rounded-xl p-4 max-h-[340px] overflow-auto whitespace-pre-wrap">{superPrompt}</pre>
          </Card>

          <Card className="p-6 bg-background/40 backdrop-blur-xl border-primary/10 min-h-[200px]">
            <h3 className="font-orbitron font-semibold mb-4 flex items-center gap-2"><Music className="w-4 h-4 text-primary" /> Resultado</h3>

            {!job && !submitting && (
              <div className="text-sm text-muted-foreground text-center py-10 border border-dashed border-border/40 rounded-xl">
                Sua música aparecerá aqui.
              </div>
            )}

            {generating && (
              <div className="flex flex-col items-center py-6 gap-4" data-testid="vertal-music-progress">
                {resumed && !submitting && (
                  <p className="text-xs text-muted-foreground text-center" data-testid="vertal-music-resumed">
                    Acompanhando uma música que já estava sendo gerada{job?.title ? ` ("${job.title}")` : ""}. Abrir o painel não cria nem cobra música nova.
                  </p>
                )}
                <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
                <div className="w-full max-w-xs space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{stage === "sending" ? "Enviando seu pedido" : "Compondo sua música"}</span>
                    <span className="font-mono text-muted-foreground tabular-nums">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono tabular-nums">
                    <span>decorrido {fmt(elapsed)}</span>
                    <span>{elapsed < ETA_SECONDS ? `~${fmt(ETA_SECONDS - elapsed)} restantes` : "quase lá…"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {(["sending", "processing", "done"] as const).map((s, i) => {
                      const order = ["sending", "processing", "done"];
                      const cur = order.indexOf(stage);
                      return (
                        <div key={s} className="flex-1 flex flex-col items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${i < cur ? "bg-primary" : i === cur ? "bg-primary animate-pulse" : "bg-muted"}`} />
                          <span className={`text-[10px] ${i === cur ? "text-foreground" : "text-muted-foreground"}`}>{["Enviando", "Processando", "Finalizando"][i]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {job?.status === "failed" && (
              <div role="alert" className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-sm space-y-2">
                <p className="font-medium">Não foi possível gerar "{job.title}".</p>
                <p className="text-muted-foreground">{job.refunded ? "O crédito foi devolvido ao seu saldo." : "Nenhum crédito foi cobrado."}</p>
                <Button size="sm" variant="outline" onClick={handleGenerate}><RotateCcw className="w-4 h-4 mr-2" /> Tentar novamente</Button>
              </div>
            )}

            {job?.status === "completed" && (
              <div className="space-y-3" data-testid="vertal-music-result">
                {job.items.map((it, i) => (
                  <div key={`${job.asset_id}-${i}`} className="p-4 rounded-xl bg-background/60 border border-border/30 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{job.items.length > 1 ? `${i === 0 ? "A" : "B"} · ` : ""}{it.title || job.title}</p>
                        <p className="text-[11px] text-muted-foreground">{[job.style, job.mood].filter(Boolean).join(" · ")}</p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <a href={it.audio_url} download={`${(job.title || "musica").replace(/[^\w\s-]/g, "").trim() || "musica"}.mp3`} target="_blank" rel="noreferrer">
                          <Download className="w-4 h-4 mr-1" /> MP3
                        </a>
                      </Button>
                    </div>
                    <audio controls preload="metadata" src={it.audio_url} className="w-full" />
                    <MusicVoiceClone audioUrl={it.audio_url} title={it.title || job.title} autoId={i === 0 ? job.asset_id : undefined} />
                  </div>
                ))}
                {job.lyrics && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Ver letra</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">{job.lyrics}</pre>
                  </details>
                )}
              </div>
            )}
          </Card>

          {history.filter((h) => h.status === "completed" && h.asset_id !== job?.asset_id).length > 0 && (
            <Card className="p-6 bg-background/40 backdrop-blur-xl border-primary/10">
              <h3 className="font-orbitron font-semibold mb-3 text-sm">Últimas músicas</h3>
              <div className="space-y-3">
                {history.filter((h) => h.status === "completed" && h.asset_id !== job?.asset_id).slice(0, 5).map((h) => (
                  <div key={h.asset_id} className="space-y-1">
                    <p className="text-xs font-medium truncate">{h.title}</p>
                    {h.items[0]?.audio_url && <audio controls preload="none" src={h.items[0].audio_url} className="w-full h-9" />}
                    {h.items[0]?.audio_url && <MusicVoiceClone audioUrl={h.items[0].audio_url} title={h.title} />}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default VertalMusicStudio;

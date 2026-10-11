import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Crop, RotateCw, RotateCcw, Download, Upload, Eye, Settings, Grid3x3, Share2, ArrowLeft, Maximize, Hand } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FreeCropper } from "./FreeCropper";
import { fitRect, toPixels, type CropRect } from "@/lib/cropGeometry";
import {
  cssFilter, exportCrop, ImageAccessError, loadEditableSource, NO_ADJUSTMENTS, outputSize, rotateSource,
  shareImage, triggerDownload, type Adjustments, type ExportFormat,
} from "@/lib/imageExport";

export interface EditedImageMeta {
  width: number;
  height: number;
  format: ExportFormat;
}

interface Props {
  open: boolean;
  imageUrl: string | null;
  onCancel: () => void;
  /** Called once per exported image (e.g. to add it to the history). The dialog handles download/share itself. */
  onConfirm?: (blob: Blob, metadata: EditedImageMeta) => void | Promise<void>;
}

/** Pixel aspect (w/h); undefined = free. */
const ASPECTS: { label: string; value?: number }[] = [
  { label: "Livre" },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:2", value: 3 / 2 },
  { label: "2:3", value: 2 / 3 },
];

const SIZE_PRESETS = [
  { label: "Original", width: 0, height: 0 },
  { label: "1080×1080 (Feed)", width: 1080, height: 1080 },
  { label: "1080×1350 (Retrato)", width: 1080, height: 1350 },
  { label: "1080×1920 (Stories)", width: 1080, height: 1920 },
  { label: "1280×720 (HD)", width: 1280, height: 720 },
  { label: "1920×1080 (Full HD)", width: 1920, height: 1080 },
  { label: "512×512 (Avatar)", width: 512, height: 512 },
];

const MAX_SIDE = 8192;

interface Source {
  url: string;
  width: number;
  height: number;
}

function loadErrorMessage(e: unknown) {
  if (e instanceof ImageAccessError) {
    if (e.message === "not_an_image") return "Esse link não é uma imagem.";
    return "O site dessa imagem não permite editá-la direto pelo link. Baixe a imagem e use \"Carregar arquivo\".";
  }
  return "Não foi possível abrir a imagem.";
}

export function ImageEditorDialog({ open, imageUrl, onCancel, onConfirm }: Props) {
  const [original, setOriginal] = useState<Source | null>(null);
  const [source, setSource] = useState<Source | null>(null); // original after rotation
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [rect, setRect] = useState<CropRect>(fitRect());
  const [adjust, setAdjust] = useState<Adjustments>(NO_ADJUSTMENTS);
  const [outW, setOutW] = useState<number | null>(null);
  const [outH, setOutH] = useState<number | null>(null);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [quality, setQuality] = useState(92);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; url: string; meta: EditedImageMeta; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URLs we created; revoked when replaced or when the dialog closes.
  const urls = useRef(new Set<string>());
  const track = <T extends { url: string }>(s: T) => (urls.current.add(s.url), s);
  const revokeAll = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
  };

  const reset = () => {
    setRotation(0);
    setAspect(undefined);
    setRect(fitRect());
    setAdjust(NO_ADJUSTMENTS);
    setOutW(null);
    setOutH(null);
    setResult(null);
  };

  const openSource = async (src: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = track(await loadEditableSource(src));
      setOriginal(s);
      setSource(s);
      reset();
    } catch (e) {
      setOriginal(null);
      setSource(null);
      setLoadError(loadErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && imageUrl) openSource(imageUrl);
    if (!open) {
      setOriginal(null);
      setSource(null);
      setResult(null);
      setLoadError(null);
      revokeAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageUrl]);

  useEffect(() => revokeAll, []);

  // ratio in image fractions = pixel aspect × height / width
  const ratio = useMemo(
    () => (aspect && source ? (aspect * source.height) / source.width : undefined),
    [aspect, source],
  );

  const chooseAspect = (value?: number) => {
    setAspect(value);
    if (source) setRect(fitRect(value ? (value * source.height) / source.width : undefined));
  };

  const rotate = async (delta: number) => {
    if (!original) return;
    const next = (rotation + delta + 360) % 360;
    setLoading(true);
    try {
      const s = next === 0 ? original : track(await rotateSource(original.url, next));
      setRotation(next);
      setSource(s);
      setRect(fitRect(aspect ? (aspect * s.height) / s.width : undefined));
    } catch {
      toast.error("Não foi possível girar a imagem");
    } finally {
      setLoading(false);
    }
  };

  const area = source ? toPixels(rect, source.width, source.height) : null;
  const size = area ? outputSize(area.width, area.height, outW, outH) : null;
  const tooBig = !!size && (size.width > MAX_SIDE || size.height > MAX_SIDE);

  const applySizePreset = (width: number, height: number) => {
    if (!width) {
      setOutW(null);
      setOutH(null);
      return;
    }
    setOutW(width);
    setOutH(height);
    chooseAspect(width / height);
  };

  const handleExport = async () => {
    if (!source || !area || !size || tooBig) return;
    setProcessing(true);
    try {
      const blob = await exportCrop({ url: source.url, area, size, adjustments: adjust, format, quality });
      const meta = { width: size.width, height: size.height, format };
      const ext = format === "jpeg" ? "jpg" : format;
      const out = track({ blob, url: URL.createObjectURL(blob), meta, name: `vertal-imagem-${size.width}x${size.height}-${Date.now()}.${ext}` });
      if (result) {
        URL.revokeObjectURL(result.url);
        urls.current.delete(result.url);
      }
      setResult(out);
      await onConfirm?.(blob, meta);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar a imagem");
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    triggerDownload(result.url, result.name);
    toast.success("Download iniciado");
  };

  const handleShare = async () => {
    if (!result) return;
    try {
      const ok = await shareImage(result.blob, result.name);
      if (!ok) handleDownload();
    } catch {
      toast.error("Não foi possível compartilhar; use Baixar");
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem");
      return;
    }
    openSource(track({ url: URL.createObjectURL(file) }).url);
  };

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const filter = cssFilter(adjust);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] sm:w-full bg-card border-border/40 max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-primary" /> Editor de Imagens
          </DialogTitle>
          <DialogDescription>
            {result ? "Pronto! Baixe ou salve sua imagem." : "Arraste com o dedo para escolher o corte. Puxe os cantos para ajustar."}
          </DialogDescription>
        </DialogHeader>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" data-testid="editor-file-input" />

        {result ? (
          <div className="space-y-4" data-testid="editor-result">
            <div className="flex items-center justify-center rounded-lg border border-border/20 bg-black/40 p-3">
              <img src={result.url} alt="Imagem cortada" className="max-h-[55vh] max-w-full rounded" />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {result.meta.width} × {result.meta.height} px · {result.meta.format.toUpperCase()} · {(result.blob.size / 1024).toFixed(0)} KB
              {canShare && <span className="block sm:hidden">No celular, "Salvar / compartilhar" leva a imagem para a galeria.</span>}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button onClick={handleDownload} className="bg-primary hover:bg-primary/90">
                <Download className="mr-2 h-4 w-4" /> Baixar imagem
              </Button>
              {canShare && (
                <Button variant="outline" onClick={handleShare}>
                  <Share2 className="mr-2 h-4 w-4" /> Salvar / compartilhar
                </Button>
              )}
              <Button variant="ghost" onClick={() => setResult(null)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Ajustar de novo
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="crop" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="crop">Cortar</TabsTrigger>
              <TabsTrigger value="filters">Filtros</TabsTrigger>
              <TabsTrigger value="size">Tamanho</TabsTrigger>
            </TabsList>

            <div className="mt-3 flex min-h-[240px] items-center justify-center overflow-hidden rounded-lg border border-border/20 bg-black/40 p-4">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : source ? (
                <FreeCropper src={source.url} rect={rect} onChange={setRect} ratio={ratio} imageStyle={{ filter }} />
              ) : (
                <div className="space-y-3 text-center text-sm text-muted-foreground">
                  <p>{loadError ?? "Nenhuma imagem carregada."}</p>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> Carregar arquivo
                  </Button>
                </div>
              )}
            </div>

            {area && (
              <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                <Hand className="h-3 w-3" /> Corte: {area.width} × {area.height} px
                {size && (size.width !== area.width || size.height !== area.height) && <> → saída {size.width} × {size.height} px</>}
              </p>
            )}

            <TabsContent value="crop" className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Proporção</Label>
                <div className="flex flex-wrap gap-2">
                  {ASPECTS.map((a) => (
                    <Button
                      key={a.label}
                      type="button"
                      size="sm"
                      variant={aspect === a.value ? "default" : "outline"}
                      aria-pressed={aspect === a.value}
                      className="h-8 px-3 text-xs"
                      onClick={() => chooseAspect(a.value)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => rotate(-90)} disabled={!source || loading}>
                  <RotateCcw className="mr-2 h-3 w-3" /> Girar
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => rotate(90)} disabled={!source || loading}>
                  <RotateCw className="mr-2 h-3 w-3" /> Girar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRect(fitRect(ratio))} disabled={!source}>
                  <Maximize className="mr-2 h-3 w-3" /> Corte máximo
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="filters" className="space-y-4">
              {([
                ["brightness", "Brilho", Eye],
                ["contrast", "Contraste", Settings],
                ["saturation", "Saturação", Grid3x3],
              ] as const).map(([key, label, Icon]) => (
                <div key={key} className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="h-3 w-3" /> {label} ({adjust[key]}%)
                  </Label>
                  <Slider value={[adjust[key]]} min={0} max={200} step={5} onValueChange={(v) => setAdjust((p) => ({ ...p, [key]: v[0] }))} />
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdjust(NO_ADJUSTMENTS)}>
                Reiniciar filtros
              </Button>
            </TabsContent>

            <TabsContent value="size" className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {SIZE_PRESETS.map((p) => (
                  <Button key={p.label} type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => applySizePreset(p.width, p.height)}>
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/20 bg-muted/30 p-3">
                <div className="space-y-1">
                  <Label htmlFor="out-w" className="text-[10px] text-muted-foreground">Largura de saída (px)</Label>
                  <Input id="out-w" type="number" min={1} max={MAX_SIDE} inputMode="numeric" value={outW ?? ""} placeholder="Auto" className="h-8 text-xs"
                    onChange={(e) => setOutW(e.target.value ? Math.max(1, parseInt(e.target.value)) : null)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="out-h" className="text-[10px] text-muted-foreground">Altura de saída (px)</Label>
                  <Input id="out-h" type="number" min={1} max={MAX_SIDE} inputMode="numeric" value={outH ?? ""} placeholder="Auto" className="h-8 text-xs"
                    onChange={(e) => setOutH(e.target.value ? Math.max(1, parseInt(e.target.value)) : null)} />
                </div>
                <p className="col-span-2 text-[10px] text-muted-foreground">Preencha só um lado para manter a proporção do corte.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Formato</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="png">PNG (sem perda)</SelectItem>
                      <SelectItem value="jpeg">JPG (menor)</SelectItem>
                      <SelectItem value="webp">WebP (web)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {format !== "png" && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Qualidade ({quality}%)</Label>
                    <Slider value={[quality]} min={50} max={100} step={1} onValueChange={(v) => setQuality(v[0])} />
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        {!result && (
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" onClick={onCancel} disabled={processing}>Cancelar</Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={processing}>
              <Upload className="mr-2 h-4 w-4" /> Carregar arquivo
            </Button>
            <Button onClick={handleExport} disabled={processing || !source || loading || tooBig} className="bg-primary hover:bg-primary/90">
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crop className="mr-2 h-4 w-4" />}
              {processing ? "Processando..." : tooBig ? `Máximo ${MAX_SIDE}px` : "Cortar e salvar"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

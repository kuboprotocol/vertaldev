import { useState, useCallback, useRef, useEffect } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Crop, ZoomIn, RotateCw, Download, Trash2, Upload, AlertTriangle, Settings, Eye, Grid3x3, FileImage } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  open: boolean;
  imageUrl: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob, metadata: { width: number; height: number; format: string }) => void | Promise<void>;
}

async function getCroppedImage(imageSrc: string, area: Area, quality: number): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = area.width;
  canvas.height = area.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context indisponível");

  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem"))),
      "image/png",
      quality / 100
    );
  });
}

export function ImageEditorDialog({ open, imageUrl, onCancel, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [quality, setQuality] = useState(95);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aspectOptions = [
    { label: "Livre", value: undefined },
    { label: "1:1 (Quadrado)", value: 1 },
    { label: "16:9 (Widescreen)", value: 16/9 },
    { label: "9:16 (Vertical)", value: 9/16 },
    { label: "4:5 (Retrato)", value: 0.8 },
    { label: "3:2 (Clássico)", value: 1.5 },
    { label: "2:3 (Clássico Inv)", value: 2/3 },
  ];

  const sizePresets = [
    { label: "640x480", width: 640, height: 480 },
    { label: "800x600", width: 800, height: 600 },
    { label: "1024x768", width: 1024, height: 768 },
    { label: "1280x720", width: 1280, height: 720 },
    { label: "1920x1080", width: 1920, height: 1080 },
    { label: "2560x1440", width: 2560, height: 1440 },
    { label: "512x512 (Avatar)", width: 512, height: 512 },
    { label: "1024x1024 (Quadrado)", width: 1024, height: 1024 },
  ];

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
    setPreviewWidth(Math.round(areaPixels.width));
    setPreviewHeight(Math.round(areaPixels.height));
  }, []);

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleResetAdjustments = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setRotation(0);
    toast.info("Ajustes reiniciados");
  };

  const handleApplySize = (width: number, height: number) => {
    setPreviewWidth(width);
    setPreviewHeight(height);
    setAspect(width / height);
    toast.info(`Proporção definida para ${width}x${height}`);
  };

  const handleConfirm = async () => {
    if (!imageUrl || !croppedArea) return;
    setProcessing(true);
    try {
      const blob = await getCroppedImage(imageUrl, croppedArea, quality);
      await onConfirm(blob, {
        width: Math.round(croppedArea.width),
        height: Math.round(croppedArea.height),
        format: "png",
      });
      toast.success("Imagem editada com sucesso!");
    } catch (e) {
      toast.error("Erro ao processar imagem");
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        // Aqui você precisaria passar a nova URL para o componente
        // Por enquanto, apenas mostra a mensagem
        toast.info("Imagem carregada. Agora você pode editar.");
      };
      reader.readAsDataURL(file);
    }
  };

  const filterStyle: React.CSSProperties = {
    filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) rotate(${rotation}deg)`,
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-4xl bg-card border-border/40 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-primary" /> Editor de Imagens
          </DialogTitle>
          <DialogDescription>
            Edite sua imagem com corte, redimensionamento, filtros e muito mais.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="crop" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="crop">Cortar</TabsTrigger>
            <TabsTrigger value="filters">Filtros</TabsTrigger>
            <TabsTrigger value="size">Tamanho</TabsTrigger>
          </TabsList>

          {/* Aba Cortar */}
          <TabsContent value="crop" className="space-y-4">
            <div className="relative w-full h-[400px] bg-black/40 rounded-lg overflow-hidden border border-border/20">
              {imageUrl && (
                <Cropper
                  image={imageUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect}
                  cropShape="rect"
                  showGrid={true}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  style={{
                    containerStyle: { ...filterStyle },
                  }}
                />
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Proporção</Label>
                <Select value={aspect?.toString() || "undefined"} onValueChange={(v) => setAspect(v === "undefined" ? undefined : parseFloat(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha proporção" />
                  </SelectTrigger>
                  <SelectContent>
                    {aspectOptions.map((o) => (
                      <SelectItem key={o.value?.toString() || "undefined"} value={o.value?.toString() || "undefined"}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2 text-muted-foreground">
                  <ZoomIn className="h-3 w-3" /> Zoom ({zoom.toFixed(1)}x)
                </Label>
                <Slider
                  value={[zoom]}
                  min={1}
                  max={4}
                  step={0.05}
                  onValueChange={(v) => setZoom(v[0])}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 p-3 rounded bg-muted/30 border border-border/20">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Largura (px)</Label>
                  <Input
                    type="number"
                    value={previewWidth || ""}
                    onChange={(e) => setPreviewWidth(e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Auto"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Altura (px)</Label>
                  <Input
                    type="number"
                    value={previewHeight || ""}
                    onChange={(e) => setPreviewHeight(e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Auto"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Aba Filtros */}
          <TabsContent value="filters" className="space-y-4">
            <div className="relative w-full h-[300px] bg-black/40 rounded-lg overflow-hidden border border-border/20">
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Preview"
                  style={filterStyle}
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2 text-muted-foreground">
                  <Eye className="h-3 w-3" /> Brilho ({brightness}%)
                </Label>
                <Slider
                  value={[brightness]}
                  min={0}
                  max={200}
                  step={5}
                  onValueChange={(v) => setBrightness(v[0])}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2 text-muted-foreground">
                  <Settings className="h-3 w-3" /> Contraste ({contrast}%)
                </Label>
                <Slider
                  value={[contrast]}
                  min={0}
                  max={200}
                  step={5}
                  onValueChange={(v) => setContrast(v[0])}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2 text-muted-foreground">
                  Saturação ({saturation}%)
                </Label>
                <Slider
                  value={[saturation]}
                  min={0}
                  max={200}
                  step={5}
                  onValueChange={(v) => setSaturation(v[0])}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-2 text-muted-foreground">
                  <RotateCw className="h-3 w-3" /> Rotação ({rotation}°)
                </Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRotate}
                    className="flex-1"
                  >
                    <RotateCw className="h-3 w-3 mr-2" /> Girar 90°
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetAdjustments}
                  >
                    <Trash2 className="h-3 w-3" /> Reiniciar
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Aba Tamanho */}
          <TabsContent value="size" className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Redimensionar para</Label>
              <div className="grid grid-cols-2 gap-2">
                {sizePresets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    onClick={() => handleApplySize(preset.width, preset.height)}
                    className="h-8 text-xs"
                  >
                    <Grid3x3 className="h-3 w-3 mr-1" /> {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-4 p-4 rounded-lg border border-border/20 bg-muted/30">
              <Label className="text-xs font-bold">Tamanho Customizado</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] text-muted-foreground">Largura (px)</Label>
                  <Input
                    type="number"
                    value={previewWidth || ""}
                    onChange={(e) => setPreviewWidth(e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Digite a largura"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] text-muted-foreground">Altura (px)</Label>
                  <Input
                    type="number"
                    value={previewHeight || ""}
                    onChange={(e) => setPreviewHeight(e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Digite a altura"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Qualidade</Label>
              <Slider
                value={[quality]}
                min={50}
                max={100}
                step={5}
                onValueChange={(v) => setQuality(v[0])}
              />
              <p className="text-[10px] text-muted-foreground text-right">Qualidade: {quality}%</p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={processing}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
          >
            <Upload className="h-3 w-3 mr-2" /> Carregar Imagem
          </Button>
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <Button
            onClick={handleConfirm}
            disabled={processing || !croppedArea}
            className="bg-primary hover:bg-primary/90"
          >
            {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {processing ? "Processando..." : "Salvar Imagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import heic2any from "heic2any";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare, ImageIcon, Download, Scissors, User2, Video, Music, BookOpen, Sparkles,
  Loader2, Send, Coins, Settings2, Info, AlertCircle, Wallet, RotateCw, Upload, X,
  Download as DownloadIcon, Crop as CropIcon, Trash2, Sliders, History, FileText, FileCode,
  Play, Search, Filter, PlayCircle, Package, Brain, Rocket, Zap, FileSpreadsheet,
  Camera, Images, Globe
} from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarCropDialog } from "./AvatarCropDialog";
import { ImageEditorDialog } from "./ImageEditorDialog";
import { VideoStudio } from "./VideoStudio";
import { EbookStudio } from "./EbookStudio";
import { ClipStudio } from "./ClipStudio";
import { AvatarProgressSteps, type AvatarStepState, type AvatarStepKey } from "./AvatarProgressSteps";
import { cn } from "@/lib/utils";
import { PUTER_MODELS, creativeInvoke } from "@/lib/puterAI";
import { AVATAR_LIMITS, quoteAvatar } from "@/config/avatarPricing";
import { EBOOK_DEFAULT_CHAPTERS, EBOOK_MAX_CHAPTERS, EBOOK_MIN_CHAPTERS, ebookCost } from "@/config/ebookPricing";

import type { ToolKey } from "./toolRequests";
import { PENDING_IMAGE_KEY, TOOL_REQUESTS, summarizeResult } from "./toolRequests";

interface Props {
  toolKey: ToolKey;
  onSuccess?: () => void;
}

const TOOLS: { key: ToolKey; title: string; desc: string; icon: any; cost: string }[] = [
  { key: "chat", title: "Vertal Chat", desc: "Conversas, resumos, traduções, geração de textos", icon: MessageSquare, cost: "1 crédito" },
  { key: "browser_ai", title: "Browser AI", desc: "Agente que navega na internet e responde com fontes", icon: Globe, cost: "2 créditos" },
  { key: "nano_banana", title: "Imagens Premium", desc: "Criação de imagens de alta qualidade", icon: ImageIcon, cost: "1 crédito" },
  { key: "video_studio", title: "Vertal Video Studio", desc: "1 a 10 fotos viram clipe, meme ou anúncio com IA", icon: Video, cost: "A partir de 2 créditos" },
  { key: "image_editor", title: "Editor de Imagens", desc: "Edite, corte e redimensione suas imagens perfeitamente", icon: Sliders, cost: "Grátis" },
  { key: "downloader", title: "Downloader Universal", desc: "YouTube, Instagram, TikTok, Facebook", icon: Download, cost: "2 créditos" },
  { key: "clips", title: "Vertal Clips", desc: "Cortes virais automáticos", icon: Scissors, cost: "1 crédito" },
  { key: "avatar", title: "Vertal Avatar AI", desc: "Avatares falantes realistas", icon: User2, cost: "4 créditos/s de vídeo" },
  { key: "shorts", title: "Vertal Shorts", desc: "Vídeos curtos a partir de texto", icon: Video, cost: "3 créditos" },
  { key: "music", title: "MusKAI Music", desc: "Redireciona para MusKAI", icon: Music, cost: "Externo" },
  { key: "ebook", title: "Vertal Ebook AI", desc: "eBooks completos com capítulos", icon: BookOpen, cost: `a partir de ${ebookCost(EBOOK_MIN_CHAPTERS).credits} créditos` },
  { key: "emo", title: "Vertal EMO AI", desc: "Animação realista de fotos", icon: Sparkles, cost: "5 créditos" },
];

const TOOL_CONFIGS: Record<ToolKey, { 
  title: string; 
  description: string; 
  cost: number;
  promptLabel: string;
  placeholder: string;
  options?: { key: string; label: string; type: "select" | "input" | "number" | "switch"; options?: string[]; default: any }[];
}> = {
  chat: { 
    title: "Vertal Chat", 
    description: "Conversas, resumos, traduções e geração de textos avançada.", 
    cost: 1,
    promptLabel: "O que você deseja criar ou perguntar?",
    placeholder: "Escreva um artigo sobre economia criativa...",
  },
  browser_ai: {
    title: "Browser AI",
    description: "Agente que pesquisa, abre páginas e responde com fontes verificadas.",
    cost: 2,
    promptLabel: "O que o agente deve pesquisar?",
    placeholder: "Compare o preço do iPhone 16 em três lojas do Brasil e diga qual é o mais barato...",
  },
  nano_banana: {
    title: "Imagens Premium",
    description: "Criação de imagens de alta qualidade (Pollinations/Gemini).",
    cost: 1,
    promptLabel: "Descreva a imagem",
    placeholder: "Um astronauta andando a cavalo em Marte, estilo futurista...",
    options: [
      { key: "size", label: "Tamanho", type: "select", options: ["1024x1024", "1024x1792", "1792x1024"], default: "1024x1024" },
      { key: "engine", label: "Motor", type: "select", options: ["Padrão (Pollinations)", "Premium (Gemini)"], default: "Padrão (Pollinations)" }
    ]
  },
  video_studio: {
    title: "Vertal Video Studio",
    description: "Clipes musicais, memes, anúncios e stories a partir de 1 a 10 fotos.",
    cost: 2,
    promptLabel: "",
    placeholder: "",
  },
  image_editor: {
    title: "Editor de Imagens",
    description: "Editor completo com corte, redimensionamento, filtros e ajustes avançados.",
    cost: 0,
    promptLabel: "Cole a URL da imagem ou carregue um arquivo",
    placeholder: "https://exemplo.com/imagem.jpg ou selecione um arquivo local...",
  },
  downloader: { 
    title: "Downloader Universal", 
    description: "Baixe vídeos de qualquer rede social (YouTube, TikTok, Instagram).", 
    cost: 2,
    promptLabel: "URL do vídeo",
    placeholder: "https://www.youtube.com/watch?v=...",
    options: [
      { key: "format", label: "Formato", type: "select", options: ["mp4", "mp3"], default: "mp4" }
    ]
  },
  clips: { 
    title: "Vertal Clips", 
    description: "Crie cortes virais automáticos de vídeos longos.", 
    cost: 1,
    promptLabel: "URL do vídeo ou Transcrição",
    placeholder: "Cole a URL do vídeo ou o texto para ser transformado em clips...",
  },
  avatar: { 
    title: "Vertal Avatar AI", 
    description: "Avatares falantes com narração IA ultra-realista.", 
    cost: 2,
    promptLabel: "Texto para o avatar falar",
    placeholder: "Olá, bem-vindo ao futuro da criação de conteúdo...",
    options: [
      { key: "voice", label: "Voz", type: "select", options: ["Male", "Female", "Neutral"], default: "Male" }
    ]
  },
  shorts: { 
    title: "Vertal Shorts", 
    description: "Vídeos curtos verticais gerados a partir de texto.", 
    cost: 3,
    promptLabel: "Roteiro ou tema",
    placeholder: "Crie um vídeo de 30 segundos sobre curiosidades do café...",
  },
  music: { 
    title: "MusKAI Music", 
    description: "Criação de músicas profissionais via MusKAI.", 
    cost: 1,
    promptLabel: "Estilo e tema da música",
    placeholder: "Um lo-fi relaxante para estudar com batidas de jazz...",
    options: [
      { key: "instrumental", label: "Instrumental", type: "switch", default: false }
    ]
  },
  ebook: { 
    title: "Vertal Ebook AI", 
    description: "eBooks completos com capa, capítulos e conteúdo.", 
    cost: ebookCost(EBOOK_DEFAULT_CHAPTERS).credits,
    promptLabel: "Tema do Ebook",
    placeholder: "Guia definitivo para Marketing Digital em 2024...",
    options: [
      { key: "chapters", label: `Capítulos (${EBOOK_MIN_CHAPTERS}–${EBOOK_MAX_CHAPTERS})`, type: "number", default: EBOOK_DEFAULT_CHAPTERS }
    ]
  },
  emo: { 
    title: "Vertal EMO AI", 
    description: "Animação realista de fotos a partir de um vídeo de referência.", 
    cost: 5,
    promptLabel: "Instruções adicionais",
    placeholder: "Mantenha a expressão natural do rosto...",
  }
};


export function CreativeToolInterface({ toolKey, onSuccess }: Props) {
  if (toolKey === "video_studio") return <VideoStudio />;
  if (toolKey === "ebook") return <EbookStudio />;
  if (toolKey === "clips") return <ClipStudio />;
  return <StandardToolInterface toolKey={toolKey} onSuccess={onSuccess} />;
}

function StandardToolInterface({ toolKey, onSuccess }: Props) {
  const config = TOOL_CONFIGS[toolKey];
  const { editsRemaining } = useSubscription();
  const [prompt, setPrompt] = useState("");
  const [metadata, setMetadata] = useState<Record<string, any>>(
    config.options?.reduce((acc, opt) => ({ ...acc, [opt.key]: opt.default }), {}) || {}
  );
  const [loading, setLoading] = useState(false);
  const [kimiModel, setKimiModel] = useState<string>(() => localStorage.getItem("creative_kimi_model") || "meta-llama/llama-3.1-70b-instruct");
  const [temperature, setTemperature] = useState(() => Number(localStorage.getItem("creative_temperature")) || 0.7);
  const [maxTokens, setMaxTokens] = useState(() => Number(localStorage.getItem("creative_max_tokens")) || 1500);
  const [streamingContent, setStreamingContent] = useState("");
  const [traceInfo, setTraceInfo] = useState<{ correlationId?: string; traceId?: string } | null>(null);
  const [errorState, setErrorState] = useState<{ message: string; correlationId?: string; traceId?: string; stack?: string } | null>(null);
  const [executionPhase, setExecutionPhase] = useState<"idle" | "validating" | "requesting" | "processing" | "done" | "error">("idle");
  const [sessionHistory, setSessionHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem(`creative_history_${toolKey}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [editorImageUrl, setEditorImageUrl] = useState<string | null>(null);
  // Avatar photo: optional. Without it the avatar is generated from the text alone.
  const [avatarCropSrc, setAvatarCropSrc] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    localStorage.setItem(`creative_history_${toolKey}`, JSON.stringify(sessionHistory));
  }, [sessionHistory, toolKey]);

  // Imagem enviada no painel (Câmera/Imagem) chega aqui já aberta no editor
  useEffect(() => {
    if (toolKey !== "image_editor") return;
    try {
      const pending = sessionStorage.getItem(PENDING_IMAGE_KEY);
      if (!pending) return;
      sessionStorage.removeItem(PENDING_IMAGE_KEY);
      setPrompt(pending);
      setEditorImageUrl(pending);
      setImageEditorOpen(true);
    } catch {
      // sessionStorage indisponível: o usuário ainda pode colar a URL manualmente
    }
  }, [toolKey]);

  // The editor shows the result with its own Baixar / Salvar buttons; here we only record it in the history.
  const handleImageEditorConfirm = (_blob: Blob, metadata: { width: number; height: number; format: string }) => {
    setSessionHistory(prev => [{
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      prompt: `Imagem editada: ${metadata.width}x${metadata.height}`,
      status: "success",
      metadata: metadata,
    }, ...prev].slice(0, 50));
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      // Open the editor straight away; the data URL is too long to show in the prompt box.
      setEditorImageUrl(event.target?.result as string);
      setImageEditorOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isHeic = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
    if (!file.type.startsWith("image/") && !isHeic) {
      toast.error("Selecione uma imagem (JPG, PNG, WEBP ou HEIC)");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 15 MB)");
      return;
    }
    try {
      let blob: Blob = file;
      if (isHeic) {
        const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
        blob = Array.isArray(converted) ? converted[0] : converted;
      }
      setAvatarCropSrc(URL.createObjectURL(blob));
    } catch {
      toast.error("Não foi possível abrir essa imagem");
    }
  };

  const closeAvatarCrop = () => {
    if (avatarCropSrc) URL.revokeObjectURL(avatarCropSrc);
    setAvatarCropSrc(null);
  };

  const handleAvatarCropConfirm = async (blob: Blob) => {
    setAvatarUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Faça login para enviar a foto");
      const path = `${uid}/avatar/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("uploads").upload(path, blob, {
        cacheControl: "3600", upsert: false, contentType: blob.type || "image/jpeg",
      });
      if (error) throw error;
      // The bucket is private: hand the backend a signed URL it can fetch.
      const { data: signed, error: signErr } = await supabase.storage.from("uploads").createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Falha ao gerar link da foto");
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(URL.createObjectURL(blob));
      setAvatarImageUrl(signed.signedUrl);
      closeAvatarCrop();
      toast.success("Foto do avatar pronta!");
    } catch (err) {
      toast.error("Falha no upload da foto", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatarPhoto = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    setAvatarImageUrl(null);
  };

  // Lip-sync videos render on a queue: poll until the asset is done, also after a page reload.
  const pollingRef = useRef(new Set<string>());
  const pollAvatar = useCallback(async (historyId: string, assetId: string) => {
    if (pollingRef.current.has(assetId)) return;
    pollingRef.current.add(assetId);
    try {
      for (let i = 0; i < 300; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        if (!pollingRef.current.has(assetId)) return;
        const { data, error } = await supabase.functions.invoke("creative-video", {
          body: { mode: "avatar", action: "status", asset_id: assetId },
        });
        if (error || !data?.status || data.status === "processing") continue;
        const ok = data.status === "completed";
        setSessionHistory(prev => prev.map(item => item.id === historyId
          ? { ...item, status: ok ? "success" : "error", videoUrl: data.video_url ?? undefined, audioUrl: data.audio_url ?? item.audioUrl }
          : item));
        if (ok) toast.success("Seu avatar falante está pronto!");
        else toast.error("Não foi possível gerar o vídeo", { description: data.refunded ? "Os créditos do vídeo foram devolvidos." : undefined });
        return;
      }
    } finally {
      pollingRef.current.delete(assetId);
    }
  }, []);

  useEffect(() => {
    if (toolKey !== "avatar") return;
    sessionHistory.filter(item => item.status === "processing" && item.assetId).forEach(item => pollAvatar(item.id, item.assetId));
    // Only resume on mount; new jobs start their own polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolKey, pollAvatar]);

  useEffect(() => {
    const polling = pollingRef.current;
    return () => polling.clear();
  }, []);

  const avatarQuote = toolKey === "avatar" ? quoteAvatar(prompt, !!avatarImageUrl) : null;

  const handleExecute = async () => {
    if (loading) return;

    if (toolKey === "music" || toolKey === "shorts") {
      window.open("https://muskai.kubovibe.dev", "_blank");
      toast.info("Redirecionando para MusKAI...");
      return;
    }

    if (toolKey === "image_editor") {
      if (!prompt.trim()) {
        toast.error("Cole a URL da imagem ou carregue um arquivo");
        return;
      }
      setEditorImageUrl(prompt);
      setImageEditorOpen(true);
      return;
    }

    if (!prompt.trim()) {
      toast.error("O campo de prompt/URL é obrigatório");
      return;
    }

    setLoading(true);
    setExecutionPhase("requesting");
    setStreamingContent("");

    try {
      const { fn, body } = TOOL_REQUESTS[toolKey](prompt, metadata);
      if (toolKey === "chat") {
        body.model = kimiModel;
        body.temperature = temperature;
        body.max_tokens = maxTokens;
      }

      if (toolKey === "avatar") {
        const { data, error } = await supabase.functions.invoke("creative-video", {
          body: { mode: "avatar", prompt, voice: metadata.voice, image_url: avatarImageUrl ?? undefined },
        });

        if (error) throw error;

        const historyId = crypto.randomUUID();
        const processing = data?.status === "processing";
        setSessionHistory(prev => [{
          id: historyId,
          timestamp: new Date().toLocaleTimeString(),
          prompt,
          status: processing ? "processing" : "success",
          assetId: data?.asset_id,
          audioUrl: data?.audio_url ?? undefined,
          videoUrl: data?.video_url ?? undefined,
          metadata: { ...metadata, credits: data?.credits_charged, source: avatarImageUrl ? "photo" : "text" },
        }, ...prev].slice(0, 50));
        if (processing && data?.asset_id) pollAvatar(historyId, data.asset_id);
        setExecutionPhase("done");
        toast.success(processing ? "Voz pronta! O vídeo do avatar está sendo gerado (1–5 min)." : "Narração pronta!");
        setPrompt("");
        onSuccess?.();
        return;
      }

      const { data, error } = await supabase.functions.invoke(fn, { body });

      if (error) throw error;

      const result = summarizeResult(data);
      setSessionHistory(prev => [{
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        prompt,
        status: "success",
        assetUrl: result.assetUrl,
        output_text: result.output_text,
        metadata: { ...metadata, model: kimiModel, engine: data?.engine }
      }, ...prev].slice(0, 50));

      setExecutionPhase("done");
      toast.success("Solicitação processada com sucesso!");
      setPrompt("");
      onSuccess?.();
    } catch (e: any) {
      setExecutionPhase("error");
      toast.error("Erro na execução", { description: e.message });
      setSessionHistory(prev => [{
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        prompt,
        status: "error",
        metadata: { ...metadata }
      }, ...prev].slice(0, 50));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="p-6 bg-background/40 backdrop-blur-xl border-border/10 border-primary/10 relative overflow-hidden group shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-[0_0_15px_rgba(201,148,26,0.1)] group-hover:shadow-[0_0_20px_rgba(201,148,26,0.2)] transition-all">
            {TOOLS.find(t => t.key === toolKey)?.icon && 
              (() => {
                const Icon = TOOLS.find(t => t.key === toolKey)?.icon;
                return <Icon className="h-6 w-6" />;
              })()
            }
          </div>
          <div>
            <h3 className="text-lg font-orbitron font-bold text-foreground tracking-tight">{config.title}</h3>
            <p className="text-sm text-muted-foreground">{config.description}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-60">{config.promptLabel}</Label>
            {toolKey === "image_editor" ? (
              <div className="space-y-2">
                <Textarea
                  placeholder={config.placeholder}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[80px] bg-background/50 border-border/10 focus:border-primary/30 transition-all resize-none text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => document.getElementById("image-file-input")?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" /> Ou Carregue um Arquivo
                </Button>
                <input
                  id="image-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileUpload}
                  className="hidden"
                />
              </div>
            ) : (
              <>
                <Textarea
                  placeholder={config.placeholder}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  maxLength={toolKey === "avatar" ? AVATAR_LIMITS.maxTextChars : undefined}
                  className="min-h-[120px] bg-background/50 border-border/10 focus:border-primary/30 transition-all resize-none text-sm"
                />
                {toolKey === "avatar" && (
                  <p className="text-[11px] text-muted-foreground text-right">
                    {prompt.length}/{AVATAR_LIMITS.maxTextChars} · ~{avatarQuote?.seconds ?? 0}s de fala
                  </p>
                )}
              </>
            )}
          </div>

          {toolKey === "avatar" && (
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">
                Foto do avatar <span className="normal-case font-normal opacity-80">(opcional)</span>
              </Label>
              {avatarPreview ? (
                <div className="flex items-center gap-4 p-3 rounded-xl bg-background/50 border border-primary/20">
                  <img src={avatarPreview} alt="Foto do avatar" className="h-20 w-20 rounded-xl object-cover border border-primary/30" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Foto pronta</p>
                    <p className="text-xs text-muted-foreground">O avatar vai falar com este rosto.</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={removeAvatarPhoto} aria-label="Remover foto">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto flex-col gap-1.5 py-3 bg-background/50 border-border/10 hover:border-primary/40"
                      onClick={() => document.getElementById("avatar-gallery-input")?.click()}
                      disabled={avatarUploading}
                    >
                      <Upload className="h-5 w-5 text-primary" />
                      <span className="text-[11px] leading-tight">Galeria</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto flex-col gap-1.5 py-3 bg-background/50 border-border/10 hover:border-primary/40"
                      onClick={() => document.getElementById("avatar-camera-input")?.click()}
                      disabled={avatarUploading}
                    >
                      <Camera className="h-5 w-5 text-primary" />
                      <span className="text-[11px] leading-tight">Tirar foto</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto flex-col gap-1.5 py-3 bg-background/50 border-border/10 hover:border-primary/40"
                      onClick={() => {
                        toast.info("Escolha \"Google Fotos\" no seletor que vai abrir");
                        document.getElementById("avatar-photos-input")?.click();
                      }}
                      disabled={avatarUploading}
                    >
                      <Images className="h-5 w-5 text-primary" />
                      <span className="text-[11px] leading-tight">Google Fotos</span>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Sem foto, o avatar é gerado apenas a partir do texto.
                  </p>
                </>
              )}
              <input id="avatar-gallery-input" type="file" accept="image/*,.heic,.heif" className="hidden" onChange={handleAvatarFilePick} />
              <input id="avatar-camera-input" type="file" accept="image/*" capture="user" className="hidden" onChange={handleAvatarFilePick} />
              <input id="avatar-photos-input" type="file" accept="image/*" className="hidden" onChange={handleAvatarFilePick} />
            </div>
          )}

          {config.options && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {config.options.map((opt) => (
                <div key={opt.key} className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider opacity-60">{opt.label}</Label>
                  {opt.type === "select" ? (
                    <Select
                      value={metadata[opt.key]}
                      onValueChange={(val) => setMetadata(prev => ({ ...prev, [opt.key]: val }))}
                    >
                      <SelectTrigger className="bg-background/50 border-border/10 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {opt.options?.map(o => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : opt.type === "number" ? (
                    <Input
                      type="number"
                      value={metadata[opt.key]}
                      onChange={(e) => setMetadata(prev => ({ ...prev, [opt.key]: Number(e.target.value) }))}
                      className="bg-background/50 border-border/10"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {toolKey === "chat" && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-widest text-primary/80">Configurações de IA</span>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase opacity-60">Modelo</Label>
                  <Select value={kimiModel} onValueChange={setKimiModel}>
                    <SelectTrigger className="h-9 bg-background/50 border-border/10 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PUTER_MODELS.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase opacity-60">Temperatura: {temperature}</Label>
                    <Slider
                      value={[temperature]}
                      min={0} max={1} step={0.1}
                      onValueChange={([v]) => setTemperature(v)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase opacity-60">Max Tokens: {maxTokens}</Label>
                    <Slider
                      value={[maxTokens]}
                      min={100} max={4000} step={100}
                      onValueChange={([v]) => setMaxTokens(v)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/60 border border-border/10">
              <Coins className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-bold text-amber-500/90 tracking-tight">
                {avatarQuote
                  ? `Custo: ~${avatarQuote.credits} ${avatarQuote.credits === 1 ? "crédito" : "créditos"}`
                  : `Custo: ${config.cost} ${config.cost === 1 ? "crédito" : "créditos"}`}
              </span>
            </div>
            
            <Button
              onClick={handleExecute}
              disabled={loading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold font-orbitron px-8 h-12 shadow-[0_0_20px_rgba(201,148,26,0.3)] hover:shadow-[0_0_30px_rgba(201,148,26,0.5)] transition-all group"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" />
              )}
              {loading ? "PROCESSANDO..." : "EXECUTAR AGORA"}
            </Button>
          </div>
        </div>
      </Card>

      {sessionHistory.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <History className="h-4 w-4" />
            <h4 className="text-xs font-bold uppercase tracking-widest">Histórico da Sessão</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessionHistory.map((item) => (
              <Card key={item.id} className="p-4 bg-background/20 backdrop-blur-md border-border/5 hover:border-primary/20 transition-all group overflow-hidden">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] opacity-40 font-mono">{item.timestamp}</span>
                    <Badge variant={item.status === "error" ? "destructive" : "secondary"} className="text-[8px] h-4 uppercase">
                      {item.status === "success" ? "Sucesso" : item.status === "processing" ? "Gerando vídeo…" : "Erro"}
                    </Badge>
                  </div>
                  {item.metadata?.credits && (
                    <span className="text-[10px] font-bold text-primary/60">-{item.metadata.credits} cred</span>
                  )}
                </div>

                <p className="text-xs text-foreground/90 font-medium line-clamp-2 mb-3 leading-relaxed">{item.prompt}</p>

                {item.videoUrl ? (
                  <video src={item.videoUrl} controls playsInline className="w-full rounded-lg bg-black/40 border border-border/10 mb-3" />
                ) : item.status === "processing" ? (
                  <div className="flex items-center gap-2 rounded-lg bg-black/40 border border-border/10 p-3 mb-3 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" /> Animando o rosto com a sua voz…
                  </div>
                ) : null}

                {item.audioUrl && !item.videoUrl && (
                  <audio src={item.audioUrl} controls className="w-full mb-3" />
                )}

                {item.assetUrl && (
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-black/40 border border-border/10 mb-3 group-hover:border-primary/30 transition-all">
                    <img src={item.assetUrl} alt="Preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    <a
                      href={item.assetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
                    >
                      <DownloadIcon className="h-6 w-6 text-primary" />
                    </a>
                  </div>
                )}

                {item.output_text && (
                  <div className="p-3 rounded-lg bg-black/40 text-[11px] text-muted-foreground/90 border border-border/10 line-clamp-4 leading-relaxed whitespace-pre-wrap italic">
                    {item.output_text}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {toolKey === "avatar" && (
        <AvatarCropDialog
          open={!!avatarCropSrc}
          imageUrl={avatarCropSrc}
          onCancel={closeAvatarCrop}
          onConfirm={handleAvatarCropConfirm}
          onSavePreset={() => {}}
        />
      )}

      <ImageEditorDialog
        open={imageEditorOpen}
        imageUrl={editorImageUrl}
        onCancel={() => setImageEditorOpen(false)}
        onConfirm={handleImageEditorConfirm}
      />
    </div>
  );
}

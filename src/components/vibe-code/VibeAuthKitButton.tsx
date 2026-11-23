import { useState } from "react";
import { Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/fileUpload";
import {
  AUTH_KIT_DEFAULT_LOGO_URL,
  AUTH_KIT_FOOTER,
  AUTH_KIT_TERMS_TEXT,
  AUTH_KIT_TERMS_VERSION,
  type AuthKitPrefs,
} from "@/lib/vertalAuthKit";

const LOGO_TYPES = "image/png,image/jpeg,image/webp";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * "Login Vertal": liga o Login com Google gerenciado pelo Vertal no app que o
 * agente está construindo. Marca branca (logo do Dev) só depois do checkbox
 * explícito dos termos; aí a linha fixa AUTH_KIT_FOOTER aparece embaixo do formulário.
 */
export function VibeAuthKitButton({
  prefs,
  onChange,
  open,
  onOpenChange,
  disabled,
}: {
  prefs: AuthKitPrefs;
  onChange: (next: AuthKitPrefs) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const white = prefs.termsAccepted && !!prefs.logoUrl;

  const setTerms = (checked: boolean) => {
    onChange(
      checked
        ? { ...prefs, termsAccepted: true, termsVersion: AUTH_KIT_TERMS_VERSION, acceptedAt: new Date().toISOString() }
        : { ...prefs, termsAccepted: false, termsVersion: undefined, acceptedAt: undefined, logoUrl: undefined },
    );
  };

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.split(",").includes(file.type)) return void toast.error("Use PNG, JPG ou WebP.");
    if (file.size > LOGO_MAX_BYTES) return void toast.error("O logo pode ter até 2 MB.");
    setUploading(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Entre na sua conta para enviar o logo.");
      const up = await uploadFile(file, data.user.id);
      onChange({ ...prefs, logoUrl: up.url });
      toast.success("Logo enviado. Ele entra na tela de login no próximo pedido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar o logo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={`h-7 gap-1.5 border-border/30 px-2 text-[10px] ${prefs.enabled ? "text-emerald-400" : ""}`}
          data-testid="vibe-auth-kit-button"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Login Vertal{prefs.enabled ? " · ligado" : ""}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-4 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Login com Google gerenciado pelo Vertal</p>
            <p className="mt-1 text-muted-foreground">
              Tela de login pronta no seu app: e-mail, senha e botão do Google, sem configurar OAuth.
            </p>
          </div>
          <Switch
            checked={prefs.enabled}
            onCheckedChange={(enabled) => onChange({ ...prefs, enabled })}
            aria-label="Ligar Login Vertal"
            data-testid="vibe-auth-kit-switch"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="auth-kit-app-name" className="text-[11px]">Nome do app na tela de login</Label>
          <Input
            id="auth-kit-app-name"
            value={prefs.appName}
            maxLength={60}
            placeholder="Meu app"
            onChange={(e) => onChange({ ...prefs, appName: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border/40 p-2">
          <img src={white ? prefs.logoUrl : AUTH_KIT_DEFAULT_LOGO_URL} alt="" className="h-10 w-10 rounded-md object-contain" />
          <p className="text-muted-foreground">{white ? "Seu logo (marca branca)" : "Logo do Vertal Dev (padrão)"}</p>
        </div>

        <div className="space-y-2 rounded-lg border border-border/40 p-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="auth-kit-terms"
              checked={prefs.termsAccepted}
              onCheckedChange={(v) => setTerms(v === true)}
              data-testid="vibe-auth-kit-terms"
            />
            <Label htmlFor="auth-kit-terms" className="text-[11px] font-normal leading-snug">
              {AUTH_KIT_TERMS_TEXT}
            </Label>
          </div>
          <label
            className={`flex cursor-pointer items-center gap-2 text-[11px] ${prefs.termsAccepted ? "" : "pointer-events-none opacity-50"}`}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {prefs.logoUrl ? "Trocar meu logo" : "Enviar meu logo (PNG, JPG ou WebP, até 2 MB)"}
            <input
              type="file"
              accept={LOGO_TYPES}
              className="sr-only"
              disabled={!prefs.termsAccepted || uploading}
              onChange={(e) => void onLogo(e.target.files?.[0])}
              data-testid="vibe-auth-kit-logo"
            />
          </label>
          {prefs.termsAccepted && (
            <p className="text-[10px] text-muted-foreground">
              Embaixo do formulário: <span className="font-medium text-foreground/80">{AUTH_KIT_FOOTER}</span>
            </p>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">O botão do Google mantém o “G” oficial (regras de marca do Google).</p>
      </PopoverContent>
    </Popover>
  );
}

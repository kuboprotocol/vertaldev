import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mic, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AVATAR_CLONE_LIMITS } from "@/config/avatarPricing";
import { functionErrorCode } from "@/lib/functionError";
import { AvatarVoiceCloneDialog } from "./AvatarVoiceCloneDialog";
import { groupAvatarVoices, normalizeVoiceSelection, voiceErrorMessage, type AvatarUserVoice } from "./avatarVoices";

interface Props {
  value: string;
  onChange: (voice: string) => void;
}

/** Voice picker of the avatar panel: library voices, the user's cloned voices and the clone dialog. */
export function AvatarVoicePicker({ value, onChange }: Props) {
  const [userVoices, setUserVoices] = useState<AvatarUserVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AvatarUserVoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [playing, setPlaying] = useState<{ id: string; audio: HTMLAudioElement } | null>(null);

  const loadVoices = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("creative-video", { body: { mode: "avatar", action: "list_voices" } });
      if (error) throw new Error(voiceErrorMessage(await functionErrorCode(error)));
      setUserVoices(Array.isArray(data?.voices) ? data.voices : []);
    } catch {
      // The library voices still work; the list is retried next time the panel opens.
      setUserVoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVoices();
  }, [loadVoices]);

  // A clone that disappeared (deleted, other device) falls back to the default library voice.
  useEffect(() => {
    if (loading) return;
    const next = normalizeVoiceSelection(value, userVoices);
    if (next !== value) onChange(next);
  }, [loading, value, userVoices, onChange]);

  useEffect(() => () => playing?.audio.pause(), [playing]);

  const groups = useMemo(() => groupAvatarVoices(userVoices), [userVoices]);

  const togglePreview = (voice: AvatarUserVoice) => {
    if (playing?.id === voice.id) {
      playing.audio.pause();
      setPlaying(null);
      return;
    }
    playing?.audio.pause();
    if (!voice.preview_url) return;
    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlaying(null);
    void audio.play().catch(() => setPlaying(null));
    setPlaying({ id: voice.id, audio });
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("creative-video", {
        body: { mode: "avatar", action: "delete_voice", voice_id: toDelete.voice_id },
      });
      if (error) throw new Error(voiceErrorMessage(await functionErrorCode(error)));
      setUserVoices((prev) => prev.filter((v) => v.id !== toDelete.id));
      if (value === toDelete.id) onChange(normalizeVoiceSelection(null, []));
      toast.success("Voz excluída.");
      setToDelete(null);
    } catch (err) {
      toast.error("Não foi possível excluir a voz", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDeleting(false);
    }
  };

  const atLimit = userVoices.length >= AVATAR_CLONE_LIMITS.maxVoicesPerUser;

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Voz</Label>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="bg-background/50 border-border/10 h-10 flex-1" aria-label="Voz do avatar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Biblioteca</SelectLabel>
              {groups.library.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Minhas vozes</SelectLabel>
              {groups.mine.length === 0 ? (
                <div className="px-8 py-1.5 text-xs text-muted-foreground">
                  {loading ? "Carregando…" : "Nenhuma voz clonada ainda"}
                </div>
              ) : (
                groups.mine.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                ))
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="h-10 bg-background/50 border-border/10 hover:border-primary/40"
          onClick={() => setCloneOpen(true)}
          disabled={atLimit}
          title={atLimit ? `Limite de ${AVATAR_CLONE_LIMITS.maxVoicesPerUser} vozes` : undefined}
        >
          <Mic className="h-4 w-4 mr-2 text-primary" /> Clonar minha voz
        </Button>
      </div>

      {loading && userVoices.length === 0 ? null : userVoices.length > 0 && (
        <ul className="space-y-1">
          {userVoices.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-lg bg-background/40 border border-border/10 px-2 py-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => togglePreview(v)}
                disabled={!v.preview_url}
                aria-label={playing?.id === v.id ? `Pausar prévia de ${v.name}` : `Ouvir prévia de ${v.name}`}
              >
                {playing?.id === v.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <span className="flex-1 truncate text-xs">{v.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => setToDelete(v)}
                aria-label={`Excluir ${v.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {atLimit && (
        <p className="text-[11px] text-muted-foreground">
          Você chegou ao limite de {AVATAR_CLONE_LIMITS.maxVoicesPerUser} vozes. Exclua uma para clonar outra.
        </p>
      )}

      <AvatarVoiceCloneDialog
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        onCloned={(voice) => {
          setUserVoices((prev) => [...prev.filter((v) => v.id !== voice.id), voice]);
          onChange(voice.id);
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A voz e a amostra gravada serão apagadas. Os créditos da clonagem não são devolvidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

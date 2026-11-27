import { Fragment, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, Image as ImageIcon, Paperclip, Monitor, Puzzle, Code2, Smartphone,
  FileText, Search, MessageSquare, Calendar, Table2, Music, Video, Scissors, BookOpen, Sparkles, User2, Download, Clapperboard, Palette, NotebookPen, AlarmClock
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { PENDING_IMAGE_KEY } from "./toolRequests";
import { setPendingOfficeFile } from "@/lib/office/pendingFile";

/** Files the "File" button accepts: images go to the Image Editor; the rest opens in Vertal Office. */
const FILE_ACCEPT =
  "image/*,.pdf,.doc,.docx,.odt,.rtf,.txt,.md,.html,.htm,.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.pptx,.odp,.json,.xml";

type Item = {
  key: string;
  label: string;
  icon: any;
  badge?: string;
  onSelect: (ctx: { navigate: ReturnType<typeof useNavigate>; setActive: (k: any) => void }) => void;
  divider?: boolean;
};

interface Props {
  setActive: (key: string) => void;
}

const ITEMS: Item[] = [
  { key: "computer", label: "Connect my computer", icon: Monitor, onSelect: ({ navigate }) => navigate("/connectors") },
  { key: "skills", label: "Add skills", icon: Puzzle, onSelect: ({ navigate }) => navigate("/agents"), divider: true },
  { key: "site", label: "Create a website", icon: Code2, onSelect: ({ navigate }) => navigate("/builder") },
  { key: "apps", label: "Build apps", icon: Smartphone, onSelect: ({ navigate }) => navigate("/builder?mode=app") },
  // Create image, edit image and create slides live only in Design Premium (and Canvas).
  { key: "design", label: "Design Premium", icon: Palette, badge: "AI", onSelect: ({ setActive }) => setActive("design") },
  { key: "research", label: "Wide Research", icon: Search, onSelect: ({ setActive }) => setActive("chat") },
  { key: "chat_mode", label: "Chat mode", icon: MessageSquare, onSelect: ({ setActive }) => setActive("chat") },
  { key: "schedule", label: "Scheduled tasks", icon: Calendar, onSelect: ({ navigate }) => navigate("/creative/investigation") },
  { key: "sheet", label: "Create a spreadsheet", icon: Table2, onSelect: ({ setActive }) => setActive("sheet") },
  { key: "clock", label: "Vertal Clock: clock and alarm", icon: AlarmClock, badge: "New", onSelect: ({ setActive }) => setActive("clock") },
  { key: "notebook", label: "Vertal Notebook", icon: NotebookPen, badge: "New", onSelect: ({ setActive }) => setActive("notebook") },
  { key: "office", label: "Vertal Office", icon: FileText, badge: "New", onSelect: ({ setActive }) => setActive("office") },
  { key: "music", label: "AI music", icon: Music, onSelect: ({ setActive }) => setActive("music") },
  { key: "video_studio", label: "Create a video from photos", icon: Clapperboard, badge: "New", onSelect: ({ setActive }) => setActive("video_studio") },
  { key: "shorts", label: "AI shorts and video", icon: Video, onSelect: ({ setActive }) => setActive("shorts") },
  { key: "clips", label: "Short clips", icon: Scissors, onSelect: ({ setActive }) => setActive("clips") },
  { key: "avatar", label: "AI avatar", icon: User2, onSelect: ({ setActive }) => setActive("avatar") },
  { key: "ebook", label: "AI eBook", icon: BookOpen, onSelect: ({ setActive }) => setActive("ebook") },
  { key: "emo", label: "EMO: animate a photo", icon: Sparkles, onSelect: ({ setActive }) => setActive("emo") },
  { key: "downloader", label: "Universal Downloader", icon: Download, onSelect: ({ setActive }) => setActive("downloader") },
];

export function ManusLauncher({ setActive }: Props) {
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tiles = [
    { key: "camera", label: "Camera", icon: Camera, onClick: () => cameraRef.current?.click() },
    { key: "image", label: "Image", icon: ImageIcon, onClick: () => imageRef.current?.click() },
    { key: "file", label: "File", icon: Paperclip, onClick: () => fileRef.current?.click() },
  ];

  // A photo or image sent from the panel opens in the Image Editor, already loaded
  const handleFile = (kind: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    // Spreadsheets, PDFs, documents and slides open in Vertal Office.
    if (!f.type.startsWith("image/")) {
      setPendingOfficeFile(f);
      toast.success(`${kind}: ${f.name}`, { description: "Opening in Vertal Office…" });
      setActive("office");
      return;
    }
    try {
      sessionStorage.setItem(PENDING_IMAGE_KEY, URL.createObjectURL(f));
    } catch {
      toast.error("Could not open the image in the editor");
      return;
    }
    toast.success(`${kind} ready: ${f.name}`, { description: "Opening in the Design Premium Image Editor…" });
    setActive("image_editor");
  };

  return (
    <div className="space-y-4">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile("Photo taken")} />
      <input ref={imageRef} type="file" accept="image/*" hidden onChange={handleFile("Image selected")} />
      <input ref={fileRef} type="file" accept={FILE_ACCEPT} hidden onChange={handleFile("File uploaded")} />

      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            onClick={t.onClick}
            className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/[0.06] bg-card/50 p-5 transition-colors hover:border-white/[0.14] hover:bg-card/70 active:scale-[0.98]"
          >
            <t.icon className="h-7 w-7 text-foreground/80 group-hover:text-primary" />
            <span className="text-sm text-foreground/90">{t.label}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl border-white/[0.06] bg-card/50">
        <ul className="divide-y divide-white/[0.06]">
          {ITEMS.map((it) => (
            <Fragment key={it.key}>
              <li className={it.divider ? "border-b border-white/[0.06]" : ""}>
                <button
                  onClick={() => it.onSelect({ navigate, setActive })}
                  className="w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]"
                >
                  <it.icon className="h-5 w-5 text-foreground/70 shrink-0" />
                  <span className="flex-1 text-[15px] text-foreground/90">{it.label}</span>
                  {it.badge && (
                    <span className="text-[11px] font-medium rounded-full bg-primary/15 text-primary px-2 py-0.5">
                      {it.badge}
                    </span>
                  )}
                </button>
              </li>
              {it.key === "design" && (
                <li className="p-3">
                  <button
                    type="button"
                    onClick={() => setActive("office")}
                    aria-label="Open Vertal Office"
                    className="w-full flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-left transition-colors hover:bg-primary/15 active:scale-[0.99]"
                  >
                    <FileText className="h-8 w-8 shrink-0 text-primary" />
                    <span className="flex-1">
                      <span className="block text-[15px] font-semibold" translate="no">Vertal Office</span>
                      <span className="block text-sm text-muted-foreground">Documents and spreadsheets, completely free. Only the AI is paid.</span>
                    </span>
                    <span className="text-xs font-medium rounded-full bg-primary px-3 py-1 text-primary-foreground">Open</span>
                  </button>
                </li>
              )}
            </Fragment>
          ))}
        </ul>
      </Card>
    </div>
  );
}

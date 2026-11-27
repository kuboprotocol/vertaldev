import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { billingApi, type BillingNotice } from "@/lib/vertalCodeAi/platformApi";

/**
 * Aviso de crédito baixo no painel (cobrança v2). Mostra só avisos não lidos; "Entendi" marca
 * como lido. Com a cobrança v2 desligada para a conta o servidor responde 404 e nada aparece.
 */
export function VertalCreditNoticeBanner({ api = billingApi }: { api?: Pick<typeof billingApi, "notices" | "markRead"> }) {
  const [notices, setNotices] = useState<BillingNotice[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .notices()
      .then((r) => alive && setNotices((r.notices ?? []).filter((n) => !n.read_at)))
      .catch(() => alive && setNotices([]));
    return () => {
      alive = false;
    };
  }, [api]);
  if (!notices.length) return null;
  const n = notices[0];
  const pt = n.locale === "pt-BR";
  return (
    <div role="status" className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{n.title}</p>
        <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{n.body}</p>
      </div>
      <button
        type="button"
        aria-label={pt ? "Entendi" : "Got it"}
        className="rounded p-1 text-muted-foreground hover:bg-secondary"
        onClick={async () => {
          setNotices((prev) => prev.filter((x) => x.id !== n.id));
          await api.markRead(n.id).catch(() => undefined);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

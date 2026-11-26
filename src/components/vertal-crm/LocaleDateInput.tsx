// Campo de data (ou data e hora) no idioma do Vertal CRM: dd/mm/aaaa e 24 h em pt/es, calendário traduzido.
// Substitui o <input type="date|datetime-local"> nativo, que segue o idioma do navegador (AM/PM, textos em inglês).
import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { enUS, es, ptBR } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DATE_INPUT_TEXT, formatDateInput, maskDateInput, parseDateInput, withPickedDay } from '@/lib/vertalCrm/dateInput';
import type { CrmLang } from '@/lib/vertalCrm/i18n';

const DF_LOCALE = { pt: ptBR, es, en: enUS } as const;

export function LocaleDateInput({
  value, onChange, lang, withTime = false, disabled, ariaLabel, className,
}: {
  value: string;
  onChange: (v: string) => void;
  lang: CrmLang;
  withTime?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const L = DATE_INPUT_TEXT[lang] ?? DATE_INPUT_TEXT.pt;
  const [text, setText] = useState(() => formatDateInput(value, lang, withTime));
  const [open, setOpen] = useState(false);
  // Valor trocado por fora (ex.: limpo depois de salvar a tarefa) → atualiza o texto.
  useEffect(() => {
    setText((cur) => (parseDateInput(cur, lang, withTime) === (value ?? '') ? cur : formatDateInput(value, lang, withTime)));
  }, [value, lang, withTime]);
  const parsed = parseDateInput(text, lang, withTime);
  const invalid = parsed === null;
  const selected = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : undefined;
  })();
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={withTime ? L.dateTime : L.date}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title={invalid ? L.invalid : undefined}
        disabled={disabled}
        className={invalid ? 'border-destructive' : undefined}
        onChange={(e) => {
          const next = maskDateInput(e.target.value, withTime);
          setText(next);
          const v = parseDateInput(next, lang, withTime);
          if (v !== null) onChange(v);
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={L.pick}
            title={L.pick}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            locale={DF_LOCALE[lang] ?? ptBR}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (!d) return;
              const v = withPickedDay(d, value, withTime);
              onChange(v);
              setText(formatDateInput(v, lang, withTime));
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

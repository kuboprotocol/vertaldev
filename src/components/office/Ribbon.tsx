// Componentes de faixa de ferramentas do Vertal Office: abas de menu, grupos e botões.
import React from 'react';

export interface RibbonTab {
  id: string;
  label: string;
}

/** Abas de menu (Início, Inserir, ...). Fica acima da faixa de ferramentas. */
export function RibbonTabs({
  tabs,
  active,
  onChange,
  trailing,
}: {
  tabs: RibbonTab[];
  active: string;
  onChange: (id: string) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-2 border-b border-slate-200 bg-white px-2">
      <div role="tablist" aria-label="Menus do aplicativo" className="flex min-w-0 gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.id)}
              className={`relative whitespace-nowrap px-3 py-2 text-[13px] font-medium transition ${
                on ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
              {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-600" aria-hidden />}
            </button>
          );
        })}
      </div>
      {trailing && <div className="shrink-0 pb-1">{trailing}</div>}
    </div>
  );
}

/** Faixa de ferramentas: uma linha de grupos, com rolagem horizontal no celular. */
export function RibbonBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-200 bg-[#fafbfc] px-2 py-1.5">
      {children}
    </div>
  );
}

/** Grupo de botões com rótulo embaixo, separado por uma linha vertical. */
export function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col justify-between gap-1 border-r border-slate-200 px-2 pb-0.5 last:border-r-0">
      <div className="flex items-center gap-0.5">{children}</div>
      <span className="text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
    </div>
  );
}

/** Botão de ferramenta. Com `pressed`, funciona como alternador (negrito ligado/desligado). */
export function RibbonButton({
  icon,
  label,
  onClick,
  pressed,
  disabled,
  wide,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  wide?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex flex-col items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-40 ${
        wide ? 'min-w-[64px] px-2' : 'h-8 w-8'
      } ${
        primary
          ? 'h-auto gap-0.5 bg-blue-600 px-2.5 py-1 text-white shadow-sm hover:bg-blue-700'
          : pressed
            ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
            : 'text-slate-700 hover:bg-slate-200/70'
      } ${wide && !primary ? 'h-auto gap-0.5 py-1 text-[11px] font-medium' : ''}`}
    >
      {icon}
      {wide && <span className="leading-none">{label}</span>}
    </button>
  );
}

/** Lista suspensa compacta (estilo, tamanho de fonte, tema). */
export function RibbonSelect({
  label,
  value,
  options,
  onChange,
  width = 'w-32',
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  width?: string;
}) {
  return (
    <select
      aria-label={label}
      title={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${width} h-8 rounded border border-slate-300 bg-white px-2 text-[13px] text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Estilos do widget Vertal Clock. Ficam dentro do Shadow DOM: não vazam para o
// site que incorpora e o CSS do site não quebra o relógio. O site ajusta a marca
// pelas variáveis --vc-accent, --vc-accent-2, --vc-bg, --vc-radius e --vc-font.
export const CLOCK_CSS = /* css */ `
:host { display: block; container-type: inline-size; }
:host([hidden]) { display: none; }
* { box-sizing: border-box; }
.vc {
  --accent: var(--vc-accent, #8b7bff);
  --accent2: var(--vc-accent-2, #22d3ee);
  --bg: var(--vc-bg, radial-gradient(120% 80% at 15% 0%, #1b1840 0%, transparent 60%), radial-gradient(90% 70% at 100% 100%, #062a36 0%, transparent 55%), #0a0b12);
  --fg: #f4f5fb; --muted: #9aa0b8; --line: rgba(255,255,255,.09); --card: rgba(255,255,255,.045);
  --card-hover: rgba(255,255,255,.08); --field: rgba(0,0,0,.28); --danger: #ff6b81; --shadow: 0 24px 60px -24px rgba(0,0,0,.7);
  color-scheme: dark;
  position: relative; display: flex; flex-direction: column; overflow: hidden;
  min-height: var(--vc-min-height, 560px); height: 100%;
  border-radius: var(--vc-radius, 28px); background: var(--bg); color: var(--fg);
  font-family: var(--vc-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 15px; line-height: 1.4; -webkit-font-smoothing: antialiased;
}
.vc[data-theme="light"] {
  --bg: var(--vc-bg, radial-gradient(120% 80% at 15% 0%, #e8e5ff 0%, transparent 60%), radial-gradient(90% 70% at 100% 100%, #d9f6fb 0%, transparent 55%), #f7f8fc);
  --fg: #12131c; --muted: #5d6380; --line: rgba(15,18,40,.1); --card: rgba(255,255,255,.75);
  --card-hover: #fff; --field: rgba(15,18,40,.05); --danger: #d92d4a; --shadow: 0 24px 60px -28px rgba(40,40,90,.35);
  color-scheme: light;
}
@media (prefers-color-scheme: light) {
  .vc[data-theme="auto"] {
    --bg: var(--vc-bg, radial-gradient(120% 80% at 15% 0%, #e8e5ff 0%, transparent 60%), radial-gradient(90% 70% at 100% 100%, #d9f6fb 0%, transparent 55%), #f7f8fc);
    --fg: #12131c; --muted: #5d6380; --line: rgba(15,18,40,.1); --card: rgba(255,255,255,.75);
    --card-hover: #fff; --field: rgba(15,18,40,.05); --danger: #d92d4a; --shadow: 0 24px 60px -28px rgba(40,40,90,.35);
    color-scheme: light;
  }
}
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; padding: 0; -webkit-tap-highlight-color: transparent; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
svg { width: 1.15em; height: 1.15em; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }

.top { display: flex; align-items: center; gap: 8px; padding: 14px 14px 6px; }
.tabs { display: flex; flex: 1; gap: 4px; padding: 4px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); min-width: 0; }
.tab { flex: 1; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 8px; border-radius: 999px; color: var(--muted); font-weight: 600; font-size: 13px; transition: color .15s, background .15s; }
.tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab:hover { color: var(--fg); }
.tab[aria-selected="true"] { color: #fff; background: linear-gradient(135deg, var(--accent), var(--accent2)); box-shadow: 0 6px 18px -8px var(--accent); }
@container (max-width: 460px) { .tabs { border-radius: 22px; } .tab { flex-direction: column; gap: 3px; padding: 8px 2px; border-radius: 18px; font-size: 10.5px; } .tab svg { width: 1.7em; height: 1.7em; } }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 999px; color: var(--muted); border: 1px solid var(--line); background: var(--card); transition: color .15s, background .15s; }
.icon-btn:hover { color: var(--fg); background: var(--card-hover); }
.icon-btn.small { width: 34px; height: 34px; border-color: transparent; background: transparent; }
.icon-btn.small:hover { background: var(--card-hover); }

.body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 16px 22px; scrollbar-width: thin; }
.wrap { max-width: 640px; margin: 0 auto; }

.hero { text-align: center; padding: 22px 0 18px; }
.hero-time { display: inline-flex; align-items: baseline; font-weight: 200; letter-spacing: -.045em; line-height: 1; font-size: clamp(60px, 21cqi, 132px); }
.hero-time small { font-size: .34em; font-weight: 400; letter-spacing: 0; margin-left: .18em; color: var(--accent2); min-width: 1.3em; text-align: left; }
.hero-date { margin-top: 10px; font-size: 16px; color: var(--fg); }
.hero-date::first-letter { text-transform: uppercase; }
.hero-zone { margin-top: 4px; font-size: 13px; color: var(--muted); }

.section { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 18px 2px 10px; }
.section h2 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 13px; border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--fg); background: var(--card); border: 1px solid var(--line); transition: background .15s, border-color .15s; }
.pill:hover { background: var(--card-hover); border-color: var(--accent); }
.pill.primary { color: #fff; border-color: transparent; background: linear-gradient(135deg, var(--accent), var(--accent2)); }
.pill.primary:hover { filter: brightness(1.08); }
.pill.danger { color: var(--danger); }
.pill:disabled { opacity: .45; cursor: not-allowed; }

.list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.row { display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 16px; border-radius: 18px; background: var(--card); border: 1px solid var(--line); }
.row.click { cursor: pointer; transition: background .15s; }
.row.click:hover { background: var(--card-hover); }
.row .grow { flex: 1; min-width: 0; }
.row .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row .sub { font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row .big { font-size: 30px; font-weight: 300; letter-spacing: -.02em; line-height: 1.1; white-space: nowrap; }
.row .big small { font-size: .45em; font-weight: 500; color: var(--muted); margin-left: 3px; }
.row.off .big, .row.off .title { color: var(--muted); }
.flag { font-size: 22px; line-height: 1; width: 28px; text-align: center; }
.daynight { color: var(--muted); display: inline-flex; }
.daynight.lit { color: #f5b942; }
.empty { padding: 26px 16px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 18px; font-size: 14px; }
.hint { margin: 14px 4px 0; font-size: 12.5px; color: var(--muted); }
.notice { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; padding: 12px 14px; border-radius: 16px; background: var(--card); border: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.notice span { flex: 1; min-width: 180px; }
.summary { text-align: center; padding: 20px 0 6px; }
.summary .k { font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); }
.summary .v { margin-top: 4px; font-size: 22px; font-weight: 500; }

.switch { position: relative; width: 50px; height: 30px; border-radius: 999px; background: var(--field); border: 1px solid var(--line); transition: background .18s; flex: none; }
.switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35); transition: transform .18s; }
.switch[aria-checked="true"] { background: linear-gradient(135deg, var(--accent), var(--accent2)); border-color: transparent; }
.switch[aria-checked="true"]::after { transform: translateX(20px); }

.display { text-align: center; padding: 34px 0 22px; font-weight: 200; letter-spacing: -.035em; line-height: 1; font-size: clamp(52px, 17cqi, 104px); }
.controls { display: flex; justify-content: center; gap: 14px; margin-bottom: 8px; }
.round { min-width: 108px; padding: 14px 22px; border-radius: 999px; font-weight: 700; font-size: 15px; background: var(--card); border: 1px solid var(--line); transition: background .15s, filter .15s; }
.round:hover { background: var(--card-hover); }
.round.go { color: #fff; border-color: transparent; background: linear-gradient(135deg, var(--accent), var(--accent2)); }
.round.go:hover { filter: brightness(1.08); }
.round.halt { color: #fff; border-color: transparent; background: var(--danger); }
.round:disabled { opacity: .4; cursor: not-allowed; }
.lap { display: flex; justify-content: space-between; gap: 12px; padding: 11px 6px; border-bottom: 1px solid var(--line); font-size: 15px; }
.lap .n { color: var(--muted); }
.lap.best .d { color: #34d399; }
.lap.worst .d { color: var(--danger); }
.lap .t { color: var(--muted); min-width: 92px; text-align: right; }

.dial { display: flex; justify-content: center; align-items: flex-end; gap: 10px; padding: 24px 0 14px; }
.dial label { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.dial input { width: clamp(72px, 24cqi, 104px); padding: 12px 4px; text-align: center; font-size: clamp(32px, 10cqi, 46px); font-weight: 300; border-radius: 18px; border: 1px solid var(--line); background: var(--field); -moz-appearance: textfield; }
.dial input::-webkit-outer-spin-button, .dial input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.presets { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 14px; }
.field { width: 100%; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--field); }
.field::placeholder { color: var(--muted); }
.timer { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 20px; background: var(--card); border: 1px solid var(--line); }
.timer.done { border-color: var(--accent2); }
.ringp { position: relative; width: 64px; height: 64px; flex: none; }
.ringp svg { width: 64px; height: 64px; transform: rotate(-90deg); stroke-width: 5; }
.ringp .track { stroke: var(--line); }
.ringp .bar { stroke: var(--accent2); transition: stroke-dashoffset .25s linear; }
.timer .big { font-size: 32px; font-weight: 300; letter-spacing: -.02em; line-height: 1.1; }

.sheet-bg { position: absolute; inset: 0; z-index: 5; display: flex; align-items: flex-end; justify-content: center; background: rgba(4,5,12,.6); backdrop-filter: blur(6px); animation: fade .15s ease-out; }
.sheet { width: 100%; max-width: 560px; max-height: 92%; display: flex; flex-direction: column; border-radius: 26px 26px 0 0; background: var(--sheet, #14151f); border: 1px solid var(--line); border-bottom: 0; box-shadow: var(--shadow); animation: rise .2s ease-out; }
.vc[data-theme="light"] .sheet { --sheet: #fff; }
@media (prefers-color-scheme: light) { .vc[data-theme="auto"] .sheet { --sheet: #fff; } }
@container (min-width: 620px) { .sheet-bg { align-items: center; } .sheet { border-radius: 26px; border-bottom: 1px solid var(--line); } }
.sheet-head { display: flex; align-items: center; gap: 8px; padding: 14px 14px 10px 20px; }
.sheet-head h3 { flex: 1; margin: 0; font-size: 17px; font-weight: 700; }
.sheet-body { overflow-y: auto; padding: 4px 20px 20px; display: grid; gap: 16px; }
.sheet-foot { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 20px 18px; border-top: 1px solid var(--line); }
.sheet-foot .spacer { flex: 1; }
.form-row { display: grid; gap: 7px; }
.form-row > span, .form-row > label { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.time-input { width: 100%; padding: 12px; text-align: center; font-size: 44px; font-weight: 300; border-radius: 18px; border: 1px solid var(--line); background: var(--field); }
.days { display: flex; gap: 6px; }
.day { flex: 1; aspect-ratio: 1; max-width: 48px; border-radius: 50%; font-size: 12px; font-weight: 700; color: var(--muted); background: var(--field); border: 1px solid var(--line); }
.day[aria-pressed="true"] { color: #fff; border-color: transparent; background: linear-gradient(135deg, var(--accent), var(--accent2)); }
.set-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.set-row select, .set-row input { width: auto; min-width: 120px; }
.results { display: grid; gap: 4px; max-height: 46cqh; min-height: 120px; }
.result { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border-radius: 14px; text-align: left; }
.result:hover { background: var(--card-hover); }
.result .grow { flex: 1; min-width: 0; }

.ring { position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; text-align: center; background: radial-gradient(80% 60% at 50% 35%, color-mix(in srgb, var(--accent) 55%, transparent), transparent 70%), rgba(6,7,14,.94); color: #fff; animation: fade .2s ease-out; }
.ring .bell { width: 84px; height: 84px; display: grid; place-items: center; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--accent2)); animation: shake .9s ease-in-out infinite; }
.ring .bell svg { width: 40px; height: 40px; }
.ring .rt { font-size: clamp(54px, 18cqi, 96px); font-weight: 200; letter-spacing: -.04em; line-height: 1; }
.ring .rl { font-size: 18px; font-weight: 600; }
.ring .rs { font-size: 13px; opacity: .7; }
.ring .controls { margin-top: 18px; }
.ring .round { color: #fff; background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.2); }
.ring .round.go { background: #fff; color: #111; }
@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { transform: translateY(24px); opacity: 0; } }
@keyframes shake { 0%, 100% { transform: rotate(0); } 15% { transform: rotate(-14deg); } 30% { transform: rotate(12deg); } 45% { transform: rotate(-8deg); } 60% { transform: rotate(6deg); } 75% { transform: rotate(0); } }
@media (prefers-reduced-motion: reduce) { .ring .bell, .sheet, .sheet-bg, .ring { animation: none; } * { transition: none !important; } }
.hero-time .ampm { font-size: .2em; font-weight: 600; letter-spacing: .04em; margin-left: .3em; color: var(--muted); }
.locate { display: flex; justify-content: center; margin-top: 12px; }
.row .big .ampm { font-size: .42em; font-weight: 600; color: var(--muted); margin-left: 4px; }
.timer .grow { flex: 1; min-width: 0; }
.timer .title { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.timer .acts { display: flex; gap: 2px; flex: none; }
.timer.done .big { color: var(--accent2); }
.start-row { display: flex; gap: 8px; align-items: center; }
.start-row .field { flex: 1; min-width: 0; }
.err { color: var(--danger); font-size: 13px; }
.result:disabled { opacity: .5; cursor: default; }
.result .sub { font-size: 12.5px; color: var(--muted); }
.result .when { color: var(--muted); font-variant-numeric: tabular-nums; }
.results { overflow-y: auto; align-content: start; }
[hidden] { display: none !important; }
`;

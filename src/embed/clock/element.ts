// Vertal Clock — Web Component (Shadow DOM).
// Usável dentro do app React, no Vertal Chat ou incorporado em qualquer site.
//
// O corpo é redesenhado quando o estado muda; a cada tique só os números são
// trocados, para não apagar o que o usuário está digitando.
import { STRINGS, type ClockStrings } from './strings';
import { CLOCK_CSS } from './styles';
import { dayNames, describeDays, describeWait, nextRing, parseClockTime, type Alarm, type ClockLang } from '@/lib/clock/alarms';
import { CLOCK_PLACE_KEY } from '@/lib/clock/keys';
import {
  CLOCK_LIMITS, addCity, formatDuration, formatStopwatch, getClockState, pauseTimer, removeAlarm, removeCity,
  removeTimer, resetTimer, resumeTimer, saveAlarm, setAlarmEnabled, startTimer, stopwatchElapsed, stopwatchLap,
  stopwatchReset, stopwatchStart, stopwatchStop, subscribeClock, timerRemaining, updateSettings,
  ALARM_SOUNDS, customSoundId, soundRef, type AlarmSound, type CityRef,
} from '@/lib/clock/store';
import { addSoundFile, removeSoundFile } from '@/lib/clock/soundFiles';
import {
  dismissRing, getRinging, requestClockNotifications, snoozeRing, startClockEngine, subscribeRinging, type Ring,
} from '@/lib/clock/engine';
import {
  CITIES, findCityByTz, flagEmoji, isDaytime, isValidTimeZone, localTimeZone, offsetLabel,
  searchCities, zoneDiff, zoneParts, type City,
} from '@/lib/clock/zones';
import { previewAlarmSound, stopSoundPreview, unlockAudio } from '@/lib/clock/sound';

type Tab = 'clock' | 'alarm' | 'stopwatch' | 'timer';

const TAB_ALIASES: Record<string, Tab> = {
  clock: 'clock', 'relógio': 'clock', relogio: 'clock',
  alarm: 'alarm', alarme: 'alarm',
  stopwatch: 'stopwatch', 'cronômetro': 'stopwatch', cronometro: 'stopwatch',
  timer: 'timer',
};

type Sheet =
  | { type: 'city' }
  | { type: 'settings' }
  | { type: 'alarm'; id: string; days: number[]; error: string };

interface Place {
  tz: string;
  label: string;
}

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICON = {
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  alarm: svg('<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.2 1.6M4.5 5.5 7 3.5M19.5 5.5 17 3.5"/>'),
  stopwatch: svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 2.8h4M18.2 7.3l1.3-1.3"/>'),
  timer: svg('<path d="M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 1.6 3.2L12 12l2.4-2.3A4 4 0 0 0 16 6.5V3M8 21v-3.5a4 4 0 0 1 1.6-3.2L12 12l2.4 2.3a4 4 0 0 1 1.6 3.2V21"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.3-.9-2 3.4 1.9 1.5a7.6 7.6 0 0 0 0 3l-1.9 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  pin: svg('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  trash: svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7"/>'),
  play: svg('<path d="M8 5.5v13l10-6.5z"/>'),
  pause: svg('<path d="M8.5 5.5v13M15.5 5.5v13"/>'),
  reset: svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4M4.5 4.5v4h4"/>'),
  upload: svg('<path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 15.5v3.5h14v-3.5"/>'),
  bell: svg('<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>'),
};

const esc = (text: unknown): string =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pad = (n: number) => String(n).padStart(2, '0');
const TIMER_PRESETS_MIN = [1, 3, 5, 10, 15, 30];
const RING_LEN = 2 * Math.PI * 27;

function readPlace(): Place | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CLOCK_PLACE_KEY) ?? 'null') as Partial<Place> | null;
    return raw && isValidTimeZone(raw.tz) && typeof raw.label === 'string' && raw.label ? { tz: raw.tz, label: raw.label.slice(0, 60) } : null;
  } catch {
    return null;
  }
}

export class VertalClockElement extends HTMLElement {
  static get observedAttributes() {
    return ['lang', 'tab', 'theme', 'ring-ui'];
  }

  private readonly root: ShadowRoot;
  private readonly vc: HTMLElement;
  private readonly topEl: HTMLElement;
  private readonly wrapEl: HTMLElement;
  private readonly sheetEl: HTMLElement;
  private readonly ringEl: HTMLElement;

  private language: ClockLang = 'pt';
  private t: ClockStrings = STRINGS.pt;
  private tab: Tab = 'clock';
  private ringUI = true;
  private stops: (() => void)[] = [];
  private ringing: Ring[] = [];
  private sheet: Sheet | null = null;
  private cityResults: City[] = [];
  private place: Place | null = null;
  private locating = false;
  private locateMsg = '';
  private dial = { h: '', m: '', s: '', label: '' };
  private minuteKey = -1;
  private frame = 0;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML =
      `<style>${CLOCK_CSS}</style><div class="vc" data-theme="auto"><div class="top"></div>` +
      `<div class="body"><div class="wrap"></div></div><div class="sheet-bg" hidden></div><div class="ring" hidden></div></div>`;
    this.vc = this.root.querySelector('.vc')!;
    this.topEl = this.root.querySelector('.top')!;
    this.wrapEl = this.root.querySelector('.wrap')!;
    this.sheetEl = this.root.querySelector('.sheet-bg')!;
    this.ringEl = this.root.querySelector('.ring')!;
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    this.root.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape' && this.sheet) this.closeSheet();
    });
  }

  connectedCallback() {
    this.readAttributes();
    this.place = readPlace();
    this.ringing = getRinging();
    this.stops.push(
      startClockEngine(),
      subscribeClock(() => this.renderBody()),
      subscribeRinging((rings) => {
        this.ringing = rings;
        this.renderRing();
      }),
    );
    const interval = setInterval(() => this.tick(), 250);
    this.stops.push(() => clearInterval(interval), () => cancelAnimationFrame(this.frame));
    this.renderAll();
  }

  disconnectedCallback() {
    this.stops.forEach((stop) => stop());
    this.stops = [];
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.readAttributes();
    this.renderAll();
  }

  private readAttributes() {
    this.language = this.getAttribute('lang') === 'en' ? 'en' : 'pt';
    this.t = STRINGS[this.language];
    this.tab = TAB_ALIASES[(this.getAttribute('tab') ?? '').toLowerCase()] ?? this.tab;
    this.ringUI = this.getAttribute('ring-ui') !== 'off';
    const theme = this.getAttribute('theme');
    this.vc.dataset.theme = theme === 'light' || theme === 'dark' ? theme : 'auto';
  }

  private get locale() {
    return this.language === 'pt' ? 'pt-BR' : 'en-US';
  }

  // ─── Desenho ────────────────────────────────────────────────────────────

  private renderAll() {
    this.renderTop();
    this.renderBody();
    this.renderSheet();
    this.renderRing();
  }

  private renderTop() {
    const tabs: [Tab, string, string][] = [
      ['clock', this.t.tabClock, ICON.clock], ['alarm', this.t.tabAlarm, ICON.alarm],
      ['stopwatch', this.t.tabStopwatch, ICON.stopwatch], ['timer', this.t.tabTimer, ICON.timer],
    ];
    this.topEl.innerHTML =
      `<div class="tabs" role="tablist">${tabs.map(([key, label, icon]) =>
        `<button class="tab" role="tab" data-act="tab" data-tab="${key}" aria-selected="${this.tab === key}">${icon}<span>${esc(label)}</span></button>`).join('')}</div>` +
      `<button class="icon-btn" data-act="settings" aria-label="${esc(this.t.settings)}" title="${esc(this.t.settings)}">${ICON.gear}</button>`;
  }

  private renderBody() {
    const now = Date.now();
    this.minuteKey = Math.floor(now / 60_000);
    const html = this.tab === 'clock' ? this.clockHtml(now)
      : this.tab === 'alarm' ? this.alarmHtml(now)
      : this.tab === 'stopwatch' ? this.stopwatchHtml(now)
      : this.timerHtml(now);
    this.wrapEl.innerHTML = html;
    this.tick();
    this.runStopwatchFrames();
  }

  private timeHtml(tz: string, now: number, seconds = false): string {
    const p = zoneParts(tz, now);
    const hour12 = getClockState().settings.hour12;
    const hh = hour12 ? String(p.hour % 12 || 12) : pad(p.hour);
    return `${hh}:${pad(p.minute)}${seconds ? `<small>${pad(p.second)}</small>` : ''}${hour12 ? `<span class="ampm">${p.hour < 12 ? 'AM' : 'PM'}</span>` : ''}`;
  }

  private cityOf(ref: CityRef): City {
    return CITIES.find((c) => c.tz === ref.tz && c.city === ref.label) ?? findCityByTz(ref.tz);
  }

  private diffText(tz: string, baseTz: string, now: number): string {
    const d = zoneDiff(tz, baseTz, now);
    const day = d.dayShift > 0 ? this.t.tomorrow : d.dayShift < 0 ? this.t.yesterday : this.t.today;
    if (d.minutes === 0) return `${day}, ${this.t.sameTime}`;
    const abs = Math.abs(d.minutes);
    const amount = `${Math.floor(abs / 60)}h${abs % 60 ? pad(abs % 60) : ''}`;
    return `${day}, ${d.minutes > 0 ? '+' : '−'}${amount}`;
  }

  private clockHtml(now: number): string {
    const state = getClockState();
    const deviceTz = localTimeZone();
    const zone = this.place ?? { tz: deviceTz, label: findCityByTz(deviceTz).city };
    const rows = state.cities.map((c, i) => {
      const day = isDaytime(c.tz, now);
      return `<li class="row"><span class="flag">${flagEmoji(this.cityOf(c).cc)}</span>` +
        `<div class="grow"><div class="title">${esc(c.label)}</div><div class="sub">${esc(this.diffText(c.tz, deviceTz, now))}</div></div>` +
        `<span class="daynight${day ? ' lit' : ''}">${day ? ICON.sun : ICON.moon}</span>` +
        `<div class="big num" data-city-time="${esc(c.tz)}">${this.timeHtml(c.tz, now)}</div>` +
        `<button class="icon-btn small" data-act="remove-city" data-i="${i}" aria-label="${esc(this.t.remove)} ${esc(c.label)}" title="${esc(this.t.remove)}">${ICON.close}</button></li>`;
    }).join('');
    return `<div class="hero"><div class="hero-time num" data-hero>${this.timeHtml(deviceTz, now, true)}</div>` +
      `<div class="hero-date">${esc(new Intl.DateTimeFormat(this.locale, { timeZone: deviceTz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now))}</div>` +
      `<div class="hero-zone">${this.place ? '📍 ' : ''}${esc(zone.label)} · ${esc(offsetLabel(zone.tz, now))}</div>` +
      `<div class="locate"><button class="pill" data-act="locate" ${this.locating ? 'disabled' : ''}>${ICON.pin}${esc(this.locating ? this.t.locating : this.t.locate)}</button></div>` +
      (this.locateMsg ? `<div class="hint" role="status" style="text-align:center">${esc(this.locateMsg)}</div>` : '') +
      `</div><div class="section"><h2>${esc(this.t.worldClock)}</h2>` +
      `<button class="pill" data-act="add-city">${ICON.plus}${esc(this.t.addCity)}</button></div>` +
      (rows ? `<ul class="list">${rows}</ul>` : `<div class="empty">${esc(this.t.noCities)}</div>`);
  }

  private nextAlarm(now: number): { alarm: Alarm; at: number } | null {
    const deviceTz = localTimeZone();
    let best: { alarm: Alarm; at: number } | null = null;
    for (const alarm of getClockState().alarms) {
      const at = alarm.snoozeUntil ?? (alarm.enabled ? nextRing(alarm, now, deviceTz) : null);
      if (at !== null && (!best || at < best.at)) best = { alarm, at };
    }
    return best;
  }

  private alarmTime(time: string): string {
    if (!getClockState().settings.hour12) return esc(time);
    const [h, m] = time.split(':').map(Number);
    return `${h % 12 || 12}:${pad(m)}<span class="ampm">${h < 12 ? 'AM' : 'PM'}</span>`;
  }

  private alarmHtml(now: number): string {
    const { alarms } = getClockState();
    const next = this.nextAlarm(now);
    const summary = alarms.length === 0 ? ''
      : `<div class="summary"><div class="k">${esc(next ? this.t.nextAlarm : this.t.alarmOff)}</div>` +
        (next ? `<div class="v"><span class="num">${this.alarmTime(next.alarm.time)}</span> · <span data-next-wait>${esc(describeWait(next.at - now, this.language))}</span></div>` : '') + `</div>`;
    const rows = [...alarms].sort((a, b) => a.time.localeCompare(b.time)).map((a) => {
      const sub = [a.label, describeDays(a.days, this.language), a.tzLabel, a.sound ? this.soundName(a.sound) : ''].filter(Boolean).join(' · ');
      return `<li class="row click${a.enabled ? '' : ' off'}" data-act="edit-alarm" data-id="${esc(a.id)}">` +
        `<div class="grow"><div class="big num">${this.alarmTime(a.time)}</div><div class="sub">${esc(sub)}</div></div>` +
        `<button class="switch" role="switch" data-act="toggle-alarm" data-id="${esc(a.id)}" aria-checked="${a.enabled}" aria-label="${esc(this.t.alarm)} ${esc(a.time)}"></button></li>`;
    }).join('');
    return summary + `<div class="section"><h2>${esc(this.t.alarms)}</h2>` +
      `<button class="pill primary" data-act="new-alarm">${ICON.plus}${esc(this.t.newAlarm)}</button></div>` +
      (rows ? `<ul class="list">${rows}</ul>` : `<div class="empty">${esc(this.t.noAlarms)}</div>`) +
      `<p class="hint">${esc(this.t.alarmHint)}</p>` + this.notificationHtml();
  }

  private notificationHtml(): string {
    if (typeof Notification === 'undefined') return '';
    if (Notification.permission === 'granted') return `<div class="notice"><span>${esc(this.t.notificationsOn)}</span></div>`;
    if (Notification.permission === 'denied') return `<div class="notice"><span>${esc(this.t.notificationsBlocked)}</span></div>`;
    return `<div class="notice"><span>${esc(this.t.notificationsHint)}</span>` +
      `<button class="pill primary" data-act="notify">${ICON.bell}${esc(this.t.enableNotifications)}</button></div>`;
  }

  private stopwatchHtml(now: number): string {
    const sw = getClockState().stopwatch;
    const running = sw.startedAt !== null;
    const elapsed = stopwatchElapsed(sw, now);
    const splits = sw.laps.map((total, i) => total - (i ? sw.laps[i - 1] : 0));
    const best = splits.length > 1 ? Math.min(...splits) : -1;
    const worst = splits.length > 1 ? Math.max(...splits) : -1;
    const laps = splits.map((split, i) =>
      `<div class="lap${split === best ? ' best' : split === worst ? ' worst' : ''}"><span class="n">${esc(this.t.lap)} ${i + 1}</span>` +
      `<span class="d num">${formatStopwatch(split)}</span><span class="t num">${formatStopwatch(sw.laps[i])}</span></div>`).reverse().join('');
    const second = running
      ? `<button class="round" data-act="sw-lap" ${sw.laps.length >= CLOCK_LIMITS.laps ? 'disabled' : ''}>${esc(this.t.lap)}</button>`
      : `<button class="round" data-act="sw-reset" ${elapsed === 0 ? 'disabled' : ''}>${esc(this.t.reset)}</button>`;
    const main = running
      ? `<button class="round halt" data-act="sw-stop">${esc(this.t.stop)}</button>`
      : `<button class="round go" data-act="sw-start">${esc(elapsed > 0 ? this.t.resume : this.t.start)}</button>`;
    return `<div class="display num" data-sw>${formatStopwatch(elapsed)}</div><div class="controls">${second}${main}</div>` +
      (laps ? `<div class="section"><h2>${esc(this.t.laps)}</h2></div><div>${laps}</div>` : '');
  }

  private timerHtml(now: number): string {
    const { timers } = getClockState();
    const field = (key: 'h' | 'm' | 's', unit: string, max: number) =>
      `<label><input class="num" type="number" inputmode="numeric" min="0" max="${max}" placeholder="00" data-dial="${key}" value="${esc(this.dial[key])}" aria-label="${esc(unit)}"/>${esc(unit)}</label>`;
    const items = timers.map((timer) => {
      const left = timerRemaining(timer, now);
      const running = timer.endsAt !== null && !timer.done;
      const offset = RING_LEN * (1 - (timer.durationMs ? left / timer.durationMs : 0));
      return `<li class="timer${timer.done ? ' done' : ''}"><div class="ringp"><svg viewBox="0 0 64 64" aria-hidden="true">` +
        `<circle class="track" cx="32" cy="32" r="27"/><circle class="bar" cx="32" cy="32" r="27" stroke-dasharray="${RING_LEN.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" data-timer-bar="${esc(timer.id)}"/></svg></div>` +
        `<div class="grow"><div class="title">${esc(timer.label || `${this.t.timer} · ${formatDuration(timer.durationMs)}`)}</div>` +
        `<div class="big num" data-timer-left="${esc(timer.id)}">${timer.done ? esc(this.t.done) : formatDuration(left)}</div></div><div class="acts">` +
        (timer.done ? '' : running
          ? `<button class="icon-btn small" data-act="timer-pause" data-id="${esc(timer.id)}" aria-label="${esc(this.t.pause)}" title="${esc(this.t.pause)}">${ICON.pause}</button>`
          : `<button class="icon-btn small" data-act="timer-resume" data-id="${esc(timer.id)}" aria-label="${esc(this.t.resume)}" title="${esc(this.t.resume)}">${ICON.play}</button>`) +
        `<button class="icon-btn small" data-act="timer-reset" data-id="${esc(timer.id)}" aria-label="${esc(this.t.restart)}" title="${esc(this.t.restart)}">${ICON.reset}</button>` +
        `<button class="icon-btn small" data-act="timer-remove" data-id="${esc(timer.id)}" aria-label="${esc(this.t.delete)}" title="${esc(this.t.delete)}">${ICON.trash}</button></div></li>`;
    }).join('');
    return `<div class="dial">${field('h', this.t.hours, 99)}${field('m', this.t.minutes, 59)}${field('s', this.t.seconds, 59)}</div>` +
      `<div class="presets">${TIMER_PRESETS_MIN.map((min) => `<button class="pill" data-act="timer-preset" data-min="${min}">${min} min</button>`).join('')}</div>` +
      `<div class="start-row"><input class="field" type="text" maxlength="${CLOCK_LIMITS.labelChars}" placeholder="${esc(this.t.timerLabel)}" data-dial="label" value="${esc(this.dial.label)}"/>` +
      `<button class="round go" data-act="timer-start">${esc(this.t.start)}</button></div>` +
      `<div class="section"><h2>${esc(this.t.timers)}</h2></div>` +
      (items ? `<ul class="list">${items}</ul>` : `<div class="empty">${esc(this.t.noTimers)}</div>`);
  }

  // ─── Tique: só os números mudam ─────────────────────────────────────────

  private tick() {
    if (!this.isConnected) return;
    const now = Date.now();
    if (this.tab === 'clock' || this.tab === 'alarm') {
      // Na virada do minuto mudam hora das cidades, "amanhã/ontem" e o próximo alarme.
      if (Math.floor(now / 60_000) !== this.minuteKey) {
        this.renderBody();
        return;
      }
      const hero = this.wrapEl.querySelector('[data-hero]');
      if (hero) hero.innerHTML = this.timeHtml(localTimeZone(), now, true);
    } else if (this.tab === 'timer') {
      for (const timer of getClockState().timers) {
        if (timer.done) continue;
        const left = timerRemaining(timer, now);
        const text = this.wrapEl.querySelector(`[data-timer-left="${timer.id}"]`);
        if (text) text.textContent = formatDuration(left);
        this.wrapEl.querySelector(`[data-timer-bar="${timer.id}"]`)
          ?.setAttribute('stroke-dashoffset', (RING_LEN * (1 - left / timer.durationMs)).toFixed(1));
      }
    } else {
      this.paintStopwatch(now);
    }
  }

  private paintStopwatch(now: number) {
    const el = this.wrapEl.querySelector('[data-sw]');
    if (el) el.textContent = formatStopwatch(stopwatchElapsed(getClockState().stopwatch, now));
  }

  private runStopwatchFrames() {
    cancelAnimationFrame(this.frame);
    const step = () => {
      if (!this.isConnected || this.tab !== 'stopwatch' || getClockState().stopwatch.startedAt === null) return;
      this.paintStopwatch(Date.now());
      this.frame = requestAnimationFrame(step);
    };
    step();
  }

  // ─── Folhas (cidade, alarme, preferências) ──────────────────────────────

  private openSheet(sheet: Sheet) {
    this.sheet = sheet;
    this.renderSheet();
    const focus = this.sheetEl.querySelector<HTMLElement>('[data-autofocus]');
    // No celular o foco automático abre o teclado por cima da folha: só no computador.
    if (focus && window.matchMedia('(hover: hover)').matches) focus.focus();
  }

  private closeSheet() {
    stopSoundPreview();
    this.sheet = null;
    this.renderSheet();
  }

  private soundName(sound: AlarmSound): string {
    const custom = customSoundId(sound);
    if (!custom) return this.t.sounds[sound] ?? sound;
    return getClockState().customSounds.find((c) => c.id === custom)?.name ?? this.t.sounds.classic;
  }

  /** Lista de toques + "Ouvir" + envio de um som do aparelho. `withDefault`: primeira opção "Padrão". */
  private soundPickerHtml(field: string, selected: AlarmSound | '', withDefault: boolean): string {
    const { settings, customSounds } = getClockState();
    const option = (value: string, label: string) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
    return `<div class="sound-pick"><select id="vc-${field}" class="field" data-field="${field}" data-sound-select>` +
      (withDefault ? option('', `${this.t.useDefault} (${this.soundName(settings.sound)})`) : '') +
      `<optgroup label="${esc(this.t.ringtones)}">${ALARM_SOUNDS.map((key) => option(key, this.t.sounds[key])).join('')}</optgroup>` +
      `<optgroup label="${esc(this.t.mySounds)}" data-my-sounds ${customSounds.length ? '' : 'hidden'}>${customSounds.map((c) => option(soundRef(c.id), c.name)).join('')}</optgroup>` +
      `</select><button class="pill" data-act="preview-sound">${ICON.play}${esc(this.t.listen)}</button></div>` +
      `<div class="sound-up"><button class="pill" data-act="upload-sound">${ICON.upload}${esc(this.t.uploadSound)}</button>` +
      `<input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac" data-field="sound-file" hidden/>` +
      `<span class="hint">${esc(this.t.uploadHint)}</span></div><div class="err" role="alert" data-sound-msg hidden></div>`;
  }

  private async uploadSound(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = ''; // deixa escolher o mesmo arquivo de novo
    if (!file) return;
    const msg = this.sheetEl.querySelector<HTMLElement>('[data-sound-msg]');
    const result = await addSoundFile(file, getClockState().customSounds.length);
    if (!msg?.isConnected) return; // a folha fechou enquanto o arquivo era guardado
    if ('reason' in result) {
      msg.textContent = { type: this.t.soundBadType, size: this.t.soundTooBig, full: this.t.soundFull, storage: this.t.soundStorage }[result.reason];
      msg.hidden = false;
      return;
    }
    msg.hidden = true;
    if (this.sheet?.type === 'settings') {
      updateSettings({ sound: result.sound });
      this.renderSheet();
    } else {
      // Na folha do alarme não redesenha, para não apagar o que já foi digitado.
      const select = this.sheetEl.querySelector<HTMLSelectElement>('[data-sound-select]');
      const group = select?.querySelector<HTMLOptGroupElement>('[data-my-sounds]');
      if (select && group) {
        group.hidden = false;
        group.append(new Option(result.name, result.sound));
        select.value = result.sound;
      }
    }
    previewAlarmSound(result.sound);
  }

  private renderSheet() {
    const sheet = this.sheet;
    this.sheetEl.hidden = !sheet;
    if (!sheet) {
      this.sheetEl.innerHTML = '';
      return;
    }
    const head = (title: string) =>
      `<div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn small" data-act="close-sheet" aria-label="${esc(this.t.close)}">${ICON.close}</button></div>`;
    let inner = '';
    if (sheet.type === 'city') {
      inner = head(this.t.addCity) +
        `<div class="sheet-body"><input class="field" type="search" data-field="city-q" data-autofocus placeholder="${esc(this.t.searchCity)}" aria-label="${esc(this.t.searchCity)}" autocomplete="off"/>` +
        `<div class="results" data-results>${this.cityResultsHtml('')}</div></div>`;
    } else if (sheet.type === 'alarm') {
      const state = getClockState();
      const alarm = state.alarms.find((a) => a.id === sheet.id);
      const zones: Place[] = [];
      for (const z of [...(alarm?.tz ? [{ tz: alarm.tz, label: alarm.tzLabel ?? findCityByTz(alarm.tz).city }] : []), ...state.cities]) {
        if (!zones.some((x) => x.tz === z.tz && x.label === z.label)) zones.push(z);
      }
      const selected = alarm?.tz ? zones.findIndex((z) => z.tz === alarm.tz && z.label === alarm.tzLabel) : -1;
      inner = head(alarm ? this.t.editAlarm : this.t.newAlarm) +
        `<div class="sheet-body"><div class="form-row"><label for="vc-time">${esc(this.t.time)}</label>` +
        `<input id="vc-time" class="time-input num" type="time" data-field="alarm-time" data-autofocus value="${esc(alarm?.time ?? '07:00')}"/></div>` +
        `<div class="form-row"><label for="vc-label">${esc(this.t.label)}</label>` +
        `<input id="vc-label" class="field" type="text" data-field="alarm-label" maxlength="${CLOCK_LIMITS.labelChars}" value="${esc(alarm?.label ?? '')}" placeholder="${esc(this.t.labelHint)}"/></div>` +
        `<div class="form-row"><span>${esc(this.t.repeat)}</span><div class="days">${dayNames(this.language).map((name, d) =>
          `<button class="day" data-act="toggle-day" data-day="${d}" aria-pressed="${sheet.days.includes(d)}">${esc(name)}</button>`).join('')}</div></div>` +
        `<div class="form-row"><label for="vc-tz">${esc(this.t.zone)}</label><select id="vc-tz" class="field" data-field="alarm-tz">` +
        `<option value="-1">${esc(this.t.deviceZone)}</option>${zones.map((z, i) =>
          `<option value="${i}" data-tz="${esc(z.tz)}" data-label="${esc(z.label)}" ${i === selected ? 'selected' : ''}>${esc(z.label)} (${esc(offsetLabel(z.tz, Date.now()))})</option>`).join('')}</select></div>` +
        `<div class="form-row"><label for="vc-alarm-sound">${esc(this.t.sound)}</label>${this.soundPickerHtml('alarm-sound', alarm?.sound ?? '', true)}</div>` +
        (sheet.error ? `<div class="err" role="alert">${esc(sheet.error)}</div>` : '') + `</div>` +
        `<div class="sheet-foot">${alarm ? `<button class="pill danger" data-act="delete-alarm">${ICON.trash}${esc(this.t.delete)}</button>` : ''}<span class="spacer"></span>` +
        `<button class="pill" data-act="close-sheet">${esc(this.t.cancel)}</button><button class="pill primary" data-act="save-alarm">${esc(this.t.save)}</button></div>`;
    } else {
      const { settings, customSounds } = getClockState();
      inner = head(this.t.settings) +
        `<div class="sheet-body"><div class="set-row"><span>${esc(this.t.format24)}</span>` +
        `<button class="switch" role="switch" data-act="toggle-24" aria-checked="${!settings.hour12}" aria-label="${esc(this.t.format24)}"></button></div>` +
        `<div class="form-row"><label for="vc-sound">${esc(this.t.soundDefault)}</label>${this.soundPickerHtml('sound', settings.sound, false)}` +
        (customSounds.length ? `<div class="my-sounds">${customSounds.map((c) =>
          `<div class="my-sound"><span>${esc(c.name)}</span><button class="icon-btn small" data-act="remove-sound" data-id="${esc(c.id)}" aria-label="${esc(this.t.removeSound)}: ${esc(c.name)}" title="${esc(this.t.removeSound)}">${ICON.trash}</button></div>`).join('')}</div>` : '') +
        `</div>` +
        `<div class="set-row"><label for="vc-snooze">${esc(this.t.snoozeFor)}</label>` +
        `<input id="vc-snooze" class="field num" type="number" inputmode="numeric" min="1" max="60" data-field="snooze" value="${settings.snoozeMinutes}" style="min-width:0;width:88px;text-align:center"/></div>` +
        this.notificationHtml() + `</div>`;
    }
    this.sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${inner}</div>`;
  }

  private cityResultsHtml(query: string): string {
    this.cityResults = searchCities(query, 40);
    if (this.cityResults.length === 0) return `<div class="empty">${esc(this.t.noCity)}</div>`;
    const now = Date.now();
    const have = getClockState().cities;
    return this.cityResults.map((c, i) => {
      const added = have.some((x) => x.tz === c.tz && x.label === c.city);
      return `<button class="result" data-act="pick-city" data-i="${i}" ${added ? 'disabled' : ''}><span class="flag">${flagEmoji(c.cc)}</span>` +
        `<span class="grow"><span class="title">${esc(c.city)}</span><br/><span class="sub">${esc(added ? this.t.added : `${c.country} · ${offsetLabel(c.tz, now)}`)}</span></span>` +
        `<span class="when">${this.timeHtml(c.tz, now)}</span></button>`;
    }).join('');
  }

  // ─── Toque ──────────────────────────────────────────────────────────────

  private renderRing() {
    const ring = this.ringUI ? this.ringing[0] : undefined;
    this.ringEl.hidden = !ring;
    if (!ring) {
      this.ringEl.innerHTML = '';
      return;
    }
    const alarm = ring.kind === 'alarm';
    this.ringEl.innerHTML = `<div class="bell">${ICON.bell}</div>` +
      `<div class="rt num">${alarm ? this.alarmTime(ring.time ?? '') : '00:00'}</div>` +
      `<div class="rl">${esc(ring.label || (alarm ? this.t.alarm : this.t.timerDone))}</div>` +
      (ring.tzLabel ? `<div class="rs">${esc(ring.tzLabel)}</div>` : '') +
      `<div class="controls">${alarm ? `<button class="round" data-act="ring-snooze">${esc(this.t.snooze)}</button>` : ''}` +
      `<button class="round go" data-act="ring-dismiss">${esc(this.t.dismiss)}</button></div>`;
  }

  // ─── Eventos ────────────────────────────────────────────────────────────

  private onClick(e: Event) {
    const target = e.target as Element;
    if (target === this.sheetEl) {
      this.closeSheet();
      return;
    }
    const el = target.closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    unlockAudio();
    const id = el.dataset.id ?? '';
    switch (el.dataset.act) {
      case 'tab':
        this.tab = el.dataset.tab as Tab;
        this.renderTop();
        this.renderBody();
        this.root.querySelector('.body')!.scrollTop = 0;
        break;
      case 'settings': this.openSheet({ type: 'settings' }); break;
      case 'close-sheet': this.closeSheet(); break;
      case 'locate': this.locate(); break;
      case 'add-city': this.openSheet({ type: 'city' }); break;
      case 'remove-city': removeCity(Number(el.dataset.i)); break;
      case 'pick-city': {
        const city = this.cityResults[Number(el.dataset.i)];
        if (city && addCity(city.tz, city.city)) this.closeSheet();
        else if (city) this.flashSheetError(this.t.full);
        break;
      }
      case 'new-alarm':
        this.openSheet({ type: 'alarm', id: '', days: [], error: getClockState().alarms.length >= CLOCK_LIMITS.alarms ? this.t.full : '' });
        break;
      case 'edit-alarm': {
        const alarm = getClockState().alarms.find((a) => a.id === id);
        if (alarm) this.openSheet({ type: 'alarm', id, days: [...alarm.days], error: '' });
        break;
      }
      case 'toggle-alarm': {
        const alarm = getClockState().alarms.find((a) => a.id === id);
        if (alarm) setAlarmEnabled(id, !alarm.enabled);
        break;
      }
      case 'toggle-day':
        if (this.sheet?.type === 'alarm') {
          const day = Number(el.dataset.day);
          const days = this.sheet.days;
          this.sheet.days = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
          el.setAttribute('aria-pressed', String(this.sheet.days.includes(day)));
        }
        break;
      case 'save-alarm': this.saveAlarmFromSheet(); break;
      case 'delete-alarm':
        if (this.sheet?.type === 'alarm') removeAlarm(this.sheet.id);
        this.closeSheet();
        break;
      case 'notify':
        void requestClockNotifications().then(() => {
          this.renderBody();
          if (this.sheet?.type === 'settings') this.renderSheet();
        });
        break;
      case 'toggle-24':
        updateSettings({ hour12: !getClockState().settings.hour12 });
        this.renderSheet();
        break;
      case 'preview-sound':
        previewAlarmSound(this.sheetEl.querySelector<HTMLSelectElement>('[data-sound-select]')?.value || getClockState().settings.sound);
        break;
      case 'upload-sound': this.sheetEl.querySelector<HTMLInputElement>('[data-field="sound-file"]')?.click(); break;
      case 'remove-sound':
        stopSoundPreview();
        void removeSoundFile(id).then(() => {
          if (this.sheet?.type === 'settings') this.renderSheet();
        });
        break;
      case 'sw-start': stopwatchStart(); break;
      case 'sw-stop': stopwatchStop(); break;
      case 'sw-lap': stopwatchLap(); break;
      case 'sw-reset': stopwatchReset(); break;
      case 'timer-preset':
        this.dial = { ...this.dial, h: '', m: el.dataset.min ?? '', s: '' };
        this.renderBody();
        break;
      case 'timer-start': {
        const ms = ((Number(this.dial.h) || 0) * 3600 + (Number(this.dial.m) || 0) * 60 + (Number(this.dial.s) || 0)) * 1000;
        if (ms >= 1000 && startTimer(ms, this.dial.label)) {
          this.dial = { h: '', m: '', s: '', label: '' };
          this.renderBody();
        }
        break;
      }
      case 'timer-pause': pauseTimer(id); break;
      case 'timer-resume': resumeTimer(id); break;
      case 'timer-reset': resetTimer(id); break;
      case 'timer-remove': removeTimer(id); break;
      case 'ring-snooze': if (this.ringing[0]) snoozeRing(this.ringing[0]); break;
      case 'ring-dismiss': if (this.ringing[0]) dismissRing(this.ringing[0]); break;
    }
  }

  private onInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const dial = input.dataset?.dial as keyof typeof this.dial | undefined;
    if (dial) {
      this.dial[dial] = input.value;
    } else if (input.dataset?.field === 'city-q') {
      const results = this.sheetEl.querySelector('[data-results]');
      if (results) results.innerHTML = this.cityResultsHtml(input.value);
    }
  }

  private onChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.dataset?.field === 'sound') {
      updateSettings({ sound: input.value });
      previewAlarmSound(input.value);
    } else if (input.dataset?.field === 'alarm-sound') {
      previewAlarmSound(input.value || getClockState().settings.sound);
    } else if (input.dataset?.field === 'sound-file') {
      void this.uploadSound(input);
    } else if (input.dataset?.field === 'snooze') {
      updateSettings({ snoozeMinutes: Number(input.value) });
      input.value = String(getClockState().settings.snoozeMinutes);
    }
  }

  private flashSheetError(message: string) {
    if (this.sheet?.type === 'alarm') {
      this.sheet.error = message;
      this.renderSheet();
    }
  }

  private saveAlarmFromSheet() {
    if (this.sheet?.type !== 'alarm') return;
    const get = <T extends Element>(field: string) => this.sheetEl.querySelector<T>(`[data-field="${field}"]`);
    const time = parseClockTime(get<HTMLInputElement>('alarm-time')?.value ?? '');
    // Guarda o que foi digitado antes de redesenhar a folha com o erro.
    const label = get<HTMLInputElement>('alarm-label')?.value ?? '';
    const option = get<HTMLSelectElement>('alarm-tz')?.selectedOptions[0];
    if (!time) {
      this.flashSheetError(this.t.invalidTime);
      return;
    }
    const saved = saveAlarm(
      {
        time, label, days: this.sheet.days, tz: option?.dataset.tz, tzLabel: option?.dataset.label, enabled: true,
        sound: get<HTMLSelectElement>('alarm-sound')?.value || undefined,
      },
      this.sheet.id || undefined,
    );
    if (saved) this.closeSheet();
    else this.flashSheetError(this.t.full);
  }

  // ─── Localizador ────────────────────────────────────────────────────────

  private locate() {
    if (this.locating) return;
    if (!navigator.geolocation) {
      this.locateMsg = this.t.locateUnsupported;
      this.renderBody();
      return;
    }
    this.locating = true;
    this.locateMsg = '';
    this.renderBody();
    const finish = (message: string, place?: Place) => {
      this.locating = false;
      this.locateMsg = message;
      if (place) {
        this.place = place;
        try {
          window.localStorage.setItem(CLOCK_PLACE_KEY, JSON.stringify(place));
        } catch {
          /* sem armazenamento: vale só nesta visita */
        }
      }
      this.renderBody();
    };
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // O fuso sai das coordenadas (Open-Meteo, sem chave). Sem rede, vale o fuso do aparelho.
        let tz = localTimeZone();
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}&current=temperature_2m&timezone=auto`,
            { signal: AbortSignal.timeout(8000) },
          );
          const data = (await res.json()) as { timezone?: unknown };
          if (isValidTimeZone(data.timezone)) tz = data.timezone;
        } catch {
          /* fica com o fuso do aparelho */
        }
        const label = findCityByTz(tz).city;
        if (tz !== localTimeZone()) addCity(tz, label);
        finish('', { tz, label });
      },
      (err) => finish(err.code === err.PERMISSION_DENIED ? this.t.locateDenied : this.t.locateFailed),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
    );
  }
}

export function defineVertalClock(tag = 'vertal-clock'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, VertalClockElement);
  }
}

// Vertal Clock — Web Component (Shadow DOM)
// Usável dentro da app React, no Vertal Chat, ou incorporado em qualquer site.
import { STRINGS, type ClockStrings } from './strings';
import { CLOCK_CSS } from './styles';
import type { ClockLang } from '@/lib/clock/alarms';
import {
  CLOCK_LIMITS, CLOCK_STORAGE_KEY, CLOCK_CHANGE_EVENT, CLOCK_LIMITS as LIMITS,
  getClockState, updateClockState, addCity, removeCity, saveAlarm, setAlarmEnabled, removeAlarm,
  startTimer, pauseTimer, resumeTimer, resetTimer, removeTimer, updateSettings, newClockId,
  stopwatchStart, stopwatchStop, stopwatchLap, stopwatchReset, formatDuration, formatStopwatch,
  timerRemaining, stopwatchElapsed, type ClockState, type CityRef, type Alarm, type Timer,
} from '@/lib/clock/store';
import { startClockEngine, subscribeRinging, dismissRing, snoozeRing, type Ring } from '@/lib/clock/engine';
import {
  resolvePlace, searchCities, localTimeZone, formatZoneTime, formatZoneDate,
  isDaytime, flagEmoji, zoneParts,
} from '@/lib/clock/zones';
import { parseClockTime, parseDays, describeDays, describeWait } from '@/lib/clock/alarms';
import { previewAlarmSound, requestClockNotifications } from '@/lib/clock/sound';

export class VertalClockElement extends HTMLElement {
  private root: ShadowRoot;
  private lang: ClockLang = 'pt';
  private strings: ClockStrings = STRINGS.pt;
  private tab: 'relógio' | 'alarme' | 'cronômetro' | 'timer' = 'relógio';
  private ringUI: 'on' | 'off' = 'on';
  private theme: 'auto' | 'light' | 'dark' = 'auto';
  private stops: (() => void)[] = [];
  private ringing: Ring[] = [];
  private myLocation: { tz: string; city: string; cc: string } | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${CLOCK_CSS}</style><div class="vc"></div>`;
  }

  connectedCallback() {
    this.readAttributes();
    this.render();
    this.startEngine();
    this.attachListeners();
    this.updateLiveTime();
  }

  disconnectedCallback() {
    this.stops.forEach((f) => f());
    this.stops = [];
  }

  private readAttributes() {
    this.lang = (this.getAttribute('lang') || 'pt') as ClockLang;
    this.strings = STRINGS[this.lang] || STRINGS.pt;
    this.tab = (this.getAttribute('tab') || 'relógio') as any;
    this.ringUI = (this.getAttribute('ring-ui') || 'on') as 'on' | 'off';
    this.theme = (this.getAttribute('theme') || 'auto') as 'auto' | 'light' | 'dark';
  }

  private startEngine() {
    const stop = startClockEngine();
    this.stops.push(stop);
    const unsubRing = subscribeRinging((rings) => {
      this.ringing = rings;
      this.renderRing();
    });
    this.stops.push(unsubRing);
    const unsub = window.addEventListener('storage', () => this.render());
    this.stops.push(() => window.removeEventListener('storage', unsub as any));
  }

  private attachListeners() {
    this.root.addEventListener('click', (e) => this.handleClick(e));
    this.root.addEventListener('input', (e) => this.handleInput(e));
    this.root.addEventListener('change', (e) => this.handleChange(e));
    this.root.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  private updateLiveTime() {
    const update = () => {
      const els = this.root.querySelectorAll('[data-t]');
      for (const el of els) el.textContent = new Date().toLocaleTimeString(this.lang === 'pt' ? 'pt-BR' : 'en-US');
      requestAnimationFrame(update);
    };
    update();
  }

  private handleClick(e: Event) {
    const target = e.target as HTMLElement;
    const act = target.getAttribute('data-act');
    if (!act) return;

    // Tabs
    if (act.startsWith('tab:')) {
      this.tab = act.slice(4) as any;
      this.render();
      return;
    }

    // Cities
    if (act === 'add-city-sheet') {
      this.showSheet('city-search');
      return;
    }
    if (act === 'my-location') {
      this.requestGeolocation();
      return;
    }
    if (act.startsWith('remove-city:')) {
      const idx = +act.slice(12);
      removeCity(idx);
      this.render();
      return;
    }

    // Alarms
    if (act === 'new-alarm-sheet') {
      this.showSheet('alarm-editor', { id: '' });
      return;
    }
    if (act.startsWith('edit-alarm:')) {
      this.showSheet('alarm-editor', { id: act.slice(11) });
      return;
    }
    if (act.startsWith('alarm-toggle:')) {
      const id = act.slice(13);
      const state = getClockState();
      const alarm = state.alarms.find((a) => a.id === id);
      if (alarm) setAlarmEnabled(id, !alarm.enabled);
      this.render();
      return;
    }
    if (act.startsWith('remove-alarm:')) {
      removeAlarm(act.slice(13));
      this.render();
      return;
    }

    // Timers
    if (act === 'start-timer') {
      const minInput = this.root.querySelector('input[data-field="timer-min"]') as HTMLInputElement;
      const secInput = this.root.querySelector('input[data-field="timer-sec"]') as HTMLInputElement;
      const labelInput = this.root.querySelector('input[data-field="timer-label"]') as HTMLInputElement;
      const min = +(minInput?.value || 0);
      const sec = +(secInput?.value || 0);
      const ms = (min * 60 + sec) * 1000;
      if (ms >= 1000 && ms <= LIMITS.maxTimerMs) {
        startTimer(ms, labelInput?.value || '');
        minInput.value = '';
        secInput.value = '';
        labelInput.value = '';
        this.render();
      }
      return;
    }
    if (act.startsWith('pause-timer:')) {
      pauseTimer(act.slice(12));
      this.render();
      return;
    }
    if (act.startsWith('resume-timer:')) {
      resumeTimer(act.slice(13));
      this.render();
      return;
    }
    if (act.startsWith('reset-timer:')) {
      resetTimer(act.slice(12));
      this.render();
      return;
    }
    if (act.startsWith('remove-timer:')) {
      removeTimer(act.slice(13));
      this.render();
      return;
    }

    // Stopwatch
    if (act === 'stopwatch-start') {
      stopwatchStart();
      this.render();
      return;
    }
    if (act === 'stopwatch-stop') {
      stopwatchStop();
      this.render();
      return;
    }
    if (act === 'stopwatch-lap') {
      stopwatchLap();
      this.render();
      return;
    }
    if (act === 'stopwatch-reset') {
      stopwatchReset();
      this.render();
      return;
    }

    // Sheets
    if (act === 'close-sheet') {
      this.hideSheet();
      return;
    }
    if (act === 'save-alarm') {
      this.saveAlarmFromSheet();
      return;
    }
    if (act === 'delete-alarm') {
      const id = this.root.querySelector('[data-field="alarm-id"]')?.getAttribute('value');
      if (id) removeAlarm(id);
      this.hideSheet();
      this.render();
      return;
    }
    if (act === 'settings-sheet') {
      this.showSheet('settings');
      return;
    }
    if (act === 'enable-notifications') {
      void requestClockNotifications();
      return;
    }
    if (act.startsWith('preview-sound:')) {
      previewAlarmSound(act.slice(14) as any);
      return;
    }

    // Ring overlay
    if (act === 'snooze-ring') {
      if (this.ringing[0]) snoozeRing(this.ringing[0]);
      return;
    }
    if (act === 'dismiss-ring') {
      if (this.ringing[0]) dismissRing(this.ringing[0]);
      return;
    }

    // Search & add city
    if (act === 'add-searched-city') {
      const input = this.root.querySelector('input[data-field="city-search"]') as HTMLInputElement;
      const tz = input?.getAttribute('data-selected-tz');
      if (tz) {
        const results = searchCities(input.value, 1);
        const city = results[0];
        if (city && addCity(city.tz, city.city)) {
          input.value = '';
          input.removeAttribute('data-selected-tz');
          this.hideSheet();
          this.render();
        }
      }
      return;
    }
  }

  private handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.getAttribute('data-field') === 'city-search') {
      const query = target.value.trim();
      const results = searchCities(query, 10);
      const list = this.root.querySelector('.city-search-results');
      if (!list) return;
      if (results.length === 0) {
        list.innerHTML = `<div class="hint">${this.escape(this.strings.noCity)}</div>`;
        return;
      }
      list.innerHTML = results.map((c) => `
        <button class="city-result" data-act="select-city" data-tz="${this.escape(c.tz)}" data-city="${this.escape(c.city)}">
          ${this.escape(flagEmoji(c.cc))} ${this.escape(c.city)}, ${this.escape(c.country)}
        </button>
      `).join('');
      this.root.querySelectorAll('.city-result').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tz = btn.getAttribute('data-tz');
          const city = btn.getAttribute('data-city');
          const input = this.root.querySelector('input[data-field="city-search"]') as HTMLInputElement;
          input.value = city + '';
          input.setAttribute('data-selected-tz', tz || '');
        });
      });
    }
  }

  private handleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.getAttribute('data-field')?.startsWith('day-')) {
      return; // handled by click
    }
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.hideSheet();
    }
  }

  private requestGeolocation() {
    if (!navigator.geolocation) {
      alert('Geolocalização não disponível');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&count=1&language=${this.lang}`
          );
          const data = (await res.json()) as any;
          if (data.results?.[0]) {
            const r = data.results[0];
            this.myLocation = { tz: r.timezone, city: r.name || 'Minha localização', cc: r.country_code || '🌍' };
            this.render();
          }
        } catch (err) {
          console.error('Geolocation lookup failed:', err);
        }
      },
      (err) => {
        console.error('Geolocation error:', err.message);
      }
    );
  }

  private showSheet(type: string, data?: any) {
    const sheet = this.root.querySelector('.sheet') || this.createSheet();
    sheet.classList.remove('hidden');
    sheet.setAttribute('data-sheet', type);
    sheet.innerHTML = this.renderSheetContent(type, data);
  }

  private hideSheet() {
    const sheet = this.root.querySelector('.sheet');
    if (sheet) sheet.classList.add('hidden');
  }

  private createSheet(): Element {
    const sheet = document.createElement('div');
    sheet.className = 'sheet sheet-bg hidden';
    this.root.querySelector('.vc')?.appendChild(sheet);
    return sheet;
  }

  private renderSheetContent(type: string, data?: any): string {
    if (type === 'city-search') {
      return `
        <div class="sheet">
          <div class="sheet-head"><h3>${this.escape(this.strings.searchCity)}</h3></div>
          <div class="sheet-body">
            <input type="text" data-field="city-search" placeholder="${this.escape(this.strings.searchCity)}" class="field" />
            <div class="city-search-results" style="margin-top:1rem;"></div>
            <button class="pill" data-act="add-searched-city">${this.escape(this.strings.addCity)}</button>
          </div>
          <div class="sheet-foot"><button class="pill" data-act="close-sheet">${this.escape(this.strings.close)}</button></div>
        </div>
      `;
    }
    if (type === 'alarm-editor') {
      const state = getClockState();
      const id = data?.id || '';
      const alarm = id ? state.alarms.find((a) => a.id === id) : null;
      const dayChips = [0, 1, 2, 3, 4, 5, 6].map((d) => {
        const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        const selected = alarm?.days.includes(d) || false;
        return `<button class="day ${selected ? 'active' : ''}" data-act="toggle-day:${d}" data-day="${d}">${names[d]}</button>`;
      }).join('');
      return `
        <div class="sheet">
          <div class="sheet-head"><h3>${alarm ? this.escape(this.strings.editAlarm) : this.escape(this.strings.newAlarm)}</h3></div>
          <div class="sheet-body">
            <input type="hidden" data-field="alarm-id" value="${id}" />
            <div class="form-row">
              <label>${this.escape(this.strings.time)}</label>
              <input type="time" data-field="alarm-time" value="${alarm?.time || ''}" class="field" />
            </div>
            <div class="form-row">
              <label>${this.escape(this.strings.label)}</label>
              <input type="text" data-field="alarm-label" value="${this.escape(alarm?.label || '')}" placeholder="${this.escape(this.strings.labelHint)}" class="field" />
            </div>
            <div class="form-row">
              <label>${this.escape(this.strings.repeat)}</label>
              <div class="days">${dayChips}</div>
            </div>
            <div class="form-row">
              <label>${this.escape(this.strings.zone)}</label>
              <select data-field="alarm-tz" class="field">
                <option value="">${this.escape(this.strings.deviceZone)}</option>
                ${state.cities.map((c) => `<option value="${this.escape(c.tz)}" ${alarm?.tz === c.tz ? 'selected' : ''}>${this.escape(c.label)}</option>`).join('')}
              </select>
            </div>
            <div class="hint">${this.escape(this.strings.alarmHint)}</div>
          </div>
          <div class="sheet-foot">
            <button class="pill primary" data-act="save-alarm">${this.escape(this.strings.save)}</button>
            ${alarm ? `<button class="pill danger" data-act="delete-alarm">${this.escape(this.strings.delete)}</button>` : ''}
            <button class="pill" data-act="close-sheet">${this.escape(this.strings.cancel)}</button>
          </div>
        </div>
      `;
    }
    if (type === 'settings') {
      const state = getClockState();
      return `
        <div class="sheet">
          <div class="sheet-head"><h3>${this.escape(this.strings.settings)}</h3></div>
          <div class="sheet-body">
            <div class="form-row">
              <label><input type="checkbox" data-field="hour12" ${state.settings.hour12 ? 'checked' : ''} /> ${this.escape(this.strings.format24)}</label>
            </div>
            <div class="form-row">
              <label>${this.escape(this.strings.snoozeFor)}</label>
              <input type="number" data-field="snooze-minutes" value="${state.settings.snoozeMinutes}" min="1" max="60" class="field" />
            </div>
            <div class="form-row">
              <label>${this.escape(this.strings.sound)}</label>
              <select data-field="alarm-sound" class="field">
                <option value="classic" ${state.settings.sound === 'classic' ? 'selected' : ''}>${this.escape(this.strings.soundClassic)}</option>
                <option value="digital" ${state.settings.sound === 'digital' ? 'selected' : ''}>${this.escape(this.strings.soundDigital)}</option>
                <option value="gentle" ${state.settings.sound === 'gentle' ? 'selected' : ''}>${this.escape(this.strings.soundGentle)}</option>
              </select>
              <button class="pill small" data-act="preview-sound:${state.settings.sound}">${this.escape(this.strings.listen)}</button>
            </div>
            <button class="pill primary" data-act="enable-notifications">${this.escape(this.strings.enableNotifications)}</button>
            <div class="hint">${this.escape(this.strings.notificationsHint)}</div>
          </div>
          <div class="sheet-foot"><button class="pill" data-act="close-sheet">${this.escape(this.strings.close)}</button></div>
        </div>
      `;
    }
    return '';
  }

  private saveAlarmFromSheet() {
    const timeInput = this.root.querySelector('input[data-field="alarm-time"]') as HTMLInputElement;
    const labelInput = this.root.querySelector('input[data-field="alarm-label"]') as HTMLInputElement;
    const tzInput = this.root.querySelector('select[data-field="alarm-tz"]') as HTMLSelectElement;
    const idInput = this.root.querySelector('[data-field="alarm-id"]') as HTMLInputElement;

    const time = timeInput?.value;
    if (!time || !parseClockTime(time)) {
      alert('Hora inválida');
      return;
    }

    const days = Array.from(this.root.querySelectorAll('.day.active')).map((b) => +b.getAttribute('data-day')!);
    const tz = tzInput?.value || undefined;
    const alarm = saveAlarm(
      { time, label: labelInput?.value || '', days, tz },
      idInput?.value ? idInput.value : undefined
    );

    if (alarm) {
      this.hideSheet();
      this.render();
    } else {
      alert(this.strings.full);
    }
  }

  private renderRing(): string {
    if (this.ringUI === 'off' || this.ringing.length === 0) return '';
    const ring = this.ringing[0];
    return `
      <div class="ring">
        <div class="ringp">
          <svg viewBox="0 0 100 100" class="ringsvg">
            <circle cx="50" cy="50" r="45" class="track" />
            <circle cx="50" cy="50" r="45" class="bar" style="stroke-dasharray: 283; stroke-dashoffset: 70;" />
          </svg>
          <div class="rt">${this.escape(ring.kind === 'alarm' ? this.strings.alarm : this.strings.timer)}</div>
          <div class="rl">${this.escape(ring.label)}</div>
          <div class="rs">${ring.time ? this.escape(ring.time) : ''}</div>
        </div>
        <div style="display:flex; gap:1rem; justify-content:center;">
          <button class="round go" data-act="snooze-ring">${this.escape(this.strings.snooze)}</button>
          <button class="round halt" data-act="dismiss-ring">${this.escape(this.strings.dismiss)}</button>
        </div>
      </div>
    `;
  }

  private render() {
    const state = getClockState();
    const now = Date.now();
    const vc = this.root.querySelector('.vc') as HTMLElement;
    const themeClass = this.theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : this.theme;
    vc.className = `vc vc-theme-${themeClass}`;

    const tabs = [
      { key: 'relógio', label: this.strings.tabClock },
      { key: 'alarme', label: this.strings.tabAlarm },
      { key: 'cronômetro', label: this.strings.tabStopwatch },
      { key: 'timer', label: this.strings.tabTimer },
    ];

    let content = `<div class="top"><div class="tabs">`;
    for (const t of tabs) {
      content += `<button class="tab ${this.tab === t.key ? 'active' : ''}" data-act="tab:${t.key}" aria-selected="${this.tab === t.key}">${this.escape(t.label)}</button>`;
    }
    content += `</div></div><div class="body">`;

    if (this.tab === 'relógio') {
      const devTz = localTimeZone();
      const devTime = zoneParts(devTz, new Date(now));
      const hour12 = state.settings.hour12;
      const h = hour12 && devTime.hour > 12 ? devTime.hour - 12 : devTime.hour;
      const ampm = hour12 ? (devTime.hour < 12 ? 'AM' : 'PM') : '';
      content += `
        <div class="hero">
          <div class="hero-time"><span data-t>${String(h).padStart(2, '0')}</span>:<span data-t>${String(devTime.minute).padStart(2, '0')}</span><span class="small" data-t>${String(devTime.second).padStart(2, '0')}</span></div>
          <div class="hero-date">${formatZoneDate(devTz, new Date(now))}</div>
        </div>
        <div class="section"><h2>${this.escape(this.strings.worldClock)}</h2>`;
      if (this.myLocation) {
        const loc = this.myLocation;
        const locTime = formatZoneTime(loc.tz, new Date(now), { hour12 });
        const dy = isDaytime(loc.tz, new Date(now));
        content += `<div class="row"><div class="title">${this.escape(flagEmoji(loc.cc))} ${this.escape(loc.city)}</div><div class="big">${this.escape(locTime)}</div><div class="daynight ${dy ? 'day' : ''}">${dy ? '☀️' : '🌙'}</div></div>`;
      }
      for (let i = 0; i < state.cities.length; i++) {
        const c = state.cities[i];
        const t = formatZoneTime(c.tz, new Date(now), { hour12 });
        const dy = isDaytime(c.tz, new Date(now));
        const city = searchCities(c.label, 1)[0] || { cc: '🌍' };
        content += `<div class="row click" data-act="remove-city:${i}"><div class="title">${this.escape(flagEmoji(city.cc))} ${this.escape(c.label)}</div><div class="big">${this.escape(t)}</div><div class="daynight ${dy ? 'day' : ''}">${dy ? '☀️' : '🌙'}</div></div>`;
      }
      content += `<button class="pill" data-act="add-city-sheet">${this.escape(this.strings.addCity)}</button>`;
      if (!this.myLocation) {
        content += `<button class="pill" data-act="my-location">📍 ${this.strings.worldClock === 'World clock' ? 'My Location' : 'Minha localização'}</button>`;
      }
      content += `</div>`;
    } else if (this.tab === 'alarme') {
      const nextAlarm = state.alarms.find((a) => a.enabled);
      content += `<div class="section"><h2>${this.escape(this.strings.alarms)}</h2>`;
      if (nextAlarm) {
        content += `<div class="summary"><div class="k">${this.escape(this.strings.nextAlarm)}</div><div class="v">${this.escape(nextAlarm.time)} ${nextAlarm.label ? '·' : ''} ${this.escape(nextAlarm.label)}</div></div>`;
      } else {
        content += `<div class="empty">${this.escape(this.strings.noAlarms)}</div>`;
      }
      if (state.alarms.length === 0) {
        content += `<button class="pill primary" data-act="new-alarm-sheet">${this.escape(this.strings.newAlarm)}</button>`;
      } else {
        content += `<div class="list">`;
        for (const a of state.alarms) {
          content += `<div class="row">
            <div class="grow"><div class="title">${this.escape(a.label || a.time)}</div><div class="sub">${a.days.length === 0 ? this.strings.today : describeDays(a.days, this.lang)}</div></div>
            <div><button class="switch" data-act="alarm-toggle:${a.id}" aria-checked="${a.enabled}" role="switch">${a.enabled ? '✓' : '○'}</button></div>
            <button class="icon-btn small" data-act="edit-alarm:${a.id}">✎</button>
            <button class="icon-btn small" data-act="remove-alarm:${a.id}">✕</button>
          </div>`;
        }
        content += `</div><button class="pill primary" data-act="new-alarm-sheet">${this.escape(this.strings.newAlarm)}</button>`;
      }
      content += `</div>`;
    } else if (this.tab === 'cronômetro') {
      const sw = state.stopwatch;
      const elapsed = stopwatchElapsed(sw, now);
      const running = sw.startedAt !== null;
      content += `<div class="hero"><div class="hero-time">${this.escape(formatStopwatch(elapsed))}</div></div>
        <div class="controls">
          ${!running ? `<button class="round go" data-act="stopwatch-start">${this.escape(this.strings.start)}</button>` : `<button class="round halt" data-act="stopwatch-stop">${this.escape(this.strings.stop)}</button>`}
          ${running ? `<button class="round" data-act="stopwatch-lap">${this.escape(this.strings.lap)}</button>` : ''}
          <button class="round" data-act="stopwatch-reset">${this.escape(this.strings.reset)}</button>
        </div>
        ${sw.laps.length > 0 ? `<div class="section"><h2>${this.strings.laps}</h2><div class="list">${sw.laps.map((l, i) => `<div class="lap"><div class="n">#${i + 1}</div><div class="d">${formatStopwatch(l)}</div></div>`).join('')}</div></div>` : ''}`;
    } else if (this.tab === 'timer') {
      content += `<div class="section"><h2>${this.escape(this.strings.timers)}</h2>`;
      if (state.timers.length === 0) {
        content += `<div class="summary"><label>${this.strings.minutes}: <input type="number" data-field="timer-min" min="0" max="99" class="field" style="width:3rem;" /> ${this.strings.seconds}: <input type="number" data-field="timer-sec" min="0" max="59" class="field" style="width:3rem;" /> <input type="text" data-field="timer-label" placeholder="${this.escape(this.strings.timerLabel)}" class="field" style="flex:1;" /> <button class="pill primary" data-act="start-timer">${this.escape(this.strings.start)}</button></label></div>`;
      } else {
        content += `<div class="list">`;
        for (const t of state.timers) {
          const rem = timerRemaining(t, now);
          const running = t.endsAt !== null && !t.done;
          content += `<div class="timer ${t.done ? 'done' : ''}">
            <div class="title">${this.escape(t.label || `Timer`)}</div>
            <div class="big">${this.escape(formatDuration(rem))}</div>
            ${!running && !t.done ? `<button class="pill" data-act="resume-timer:${t.id}">${this.escape(this.strings.resume)}</button>` : ''}
            ${running ? `<button class="pill" data-act="pause-timer:${t.id}">${this.escape(this.strings.pause)}</button>` : ''}
            <button class="pill" data-act="reset-timer:${t.id}">${this.escape(this.strings.reset)}</button>
            <button class="pill danger" data-act="remove-timer:${t.id}">${this.escape(this.strings.delete)}</button>
          </div>`;
        }
        content += `</div>`;
      }
      content += `</div>`;
    }

    content += `</div>
      <div class="bottom">
        <button class="icon-btn small" data-act="settings-sheet">⚙️</button>
      </div>
      ${this.renderRing()}
      <div class="sheet hidden"></div>`;

    vc.innerHTML = content;
    this.attachListeners();
  }

  private escape(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

export function defineVertalClock(tag = 'vertal-clock'): void {
  if (!customElements.get(tag)) {
    customElements.define(tag, VertalClockElement);
  }
}

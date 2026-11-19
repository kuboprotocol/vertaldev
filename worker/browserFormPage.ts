// Scripts que rodam DENTRO da página aberta no navegador na nuvem (page.evaluate).
// São strings de JavaScript puro: o tsconfig do Worker não tem tipos do DOM e o
// código precisa ir serializado para o Chromium de qualquer jeito.
// Toda a decisão (honeypot, chaves, casamento de valores) fica no módulo puro
// supabase/functions/_shared/browserForm.ts; aqui só se coleta e se aplica.
import { CAPTCHA_SELECTORS } from '../supabase/functions/_shared/browserForm';

/**
 * Coleta os controles do formulário e marca cada um com data-vertal-field="f<i>"
 * (e os botões de envio com data-vertal-submit="s<i>"). A ordem é a do DOM,
 * então reabrir a página gera as mesmas marcas.
 * Devolve { controls, buttons, captcha, title }.
 */
export const EXTRACT_SCRIPT = `(() => {
  const CAPTCHA_SELECTORS = ${JSON.stringify(CAPTCHA_SELECTORS)};
  const clip = (t, n) => String(t || '').replace(/\\s+/g, ' ').trim().slice(0, n);
  const styleHidden = (el) => {
    const s = getComputedStyle(el);
    return s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || Number(s.opacity) === 0;
  };
  const boxVisible = (el) => {
    if (!el || styleHidden(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const docW = Math.max(document.documentElement.scrollWidth, innerWidth);
    if (r.right < -5 || r.bottom + scrollY < -5 || r.left > docW + 5) return false;
    let p = el.parentElement;
    for (let i = 0; p && i < 12; i++, p = p.parentElement) {
      if (styleHidden(p)) return false;
      const pr = p.getBoundingClientRect();
      const ps = getComputedStyle(p);
      if (ps.overflow === 'hidden' && (pr.width < 2 || pr.height < 2)) return false;
    }
    return true;
  };
  const labelText = (el) => {
    const parts = [];
    if (el.labels && el.labels.length) for (const l of el.labels) parts.push(l.innerText);
    const by = el.getAttribute('aria-labelledby');
    if (by) for (const id of by.split(/\\s+/)) { const n = document.getElementById(id); if (n) parts.push(n.innerText); }
    if (!parts.length) { const l = el.closest('label'); if (l) parts.push(l.innerText); }
    return clip(parts.join(' '), 200);
  };
  const hintText = (el) => {
    const fs = el.closest('fieldset');
    const legend = fs && fs.querySelector('legend');
    if (legend) return clip(legend.innerText, 200);
    const group = el.closest('[role=radiogroup],[role=group]');
    if (group) return clip(group.getAttribute('aria-label') || '', 200);
    const parent = el.parentElement;
    return parent ? clip(parent.innerText, 160) : '';
  };
  const forms = Array.from(document.forms);
  const formIndexOf = (el) => (el.form ? forms.indexOf(el.form) : -1);
  const controls = [];
  const els = Array.from(document.querySelectorAll('input, select, textarea')).slice(0, 300);
  els.forEach((el, index) => {
    el.setAttribute('data-vertal-field', 'f' + index);
    const tag = el.tagName.toLowerCase();
    const type = tag === 'select' ? (el.multiple ? 'select-multiple' : 'select-one') : tag === 'textarea' ? 'textarea' : String(el.type || 'text').toLowerCase();
    let visible = boxVisible(el);
    if (!visible && (type === 'checkbox' || type === 'radio') && el.labels && el.labels.length) {
      // Checkbox/radio estilizado: o input fica invisível e o rótulo é que aparece.
      visible = Array.from(el.labels).some(boxVisible);
    }
    controls.push({
      index, tag, type,
      name: clip(el.getAttribute('name'), 120),
      id: clip(el.id, 120),
      label: labelText(el),
      placeholder: clip(el.getAttribute('placeholder'), 200),
      ariaLabel: clip(el.getAttribute('aria-label'), 200),
      required: !!el.required || el.getAttribute('aria-required') === 'true',
      disabled: !!el.disabled,
      readOnly: !!el.readOnly,
      visible,
      ariaHidden: !!el.closest('[aria-hidden="true"]'),
      tabIndex: typeof el.tabIndex === 'number' ? el.tabIndex : 0,
      autocomplete: clip(el.getAttribute('autocomplete'), 40),
      value: type === 'password' ? '' : clip(el.value, 300),
      checked: !!el.checked,
      options: tag === 'select' ? Array.from(el.options).slice(0, 80).map((o) => ({ value: o.value, label: clip(o.label || o.text, 200) })) : [],
      formIndex: formIndexOf(el),
      hint: hintText(el),
    });
  });
  const buttons = [];
  const btnEls = Array.from(document.querySelectorAll('button, input[type=submit], input[type=image], [role=button]')).slice(0, 80);
  let b = 0;
  for (const el of btnEls) {
    const tag = el.tagName.toLowerCase();
    const type = String(el.getAttribute('type') || (tag === 'button' && el.form ? 'submit' : '')).toLowerCase();
    const text = clip(el.innerText || el.value || el.getAttribute('aria-label') || '', 80);
    const isSubmit = type === 'submit' || type === 'image' || /^(enviar|submit|send|cadastrar|inscrever|inscreva|registrar|finalizar|confirmar|apply|aplicar|candidatar)/i.test(text);
    if (!isSubmit) continue;
    el.setAttribute('data-vertal-submit', 's' + b);
    buttons.push({ index: b, text, formIndex: el.form ? forms.indexOf(el.form) : (el.closest('form') ? forms.indexOf(el.closest('form')) : -1), visible: boxVisible(el) });
    b++;
  }
  const iframeSrcs = Array.from(document.querySelectorAll('iframe')).slice(0, 40).map((f) => String(f.src || '').slice(0, 300));
  const presentSelectors = CAPTCHA_SELECTORS.filter((s) => { try { return !!document.querySelector(s); } catch (e) { return false; } });
  return {
    controls, buttons,
    title: clip(document.title, 200),
    captcha: { iframeSrcs, presentSelectors, title: clip(document.title, 200), bodyText: clip(document.body ? document.body.innerText : '', 3000) },
  };
})()`;

/** Preenche os campos do plano e devolve os erros de validação do próprio navegador. */
export function fillScript(fills: Array<{ key: string; selector: string; type: string; value: string | boolean | string[] }>): string {
  return `(() => {
  const fills = ${JSON.stringify(fills)};
  const errors = [];
  const setNative = (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
  };
  const fire = (el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  for (const f of fills) {
    try {
      if (f.type === 'radio') {
        const radios = Array.from(document.querySelectorAll(f.selector));
        const target = radios.find((r) => r.value === f.value);
        if (!target) { errors.push({ key: f.key, message: 'opção não encontrada' }); continue; }
        if (!target.checked) { target.click(); if (!target.checked) { target.checked = true; fire(target); } }
        continue;
      }
      const el = document.querySelector(f.selector);
      if (!el) { errors.push({ key: f.key, message: 'campo não encontrado' }); continue; }
      if (f.type === 'checkbox') {
        if (el.checked !== !!f.value) { el.click(); if (el.checked !== !!f.value) { el.checked = !!f.value; fire(el); } }
        continue;
      }
      if (f.type === 'multiselect') {
        const wanted = new Set(f.value);
        for (const o of el.options) o.selected = wanted.has(o.value);
        fire(el);
        continue;
      }
      el.focus && el.focus();
      setNative(el, String(f.value));
      fire(el);
      el.blur && el.blur();
    } catch (e) {
      errors.push({ key: f.key, message: 'não consegui preencher' });
    }
  }
  const invalid = [];
  for (const f of fills) {
    const el = document.querySelector(f.selector);
    if (el && typeof el.checkValidity === 'function' && !el.checkValidity()) {
      invalid.push({ key: f.key, message: String(el.validationMessage || 'valor inválido').slice(0, 200) });
    }
  }
  return { errors, invalid };
})()`;
}

/** Clica no botão marcado; sem botão, usa requestSubmit() do formulário principal. */
export function clickSubmitScript(selector: string | null, formIndex: number): string {
  return `(() => {
  const sel = ${JSON.stringify(selector)};
  if (sel) { const el = document.querySelector(sel); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return 'clicked'; } }
  const form = document.forms[${Number(formIndex)}];
  if (form) { if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit(); return 'requestSubmit'; }
  return 'none';
})()`;
}

/** Depois do envio: título, cabeçalhos, mensagens de status e se ainda há campos inválidos. */
export const RESULT_SCRIPT = `(() => {
  const clip = (t, n) => String(t || '').replace(/\\s+/g, ' ').trim().slice(0, n);
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden'; };
  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).filter(visible).slice(0, 6).map((h) => clip(h.innerText, 300));
  const alerts = Array.from(document.querySelectorAll('[role=alert], [role=status], [aria-live], .alert, .success, .message, .notice, .confirmation, .thank-you, .thanks'))
    .filter(visible).slice(0, 8).map((a) => clip(a.innerText, 400)).filter(Boolean);
  const invalid = Array.from(document.querySelectorAll('[data-vertal-field]'))
    .filter((el) => typeof el.checkValidity === 'function' && visible(el) && !el.checkValidity())
    .slice(0, 20).map((el) => clip(el.validationMessage, 200));
  return {
    title: clip(document.title, 200), headings, alerts, invalid,
    stillHasForm: document.querySelectorAll('[data-vertal-field]').length > 0,
    bodyText: clip(document.body ? document.body.innerText : '', 3000),
  };
})()`;

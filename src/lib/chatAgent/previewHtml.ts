// Prévia de apps gerados dentro do chat. O iframe roda isolado (sem allow-same-origin),
// então o app não alcança a sessão do usuário. Nesse modo o navegador bloqueia
// localStorage/sessionStorage; este trecho entrega um armazenamento em memória
// para o app funcionar na prévia.
const SHIM = `<script>(function(){function mem(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}['localStorage','sessionStorage'].forEach(function(n){try{window[n].getItem('x')}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}})})();</script>`;

/** Insere o armazenamento em memória antes de qualquer script do app. */
export function previewHtml(html: string): string {
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + SHIM + html.slice(head.index + head[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? doctype[0] + SHIM + html.slice(doctype[0].length) : SHIM + html;
}

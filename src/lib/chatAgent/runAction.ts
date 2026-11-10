// Executa as ações do agente do Vertal Chat usando as MESMAS funções dos painéis
// (creative-router, creative-design, generate-code…). Cobrança, limites e permissões
// são os de cada ferramenta: o chat não tem atalho por fora.
import { supabase } from '@/integrations/supabase/client';
import { functionErrorCode } from '@/lib/functionError';
import { streamChat, type Msg as CodeMsg } from '@/lib/streamChat';
import { splitProseAndCode } from '@/lib/builderTurn';
import type { AgentAction, PanelKey, ToolResult } from './contract';
import { secretPlaceholders } from './contract';
import { artifactSourceText, type Artifact, type StoredImage } from './artifacts';
import { loadConnections, parseMcpBody, weatherText } from './connections';

export interface ApiApprovalRequest {
  method: string;
  url: string;
  host: string;
  reason: string;
  secrets: string[];
  hasBody: boolean;
}

export interface ActionContext {
  userId: string;
  /** Artefatos já criados na conversa (para editar por id). */
  artifacts: Artifact[];
  /** Reserva o próximo id (a1, a2…). */
  newId: () => string;
  /** Pede ao usuário para aprovar uma chamada de API externa. */
  approveApi: (request: ApiApprovalRequest) => Promise<boolean>;
  /** Prévia ao vivo do app enquanto o código chega. */
  onAppPreview?: (html: string) => void;
  /** Plano permite construir app? Devolve a mensagem de bloqueio, ou null. */
  appBlockedReason: () => string | null;
  /** Conta 1 edição do plano (igual ao Dev Code). */
  chargeAppEdit: () => Promise<unknown>;
  /** O usuário pediu para ficar só no chat (ou voltar a abrir ao lado). */
  setChatOnly: (chatOnly: boolean) => void;
}

export interface ActionOutcome {
  artifact?: Artifact;
  panel?: PanelKey;
  /** Mensagem de erro para o usuário (em português). */
  error?: string;
  /** Resumo que volta para o agente. */
  result: ToolResult;
  /** O agente precisa ler o resultado para responder (ex.: resposta de API). */
  needsFollowUp?: boolean;
}

const ERRORS: Record<string, string> = {
  deduction_failed: 'Créditos insuficientes para esta criação.',
  insufficient_credits: 'Créditos insuficientes para esta criação.',
  duplicate_request: 'Este pedido já foi processado.',
  invalid_model_output: 'A IA não devolveu um resultado válido. Nenhum crédito foi cobrado.',
  ai_unavailable: 'A IA está indisponível agora. Nenhum crédito foi cobrado.',
  image_provider_unavailable: 'O gerador de imagens está indisponível agora.',
  premium_image_provider_unavailable: 'O gerador de imagens premium está indisponível agora.',
  image_generation_failed: 'Não foi possível gerar a imagem. Nenhum crédito foi cobrado.',
  design_generation_failed: 'Não foi possível gerar o design. Nenhum crédito foi cobrado.',
  Unauthorized: 'Sua sessão expirou. Entre novamente.',
  url_not_allowed: 'Esse endereço não pode ser chamado pelo chat (só APIs públicas em https).',
  invalid_input: 'O pedido saiu em um formato inválido. Tente reformular.',
};

async function errorText(error: unknown, fallback: string): Promise<string> {
  const code = await functionErrorCode(error);
  if (code?.startsWith('rate_limit_exceeded')) return 'Muitos pedidos em pouco tempo. Aguarde um minuto e tente de novo.';
  return (code && ERRORS[code]) || fallback;
}

const fail = (tool: string, message: string): ActionOutcome => ({ error: message, result: { tool, ok: false, summary: message } });

const idem = () => ({ 'X-Idempotency-Key': crypto.randomUUID() });

const titleFrom = (text: string, max = 60) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/**
 * Data URLs são grandes demais para ficar na mensagem: vão para o bucket privado
 * `uploads` e a conversa guarda só o caminho. Se o envio falhar, a imagem ainda
 * aparece agora, só não volta ao reabrir a conversa.
 */
async function storeImage(url: string, userId: string): Promise<StoredImage> {
  if (!url.startsWith('data:')) return { url };
  try {
    const blob = await (await fetch(url)).blob();
    const ext = blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('webp') ? 'webp' : 'png';
    const path = `${userId}/chat/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('uploads').upload(path, blob, { contentType: blob.type || 'image/png', upsert: false });
    if (error) return { url };
    return { url, path };
  } catch {
    return { url };
  }
}

/** Renova a URL de uma imagem guardada no bucket privado. */
export async function resolveStoredImage(image: StoredImage): Promise<StoredImage> {
  if (!image.path || image.url) return image;
  const { data } = await supabase.storage.from('uploads').createSignedUrl(image.path, 60 * 60 * 24);
  return data?.signedUrl ? { ...image, url: data.signedUrl } : image;
}

async function saveToOffice(
  ctx: ActionContext,
  kind: 'doc' | 'sheet' | 'slides',
  data: unknown,
  officeId?: string,
): Promise<string | undefined> {
  try {
    const [{ saveStructuredItem }, { describeDraft }] = await Promise.all([
      import('@/services/officeDocsService'),
      import('@/lib/office/galleryModel'),
    ]);
    const { title, excerpt } = describeDraft(kind, data as Parameters<typeof describeDraft>[1]);
    const item = await saveStructuredItem({ id: officeId, userId: ctx.userId, kind, title, excerpt, content: data });
    return item.id;
  } catch {
    // A galeria é um bônus: o artefato continua na conversa e abre no Office do mesmo jeito.
    return officeId;
  }
}

async function runOffice(action: Extract<AgentAction, { tool: 'document' | 'spreadsheet' | 'slides' | 'email' }>, ctx: ActionContext): Promise<ActionOutcome> {
  const officeAction = action.tool === 'document' ? 'doc' : action.tool === 'spreadsheet' ? 'sheet' : action.tool;
  const previous = action.source_artifact ? ctx.artifacts.find((a) => a.id === action.source_artifact) : undefined;
  const source = previous ? artifactSourceText(previous) : undefined;
  const { data, error } = await supabase.functions.invoke('creative-router', {
    body: { tool: 'office_ai', office: { action: officeAction, prompt: action.prompt, source: source?.slice(0, 50_000) } },
    headers: idem(),
  });
  if (error || !data?.output) return fail(action.tool, await errorText(error, 'Não foi possível gerar com a IA do Office.'));
  const out = data.output;
  // Editar mantém o mesmo artefato (mesmo id e mesmo item na galeria do Office).
  const sameKind = (kind: Artifact['kind']) => (previous?.kind === kind ? previous : undefined);

  if (officeAction === 'doc') {
    const { docFromAi } = await import('@/lib/office/documentModel');
    const doc = docFromAi(out.title, out.blocks);
    const prev = sameKind('doc') as Extract<Artifact, { kind: 'doc' }> | undefined;
    const officeId = await saveToOffice(ctx, 'doc', doc, prev?.officeId);
    return {
      artifact: { id: prev?.id ?? ctx.newId(), kind: 'doc', title: doc.title, doc, officeId },
      result: { tool: action.tool, ok: true, summary: `Documento "${doc.title}" com ${doc.blocks.length} blocos.` },
    };
  }
  if (officeAction === 'sheet') {
    const { sheetFromTable } = await import('@/lib/office/sheetModel');
    const title = titleFrom(action.prompt, 50) || 'Planilha';
    const sheet = sheetFromTable(title, out.headers, out.rows);
    const prev = sameKind('sheet') as Extract<Artifact, { kind: 'sheet' }> | undefined;
    if (prev) sheet.title = prev.sheet.title;
    const officeId = await saveToOffice(ctx, 'sheet', sheet, prev?.officeId);
    return {
      artifact: { id: prev?.id ?? ctx.newId(), kind: 'sheet', title: sheet.title, sheet, officeId },
      result: { tool: action.tool, ok: true, summary: `Planilha com ${out.rows.length} linhas e colunas: ${out.headers.join(', ')}.` },
    };
  }
  if (officeAction === 'slides') {
    const { makeSlide } = await import('@/lib/office/slidesModel');
    const deck = {
      title: out.title as string,
      slides: (out.slides as Array<{ title: string; bullets: string[] }>).map((s) => makeSlide(s.title, s.bullets)),
      updatedAt: new Date().toISOString(),
    };
    const prev = sameKind('slides') as Extract<Artifact, { kind: 'slides' }> | undefined;
    const officeId = await saveToOffice(ctx, 'slides', deck, prev?.officeId);
    return {
      artifact: { id: prev?.id ?? ctx.newId(), kind: 'slides', title: deck.title, deck, officeId },
      result: { tool: action.tool, ok: true, summary: `Apresentação "${deck.title}" com ${deck.slides.length} slides.` },
    };
  }
  const prev = sameKind('email');
  return {
    artifact: { id: prev?.id ?? ctx.newId(), kind: 'email', title: out.subject, subject: out.subject, body: out.body },
    result: { tool: action.tool, ok: true, summary: `Rascunho de e-mail: "${out.subject}".` },
  };
}

async function runApp(action: Extract<AgentAction, { tool: 'app' }>, ctx: ActionContext): Promise<ActionOutcome> {
  const blocked = ctx.appBlockedReason();
  if (blocked) return fail('app', blocked);
  const previous = action.source_artifact
    ? (ctx.artifacts.find((a) => a.id === action.source_artifact && a.kind === 'app') as Extract<Artifact, { kind: 'app' }> | undefined)
    : undefined;
  const messages: CodeMsg[] = previous?.html
    ? [
        { role: 'user', content: previous.prompt },
        { role: 'assistant', content: previous.html },
        { role: 'user', content: action.prompt },
      ]
    : [{ role: 'user', content: action.prompt }];

  await ctx.chargeAppEdit();
  let text = '';
  let streamError: string | null = null;
  await streamChat({
    messages,
    mode: 'flow',
    onDelta: (chunk) => {
      text += chunk;
      const { code } = splitProseAndCode(text);
      if (code.includes('<')) ctx.onAppPreview?.(code);
    },
    onDone: () => {},
    onError: (e) => { streamError = e; },
  }).catch((e: unknown) => { streamError = e instanceof Error ? e.message : 'Falha ao gerar o aplicativo.'; });

  const html = splitProseAndCode(text).code;
  if (streamError || !html.includes('<')) return fail('app', streamError ?? 'O gerador não devolveu um aplicativo. Tente descrever com mais detalhes.');

  // Salva como projeto do Dev Code: o mesmo app abre lá para continuar editando e publicar.
  const title = titleFrom(previous?.prompt ?? action.prompt);
  const history = [...messages, { role: 'assistant' as const, content: html }];
  let projectId = previous?.projectId;
  try {
    if (projectId) {
      await supabase.from('projects').update({ generated_code: html, messages: history, updated_at: new Date().toISOString() }).eq('id', projectId);
    } else {
      const { data } = await supabase.from('projects').insert({ user_id: ctx.userId, title, generated_code: html, messages: history }).select('id').single();
      projectId = data?.id;
    }
  } catch {
    // Sem projeto salvo o app continua na conversa.
  }
  return {
    artifact: { id: previous?.id ?? ctx.newId(), kind: 'app', title, html, prompt: previous ? `${previous.prompt}\n${action.prompt}` : action.prompt, projectId },
    result: { tool: 'app', ok: true, summary: `Aplicativo gerado (${Math.round(html.length / 1024)} KB)${projectId ? ' e salvo no Dev Code' : ''}.` },
  };
}

async function runMusic(action: Extract<AgentAction, { tool: 'music' }>, ctx: ActionContext): Promise<ActionOutcome> {
  const { data, error } = await supabase.functions.invoke('creative-music', {
    body: { action: 'generate', prompt: action.prompt, instrumental: action.instrumental },
    headers: idem(),
  });
  if (error || !data?.task_id) return fail('music', await errorText(error, 'Não foi possível iniciar a música.'));
  // A música leva de 1 a 3 minutos: consulta até sair a primeira faixa.
  for (let i = 0; i < 48; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const { data: st } = await supabase.functions.invoke('creative-music', {
      body: { action: 'status', task_id: data.task_id, asset_id: data.asset_id },
    });
    const ready = ((st?.items ?? []) as Array<{ audioUrl?: string; title?: string; imageUrl?: string }>).filter((x) => x.audioUrl);
    if (ready.length > 0) {
      const tracks = ready.map((x, n) => ({ title: x.title || `Faixa ${n + 1}`, audioUrl: x.audioUrl as string, imageUrl: x.imageUrl }));
      return {
        artifact: { id: ctx.newId(), kind: 'music', title: tracks[0].title, tracks, prompt: action.prompt },
        result: { tool: 'music', ok: true, summary: `${tracks.length} faixa(s) pronta(s): ${tracks.map((t) => t.title).join(', ')}.` },
      };
    }
    if (typeof st?.status === 'string' && /FAIL|ERROR/i.test(st.status)) break;
  }
  return fail('music', 'A música não ficou pronta a tempo. Ela aparece no histórico do Painel Criativo quando terminar.');
}

async function runApi(action: Extract<AgentAction, { tool: 'api_request' }>, ctx: ActionContext): Promise<ActionOutcome> {
  let host = '';
  try {
    host = new URL(action.url.replace(/\{\{[^}]*\}\}/g, 'x')).host;
  } catch {
    return fail('api_request', 'O endereço da API é inválido.');
  }
  const secrets = secretPlaceholders([action.url, action.body ?? '', ...Object.values(action.headers)].join('\n'));
  const approved = await ctx.approveApi({ method: action.method, url: action.url, host, reason: action.reason, secrets, hasBody: !!action.body });
  if (!approved) {
    return { result: { tool: 'api_request', ok: false, summary: 'O usuário não autorizou esta chamada.' }, error: `Chamada para ${host} não autorizada.`, needsFollowUp: true };
  }
  const { data, error } = await supabase.functions.invoke('creative-router', {
    body: { tool: 'api_request', api: { method: action.method, url: action.url, headers: action.headers, body: action.body, confirmed: true } },
  });
  if (error) {
    const code = await functionErrorCode(error);
    if (code === 'missing_secrets') {
      const message = `Falta salvar no Cofre de segredos: ${secrets.join(', ')}.`;
      return { error: message, panel: 'secrets', result: { tool: 'api_request', ok: false, summary: message }, needsFollowUp: true };
    }
    const message = await errorText(error, `Não foi possível chamar ${host}.`);
    return { error: message, result: { tool: 'api_request', ok: false, summary: message }, needsFollowUp: true };
  }
  const status = Number(data?.status ?? 0);
  const body = String(data?.body ?? '');
  const note = data?.error === 'timeout' ? 'A API não respondeu em 20 segundos.' : data?.error ? 'Falha de rede ao chamar a API.' : '';
  return {
    artifact: { id: ctx.newId(), kind: 'api', title: `${action.method} ${host}`, method: action.method, host, status, ok: !!data?.ok, body: body || note },
    result: { tool: 'api_request', ok: !!data?.ok, summary: `HTTP ${status}${data?.truncated ? ' (resposta cortada)' : ''}\n${body || note}` },
    needsFollowUp: true,
  };
}

// ─── Clima, conectores e MCP ─────────────────────────────────────────────

const followUp = (tool: string, ok: boolean, summary: string, error?: string): ActionOutcome => ({
  result: { tool, ok, summary },
  needsFollowUp: true,
  ...(error ? { error } : {}),
});

function devicePosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });
}

/** Clima pela Open-Meteo (gratuita, sem chave). Com lugar: geocodifica. Sem lugar: localização do aparelho. */
async function runWeather(action: Extract<AgentAction, { tool: 'weather' }>): Promise<ActionOutcome> {
  let where: { latitude: number; longitude: number; label: string } | null = null;
  if (action.place) {
    // "Grajaú, São Paulo" → tenta o texto inteiro e depois só a primeira parte.
    for (const name of [action.place, action.place.split(',')[0]]) {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=1&language=pt`);
      const hit = r.ok ? (await r.json())?.results?.[0] : null;
      if (hit) {
        where = { latitude: hit.latitude, longitude: hit.longitude, label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ') };
        break;
      }
    }
    if (!where) return followUp('weather', false, `Lugar não encontrado: ${action.place}. Peça a cidade ao usuário.`);
  } else {
    const pos = await devicePosition();
    if (!pos) return followUp('weather', false, 'O usuário não liberou a localização do aparelho. Pergunte o bairro ou a cidade.');
    where = { ...pos, label: 'localização do aparelho' };
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${where.latitude}&longitude=${where.longitude}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto';
  const r = await fetch(url);
  if (!r.ok) return followUp('weather', false, 'O serviço de clima não respondeu agora.');
  const d = await r.json();
  const c = d.current;
  const days = (d.daily?.time ?? []).map((day: string, i: number) =>
    `${day}: ${weatherText(d.daily.weather_code[i])}, ${d.daily.temperature_2m_min[i]}–${d.daily.temperature_2m_max[i]} °C, chuva ${d.daily.precipitation_probability_max[i] ?? 0}%`);
  return followUp('weather', true, [
    `Local: ${where.label} (fuso ${d.timezone}).`,
    `Agora: ${weatherText(c.weather_code)}, ${c.temperature_2m} °C (sensação ${c.apparent_temperature} °C), umidade ${c.relative_humidity_2m}%, vento ${c.wind_speed_10m} km/h, chuva ${c.precipitation} mm.`,
    ...days,
    'Fonte: Open-Meteo.',
  ].join('\n'));
}

const NOT_CONNECTED = (name: string) => `${name} não está conectado. O usuário conecta em Conectores.`;

async function gmailAccount(): Promise<{ id: string; email: string } | null> {
  const { data } = await supabase.from('gmail_accounts').select('id,email').limit(1);
  return (data?.[0] as { id: string; email: string } | undefined) ?? null;
}

async function runGmailSearch(action: Extract<AgentAction, { tool: 'gmail_search' }>): Promise<ActionOutcome> {
  const account = await gmailAccount();
  if (!account) return { ...followUp('gmail_search', false, NOT_CONNECTED('O Gmail')), panel: 'connectors' };
  const { data, error } = await supabase.functions.invoke('gmail-list-messages', {
    body: { accountId: account.id, q: action.query || undefined, maxResults: action.max },
  });
  if (error) return followUp('gmail_search', false, 'Não foi possível ler o Gmail agora.');
  const messages = ((data?.messages ?? []) as Array<{ from?: string; subject?: string; date?: string; snippet?: string }>);
  const lines = messages.map((m, i) => `${i + 1}. De: ${m.from ?? '?'} | Assunto: ${m.subject ?? '(sem assunto)'} | ${m.date ?? ''}\n   ${m.snippet ?? ''}`);
  return followUp('gmail_search', true, `Conta ${account.email}. ${messages.length} e-mail(s):\n${lines.join('\n') || '(nenhum)'}`);
}

async function runGmailSend(action: Extract<AgentAction, { tool: 'gmail_send' }>, ctx: ActionContext): Promise<ActionOutcome> {
  const account = await gmailAccount();
  if (!account) return { ...followUp('gmail_send', false, NOT_CONNECTED('O Gmail')), panel: 'connectors' };
  const ok = await ctx.approveApi({
    method: 'ENVIAR E-MAIL', url: `Para ${action.to} — "${action.subject}"`, host: `Gmail (${account.email})`,
    reason: action.body.length > 400 ? `${action.body.slice(0, 400)}…` : action.body, secrets: [], hasBody: true,
  });
  if (!ok) return followUp('gmail_send', false, 'O usuário não autorizou o envio.', 'E-mail não enviado.');
  const { error } = await supabase.functions.invoke('gmail-send-message', {
    body: { accountId: account.id, to: action.to, subject: action.subject, body: action.body },
  });
  if (error) return followUp('gmail_send', false, 'O Gmail recusou o envio.', 'Não foi possível enviar o e-mail.');
  return followUp('gmail_send', true, `E-mail enviado para ${action.to} pela conta ${account.email}.`);
}

async function runSlackSend(action: Extract<AgentAction, { tool: 'slack_send' }>, ctx: ActionContext): Promise<ActionOutcome> {
  const ok = await ctx.approveApi({
    method: 'ENVIAR MENSAGEM', url: `Canal ${action.channel}`, host: 'Slack',
    reason: action.text.length > 400 ? `${action.text.slice(0, 400)}…` : action.text, secrets: [], hasBody: true,
  });
  if (!ok) return followUp('slack_send', false, 'O usuário não autorizou o envio.', 'Mensagem não enviada.');
  const { error } = await supabase.functions.invoke('slack-send-message', { body: { channel: action.channel, text: action.text } });
  if (error) return { ...followUp('slack_send', false, `${NOT_CONNECTED('O Slack')} (ou o canal não existe).`, 'Não foi possível enviar no Slack.'), panel: 'connectors' };
  return followUp('slack_send', true, `Mensagem enviada em ${action.channel}.`);
}

/** Chama um servidor MCP (HTTP) que o cliente adicionou, passando pelo api_request do servidor. */
async function runMcp(action: Extract<AgentAction, { tool: 'mcp_call' }>, ctx: ActionContext): Promise<ActionOutcome> {
  const conn = loadConnections().find((c) => c.kind === 'mcp' && c.name.toLowerCase() === action.server.toLowerCase());
  if (!conn) return followUp('mcp_call', false, `Não há conexão MCP chamada "${action.server}". O usuário adiciona em Minhas conexões.`);
  const host = new URL(conn.url).host;
  const what = action.method === 'call_tool' ? `usar a ferramenta "${action.name}"` : 'listar as ferramentas';
  const ok = await ctx.approveApi({
    method: 'MCP', url: conn.url, host: `${conn.name} (${host})`, reason: `O chat quer ${what} neste servidor.`,
    secrets: conn.secret ? [conn.secret] : [], hasBody: action.method === 'call_tool',
  });
  if (!ok) return followUp('mcp_call', false, 'O usuário não autorizou.', `Uso de ${conn.name} não autorizado.`);

  const headers: Record<string, string> = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
  if (conn.secret) headers.Authorization = `Bearer {{${conn.secret}}}`;
  const rpc = async (payload: Record<string, unknown>, session?: string) => {
    const { data, error } = await supabase.functions.invoke('creative-router', {
      body: {
        tool: 'api_request',
        api: {
          method: 'POST', url: conn.url, confirmed: true,
          headers: session ? { ...headers, 'Mcp-Session-Id': session } : headers,
          body: JSON.stringify({ jsonrpc: '2.0', ...payload }),
        },
      },
    });
    if (error) throw new Error((await functionErrorCode(error)) ?? 'api_error');
    return data as { ok: boolean; status: number; body: string; sessionId?: string };
  };

  try {
    const init = await rpc({
      id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'vertal-chat', version: '1.0' } },
    });
    if (!init.ok) return followUp('mcp_call', false, `O servidor ${conn.name} respondeu HTTP ${init.status} na conexão.`, `Não foi possível conectar a ${conn.name}.`);
    const session = init.sessionId || undefined;
    await rpc({ method: 'notifications/initialized' }, session).catch(() => undefined);
    const res = await rpc(
      action.method === 'call_tool'
        ? { id: 2, method: 'tools/call', params: { name: action.name, arguments: action.arguments ?? {} } }
        : { id: 2, method: 'tools/list' },
      session,
    );
    const parsed = parseMcpBody(res.body);
    if (!res.ok || !parsed || parsed.error) {
      return followUp('mcp_call', false, `Erro do servidor ${conn.name}: ${parsed?.error?.message ?? `HTTP ${res.status}`}`);
    }
    return followUp('mcp_call', true, JSON.stringify(parsed.result).slice(0, 5_500));
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    const message = code === 'missing_secrets'
      ? `Falta salvar no Cofre de segredos: ${conn.secret}.`
      : `Não foi possível falar com ${conn.name}.`;
    return { ...followUp('mcp_call', false, message, message), ...(code === 'missing_secrets' ? { panel: 'secrets' as const } : {}) };
  }
}

/** Executa uma ação. Nunca lança: falhas voltam em `error`. */
export async function runAction(action: AgentAction, ctx: ActionContext): Promise<ActionOutcome> {
  try {
    switch (action.tool) {
      case 'image': {
        const { data, error } = await supabase.functions.invoke('creative-router', {
          body: { tool: 'image', prompt: action.prompt, metadata: { source: 'vertal_chat' } },
          headers: idem(),
        });
        if (error || !data?.image_url) return fail('image', await errorText(error, 'Não foi possível gerar a imagem.'));
        const image = await storeImage(data.image_url, ctx.userId);
        return {
          artifact: { id: ctx.newId(), kind: 'image', title: titleFrom(action.prompt), image, prompt: action.prompt },
          result: { tool: 'image', ok: true, summary: 'Imagem gerada e mostrada ao usuário.' },
        };
      }
      case 'design': {
        const { data, error } = await supabase.functions.invoke('creative-design', {
          body: { prompt: action.prompt, format: action.format, tier: action.tier },
          headers: idem(),
        });
        const urls = ((data?.images ?? []) as Array<{ url: string }>).map((i) => i.url).filter(Boolean);
        if (error || urls.length === 0) return fail('design', await errorText(error, 'Não foi possível gerar o design.'));
        const images = await Promise.all(urls.map((u) => storeImage(u, ctx.userId)));
        return {
          artifact: { id: ctx.newId(), kind: 'design', title: titleFrom(action.prompt), images, format: action.format, prompt: action.prompt },
          result: { tool: 'design', ok: true, summary: `${images.length} variação(ões) de design (${action.format}) geradas.` },
        };
      }
      case 'document':
      case 'spreadsheet':
      case 'slides':
      case 'email':
        return await runOffice(action, ctx);
      case 'canvas': {
        const { tool: _tool, ...spec } = action;
        return {
          artifact: { id: ctx.newId(), kind: 'canvas', title: spec.name, spec },
          result: { tool: 'canvas', ok: true, summary: `Layout "${spec.name}" (${spec.width}×${spec.height}) com ${spec.elements.length} elementos, pronto para abrir no Canvas.` },
        };
      }
      case 'app':
        return await runApp(action, ctx);
      case 'music':
        return await runMusic(action, ctx);
      case 'ebook': {
        const { data, error } = await supabase.functions.invoke('creative-ebook', {
          body: { topic: action.topic, chapters: action.chapters },
          headers: idem(),
        });
        if (error || !data?.content) return fail('ebook', await errorText(error, 'Não foi possível gerar o ebook.'));
        return {
          artifact: { id: ctx.newId(), kind: 'ebook', title: data.title || titleFrom(action.topic), content: data.content, cover: data.cover ?? undefined },
          result: { tool: 'ebook', ok: true, summary: `Ebook "${data.title}" com ${action.chapters} capítulos.` },
        };
      }
      case 'download': {
        const { data, error } = await supabase.functions.invoke('creative-download', {
          body: { url: action.url, format: action.format },
          headers: idem(),
        });
        if (error || !data?.download_url) return fail('download', await errorText(error, 'Não foi possível obter o link de download.'));
        return {
          artifact: { id: ctx.newId(), kind: 'download', title: `Download ${action.format.toUpperCase()}`, url: data.download_url, format: action.format },
          result: { tool: 'download', ok: true, summary: 'Link de download pronto.' },
        };
      }
      case 'api_request':
        return await runApi(action, ctx);
      case 'weather':
        return await runWeather(action);
      case 'gmail_search':
        return await runGmailSearch(action);
      case 'gmail_send':
        return await runGmailSend(action, ctx);
      case 'slack_send':
        return await runSlackSend(action, ctx);
      case 'mcp_call':
        return await runMcp(action, ctx);
      case 'set_layout':
        ctx.setChatOnly(action.mode === 'chat_only');
        return { result: { tool: 'set_layout', ok: true, summary: action.mode === 'chat_only' ? 'Agora tudo fica só na tela do chat.' : 'Criações voltam a abrir ao lado.' } };
      case 'open_panel':
        return { panel: action.panel, result: { tool: 'open_panel', ok: true, summary: `Painel ${action.panel} aberto para o usuário.` } };
    }
  } catch (e) {
    return fail(action.tool, e instanceof Error && e.message ? 'Algo deu errado ao executar esta ferramenta.' : 'Algo deu errado.');
  }
}

/** Texto curto do que o agente está fazendo (cartão de progresso). */
export function actionLabel(action: AgentAction): string {
  switch (action.tool) {
    case 'image': return 'Criando imagem';
    case 'design': return 'Criando design no Design Premium';
    case 'document': return 'Escrevendo documento no Vertal Office';
    case 'spreadsheet': return 'Montando planilha no Vertal Office';
    case 'slides': return 'Montando apresentação no Vertal Office';
    case 'email': return 'Redigindo e-mail';
    case 'canvas': return 'Desenhando no Canvas';
    case 'app': return 'Construindo aplicativo no Dev Code';
    case 'music': return 'Compondo música (1 a 3 min)';
    case 'ebook': return 'Escrevendo ebook (pode levar alguns minutos)';
    case 'download': return 'Buscando link de download';
    case 'api_request': return 'Chamando API externa';
    case 'open_panel': return 'Abrindo painel';
    case 'weather': return 'Consultando o clima';
    case 'gmail_search': return 'Lendo o Gmail';
    case 'gmail_send': return 'Enviando e-mail pelo Gmail';
    case 'slack_send': return 'Enviando mensagem no Slack';
    case 'mcp_call': return 'Usando conexão MCP';
    case 'set_layout': return 'Ajustando a tela';
  }
}

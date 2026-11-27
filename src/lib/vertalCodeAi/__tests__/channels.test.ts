/* eslint-disable @typescript-eslint/no-explicit-any -- testes com dublês */
import { describe, expect, it, vi } from "vitest";
import {
  CHANNELS,
  channelDecision,
  crmListOp,
  crmMap,
  crmNoteOp,
  decideTool,
  graphListUrl,
  graphSendMailBody,
  graphTokenRequest,
  isOnlyOperator,
  operatorIdentityFromEnv,
  outboundCardText,
  outlookConfig,
  ownMailConfig,
  parseInbound,
  parseOutbound,
  readVia,
  receiveVia,
  reportOutbound,
  sendVia,
  type ChannelDeps,
} from "../platform";

const me = { emails: ["laercio@vertal.dev", "kubo@gmail.com"], slackUserIds: ["U0LAERCIO1"] };
const ctx = (approvalVerified = false) => ({ operator: true, approvalVerified, me });

describe("roteamento e validação dos canais", () => {
  it("catálogo cobre Gmail, Slack, Outlook, e-mail próprio e CRMs", () => {
    expect(CHANNELS.map((c) => c.id)).toEqual(["gmail", "slack", "outlook", "own_email", "crm:pipedrive", "crm:hubspot"]);
  });

  it("valida destino por tipo de canal", () => {
    expect(parseOutbound({ channel: "gmail", to: "a@b.com, a@b.com", subject: "Oi", text: "x" }).to).toEqual(["a@b.com"]);
    expect(() => parseOutbound({ channel: "gmail", to: "não-é-email", subject: "s", text: "x" })).toThrow(/inválido/);
    expect(() => parseOutbound({ channel: "gmail", to: "a@b.com", text: "x" })).toThrow(/assunto/);
    expect(parseOutbound({ channel: "slack", to: ["#geral", "U0LAERCIO1"], text: "x" }).to).toHaveLength(2);
    expect(() => parseOutbound({ channel: "slack", to: "geral", text: "x" })).toThrow(/Slack/);
    expect(() => parseOutbound({ channel: "crm:pipedrive", to: "1; drop", text: "x" })).toThrow(/CRM/);
    expect(() => parseOutbound({ channel: "fax", to: "1", text: "x" })).toThrow(/desconhecido/);
    expect(parseInbound({ channel: "outlook", limit: 999 }).limit).toBe(50);
  });

  it("identidade do operador vem do login + env", () => {
    const env = (k: string) => ({ VERTAL_OPERATOR_EMAILS: "Outro@Vertal.dev", VERTAL_OPERATOR_SLACK_IDS: "u0abc1234" } as Record<string, string>)[k];
    expect(operatorIdentityFromEnv(env, "Laercio@vertal.dev")).toEqual({ emails: ["outro@vertal.dev", "laercio@vertal.dev"], slackUserIds: ["U0ABC1234"] });
  });
});

describe("aprovação nos canais", () => {
  const send = (o: Record<string, unknown>) => parseOutbound(o);

  it("ler e receber: só leitura, roda direto (operador)", () => {
    expect(channelDecision("receive", "gmail", true)).toEqual({ kind: "run" });
    expect(channelDecision("read", "crm:hubspot", true)).toEqual({ kind: "run" });
    expect(decideTool("inbox_list", { channel: "slack", scope: "C0123456" }, ctx())).toEqual({ kind: "run" });
  });

  it("cliente nunca usa canais do cérebro", () => {
    expect(channelDecision("receive", "gmail", false).kind).toBe("deny");
    expect(decideTool("send_message", { channel: "gmail", to: "laercio@vertal.dev", subject: "s", text: "x" }, { ...ctx(true), operator: false }).kind).toBe("deny");
  });

  it("envio só para o Laércio vai direto; para qualquer outro, cartão", () => {
    expect(isOnlyOperator(send({ channel: "gmail", to: "LAERCIO@vertal.dev", subject: "s", text: "x" }), me)).toBe(true);
    expect(decideTool("send_message", { channel: "gmail", to: "laercio@vertal.dev", subject: "s", text: "x" }, ctx())).toEqual({ kind: "run" });
    expect(decideTool("send_message", { channel: "slack", to: "U0LAERCIO1", text: "x" }, ctx())).toEqual({ kind: "run" });
    // um destino de fora já basta para pedir cartão
    expect(decideTool("send_message", { channel: "gmail", to: ["laercio@vertal.dev", "cliente@x.com"], subject: "s", text: "x" }, ctx()).kind).toBe("needs_approval");
    expect(decideTool("send_message", { channel: "slack", to: "#geral", text: "x" }, ctx()).kind).toBe("needs_approval");
    expect(decideTool("send_message", { channel: "outlook", to: "socio@x.com", subject: "s", text: "x" }, ctx()).kind).toBe("needs_approval");
    expect(decideTool("send_message", { channel: "own_email", to: "socio@x.com", subject: "s", text: "x" }, ctx()).kind).toBe("needs_approval");
  });

  it("escrita em CRM sempre pede cartão", () => {
    expect(isOnlyOperator(send({ channel: "crm:pipedrive", to: "42", text: "x" }), me)).toBe(false);
    expect(decideTool("send_message", { channel: "crm:hubspot", to: "42", text: "nota" }, ctx()).kind).toBe("needs_approval");
    expect(decideTool("send_message", { channel: "crm:hubspot", to: "42", text: "nota" }, ctx(true))).toEqual({ kind: "run" });
  });

  it("relatório: padrão Gmail do Laércio (direto); para outro, cartão", () => {
    expect(reportOutbound({}, me)).toMatchObject({ channel: "gmail", to: "laercio@vertal.dev" });
    expect(decideTool("send_report", { period: "daily" }, ctx())).toEqual({ kind: "run" });
    expect(decideTool("send_report", { channel: "slack" }, ctx())).toEqual({ kind: "run" });
    expect(decideTool("send_report", { to: "investidor@x.com" }, ctx()).kind).toBe("needs_approval");
  });

  it("fase 2 e entradas inválidas são negadas", () => {
    expect(channelDecision("receive", "own_email", true).kind).toBe("deny");
    expect(decideTool("send_message", { channel: "gmail", to: "", text: "x" }, ctx()).kind).toBe("deny");
  });

  it("cartão mostra canal, destinos e texto", () => {
    expect(outboundCardText(send({ channel: "slack", to: "#geral", text: "Olá time" }))).toMatch(/Slack.*#geral[\s\S]*Olá time/);
    expect(outboundCardText(send({ channel: "crm:pipedrive", to: "42", text: "n" }))).toMatch(/Registrar no Pipedrive/);
  });
});

describe("Outlook, e-mail próprio e CRM", () => {
  it("Outlook só liga com as três credenciais", () => {
    const env = (o: Record<string, string>) => (k: string) => o[k];
    expect(outlookConfig(env({}))).toBeNull();
    const cfg = outlookConfig(env({ VERTAL_OUTLOOK_CLIENT_ID: "a", VERTAL_OUTLOOK_CLIENT_SECRET: "b", VERTAL_OUTLOOK_REFRESH_TOKEN: "c" }))!;
    expect(cfg.tenant).toBe("common");
    expect(graphTokenRequest(cfg).url).toContain("/common/oauth2/v2.0/token");
    expect(graphTokenRequest(cfg).body).toContain("Mail.Send");
    expect(graphSendMailBody(parseOutbound({ channel: "outlook", to: "a@b.com", subject: "s", text: "t" })).message.toRecipients).toEqual([{ emailAddress: { address: "a@b.com" } }]);
    expect(graphListUrl({ channel: "outlook", query: 'fatura "x"', limit: 5 })).toContain("%24search=%22fatura+x%22");
  });

  it("SMTP próprio: precisa de host/usuário/senha/remetente e recusa 25/587", () => {
    const base = { VERTAL_MAIL_SMTP_HOST: "smtp.vertal.dev", VERTAL_MAIL_SMTP_USER: "ops@vertal.dev", VERTAL_MAIL_SMTP_PASS: "x" } as Record<string, string>;
    expect(ownMailConfig((k) => base[k])).toMatchObject({ port: 465, from: "ops@vertal.dev" });
    expect(ownMailConfig((k) => ({ ...base, VERTAL_MAIL_SMTP_PORT: "587" })[k])).toBeNull();
    expect(ownMailConfig(() => undefined)).toBeNull();
  });

  it("CRM pelo Fluxos com mapa configurável", () => {
    const map = crmMap(() => undefined)["crm:pipedrive"];
    expect(crmNoteOp(map, parseOutbound({ channel: "crm:pipedrive", to: "42", subject: "Reunião", text: "ok" }))).toEqual({
      tool: "fluxos_apps",
      fluxos: { op: "run", app: "pipedrive", kind: "action", key: "createNote", parameters: { content: "Reunião\n\nok", dealId: "42" } },
    });
    expect(crmListOp(map, { channel: "crm:pipedrive", scope: "persons" }).fluxos.key).toBe("newPersons");
    const custom = crmMap(() => '{"crm:hubspot":{"app":"hubspot","noteAction":"createEngagement","searches":{"contacts":"searchContacts"}}}');
    expect(custom["crm:hubspot"].noteAction).toBe("createEngagement");
    expect(crmMap(() => "{x")["crm:hubspot"].app).toBe("hubspot");
  });
});

describe("adaptadores (dublês)", () => {
  const deps = (over: Partial<ChannelDeps> = {}): ChannelDeps => ({
    env: () => undefined,
    gmailAccountId: async () => "acc-1",
    callFunction: vi.fn(async (name: string) => ({ status: 200, data: name === "gmail-list-messages" ? { messages: [{ threadId: "t1", from: "x@y.com", subject: "Oi", snippet: "..." }] } : { ok: true, id: "m1", ts: "1.2", result: "ok" } })),
    ...over,
  });

  it("Gmail: um envio por destinatário pela função existente", async () => {
    const d = deps();
    const r = await sendVia(parseOutbound({ channel: "gmail", to: ["a@b.com", "c@d.com"], subject: "s", text: "t" }), d);
    expect(r.delivered).toEqual(["a@b.com", "c@d.com"]);
    expect(d.callFunction).toHaveBeenCalledTimes(2);
    expect((d.callFunction as any).mock.calls[0]).toEqual(["gmail-send-message", { accountId: "acc-1", to: "a@b.com", subject: "s", body: "t", mode: "send" }]);
  });

  it("Gmail sem conta conectada: não configurado, nada enviado", async () => {
    const d = deps({ gmailAccountId: async () => null });
    await expect(sendVia(parseOutbound({ channel: "gmail", to: "a@b.com", subject: "s", text: "t" }), d)).rejects.toMatchObject({ code: "not_configured" });
    expect(d.callFunction).not.toHaveBeenCalled();
  });

  it("Slack e CRM usam as funções existentes (Slack e Fluxos)", async () => {
    const d = deps();
    await sendVia(parseOutbound({ channel: "slack", to: "#geral", text: "t" }), d);
    await sendVia(parseOutbound({ channel: "crm:hubspot", to: "42", text: "n" }), d);
    const calls = (d.callFunction as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toEqual(["slack-send-message", "creative-router"]);
  });

  it("receber é só leitura (lista, nada de modificar)", async () => {
    const d = deps();
    const items = await receiveVia(parseInbound({ channel: "gmail", query: "is:unread" }), d);
    expect(items[0]).toMatchObject({ id: "t1", subject: "Oi" });
    const names = (d.callFunction as any).mock.calls.map((c: any[]) => c[0]);
    expect(names.every((n: string) => !/send|modify|delete/.test(n))).toBe(true);
  });

  it("Outlook e e-mail próprio sem credencial: não configurado", async () => {
    await expect(sendVia(parseOutbound({ channel: "outlook", to: "a@b.com", subject: "s", text: "t" }), deps())).rejects.toMatchObject({ code: "not_configured" });
    await expect(sendVia(parseOutbound({ channel: "own_email", to: "a@b.com", subject: "s", text: "t" }), deps())).rejects.toMatchObject({ code: "not_configured" });
    await expect(receiveVia(parseInbound({ channel: "own_email" }), deps())).rejects.toMatchObject({ code: "not_supported" });
  });

  it("Outlook com credenciais: token → sendMail (202)", async () => {
    const env: Record<string, string> = { VERTAL_OUTLOOK_CLIENT_ID: "a", VERTAL_OUTLOOK_CLIENT_SECRET: "b", VERTAL_OUTLOOK_REFRESH_TOKEN: "c" };
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return url.includes("oauth2") ? new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }) : new Response(null, { status: 202 });
    }) as unknown as typeof fetch;
    const r = await sendVia(parseOutbound({ channel: "outlook", to: "a@b.com", subject: "s", text: "t" }), deps({ env: (k) => env[k], fetchImpl }));
    expect(r.delivered).toEqual(["a@b.com"]);
    expect(urls[1]).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
  });

  it("ler recusa id estranho", async () => {
    await expect(readVia("gmail", "../../x", deps())).rejects.toThrow(/inválido/);
  });
});

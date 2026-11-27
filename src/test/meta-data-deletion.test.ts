// Endpoints da Meta: "Remover app" (deauthorize) e "Exclusão de dados" (signed_request HMAC-SHA256).
import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  CONFIRMATION_CODE_RE,
  handleMetaDeletion,
  makeSignedRequest,
  metaUserHash,
  newConfirmationCode,
  parseSignedRequest,
  type FluxosLinkRow,
  type MetaDeletionStore,
  type MetaRequestRow,
} from '../../supabase/functions/_shared/metaDataDeletion'
import type { FluxosEngine } from '../../supabase/functions/_shared/fluxosApps'
import { statusText } from '../pages/DataDeletionPage'

const SECRET = 'test_app_secret_0123456789abcdef'
const BASE = 'https://sccizjlpwezsgaxkclot.supabase.co/functions/v1/meta-data-deletion'
const env = (k: string) => (k === 'FLUXOS_OAUTH_META_SECRET' ? SECRET : undefined)
const CONN_A = '11111111-1111-1111-1111-111111111111'
const CONN_B = '22222222-2222-2222-2222-222222222222'

// signed_request como o SDK PHP da Meta monta (independente do código testado).
function metaStyle(payload: object, secret = SECRET) {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const s = createHmac('sha256', secret).update(p).digest('base64url')
  return `${s}.${p}`
}

function fakes(found: Array<{ id: string; appKey: string }> | null) {
  const links: FluxosLinkRow[] = [
    { id: 'row-a', user_id: 'user-1', app_key: 'instagram' },
    { id: 'row-other', user_id: 'user-1', app_key: 'google-ads' },
  ]
  const deletedEngine: string[] = []
  const deletedRows: string[] = []
  const logs: string[] = []
  const requests: MetaRequestRow[] = []
  const engine: FluxosEngine = {
    async call(method, path, body) {
      if (method === 'POST' && path === '/connections/find') {
        if (!found) return { status: 404, data: { error: 'not_found' } }
        expect(body).toMatchObject({ userId: '10223344556677', appKeys: ['facebook', 'instagram', 'whatsapp', 'meta-ads'] })
        return { status: 200, data: { ok: true, connections: found } }
      }
      if (method === 'DELETE') { deletedEngine.push(path); return { status: 200, data: { ok: true } } }
      return { status: 500, data: null }
    },
  }
  const store: MetaDeletionStore = {
    async rowsForEngineConnection(id) { return id === CONN_A ? [links[0]] : [] },
    async deleteLinkRow(id) { deletedRows.push(id) },
    async logDisconnect(row) { logs.push(row.app_key) },
    async insertRequest(row) { requests.push({ ...row, created_at: '2026-11-26T10:00:00Z' }) },
    async getRequest(code) { return requests.find((r) => r.confirmation_code === code) ?? null },
  }
  return { engine, store, deletedEngine, deletedRows, logs, requests }
}

const post = (path: string, signed: string, type = 'application/x-www-form-urlencoded') =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': type },
    body: type.includes('json') ? JSON.stringify({ signed_request: signed }) : new URLSearchParams({ signed_request: signed }).toString(),
  })

describe('parseSignedRequest', () => {
  it('aceita o formato da Meta e confere a assinatura', async () => {
    const signed = metaStyle({ algorithm: 'HMAC-SHA256', user_id: '10223344556677', issued_at: 1795680000 })
    expect((await parseSignedRequest(signed, SECRET))?.user_id).toBe('10223344556677')
    expect(await makeSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }, SECRET)).toBe(metaStyle({ algorithm: 'HMAC-SHA256', user_id: '1' }))
  })
  it('recusa assinatura errada, algoritmo errado e lixo', async () => {
    expect(await parseSignedRequest(metaStyle({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'outro'), SECRET)).toBeNull()
    expect(await parseSignedRequest(metaStyle({ algorithm: 'MD5', user_id: '1' }), SECRET)).toBeNull()
    expect(await parseSignedRequest(metaStyle({ algorithm: 'HMAC-SHA256' }), SECRET)).toBeNull()
    expect(await parseSignedRequest('abc', SECRET)).toBeNull()
    expect(await parseSignedRequest('a.b.c', SECRET)).toBeNull()
    expect(await parseSignedRequest('', SECRET)).toBeNull()
    const good = metaStyle({ algorithm: 'HMAC-SHA256', user_id: '1' })
    const [sig, payload] = good.split('.')
    const tampered = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '2' })).toString('base64url')
    expect(await parseSignedRequest(`${sig}.${tampered}`, SECRET)).toBeNull()
    expect(await parseSignedRequest(`${sig}.${payload}`, SECRET)).not.toBeNull()
  })
  it('código de confirmação e hash do ID', async () => {
    expect(newConfirmationCode()).toMatch(CONFIRMATION_CODE_RE)
    expect(await metaUserHash('1', SECRET)).toMatch(/^[0-9a-f]{64}$/)
    expect(await metaUserHash('1', SECRET)).not.toBe(await metaUserHash('2', SECRET))
  })
})

describe('meta-data-deletion', () => {
  const signed = () => metaStyle({ algorithm: 'HMAC-SHA256', user_id: '10223344556677', issued_at: 1795680000 })

  it('exclusão de dados: apaga só as conexões da Meta desse usuário e devolve {url, confirmation_code}', async () => {
    const f = fakes([{ id: CONN_A, appKey: 'instagram' }, { id: CONN_B, appKey: 'facebook' }, { id: 'x', appKey: 'facebook' }, { id: CONN_B, appKey: 'google-ads' }])
    const res = await handleMetaDeletion(post('', signed()), { env, engine: f.engine, store: f.store, newCode: () => 'ABCDEFGHIJKLMNOP' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://vertal.dev/data-deletion?code=ABCDEFGHIJKLMNOP', confirmation_code: 'ABCDEFGHIJKLMNOP' })
    expect(f.deletedEngine).toEqual([`/connections/${CONN_A}`, `/connections/${CONN_B}`])
    expect(f.deletedRows).toEqual(['row-a'])
    expect(f.logs).toEqual(['instagram'])
    expect(f.requests[0]).toMatchObject({ kind: 'data_deletion', status: 'completed', removed_connections: 2, confirmation_code: 'ABCDEFGHIJKLMNOP' })
    expect(JSON.stringify(f.requests)).not.toContain('10223344556677')

    const st = await handleMetaDeletion(new Request(`${BASE}?code=abcdefghijklmnop`), { env, engine: null, store: f.store })
    expect(st.status).toBe(200)
    const body = await st.json()
    expect(body).toMatchObject({ code: 'ABCDEFGHIJKLMNOP', status: 'completed', removed_connections: 2 })
    expect(JSON.stringify(body)).not.toMatch(/hash|automatisch|huginn/i)
    expect(st.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('deauthorize (caminho /deauthorize, JSON também aceito) remove e responde 200 sem código', async () => {
    const f = fakes([{ id: CONN_A, appKey: 'instagram' }])
    const res = await handleMetaDeletion(post('/deauthorize', signed(), 'application/json'), { env, engine: f.engine, store: f.store })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(f.deletedRows).toEqual(['row-a'])
    expect(f.requests[0]).toMatchObject({ kind: 'deauthorize', confirmation_code: null, status: 'completed' })
    // código de deauthorize não aparece na página de status
    const st = await handleMetaDeletion(new Request(`${BASE}?code=ABCDEFGHIJKLMNOP`), { env, engine: null, store: f.store })
    expect(st.status).toBe(404)
  })

  it('sem o motor (rota indisponível) registra como pending_review e não apaga nada', async () => {
    const f = fakes(null)
    const res = await handleMetaDeletion(post('', signed()), { env, engine: f.engine, store: f.store, newCode: () => 'QRSTUVWXYZ234567' })
    expect(res.status).toBe(200)
    expect(f.deletedEngine).toEqual([])
    expect(f.requests[0]).toMatchObject({ status: 'pending_review', removed_connections: 0, completed_at: null })
  })

  it('recusa assinatura inválida, método errado, código inválido e falta de segredo', async () => {
    const f = fakes([])
    const bad = metaStyle({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'errado')
    expect((await handleMetaDeletion(post('', bad), { env, engine: f.engine, store: f.store })).status).toBe(400)
    expect(f.requests).toEqual([])
    expect((await handleMetaDeletion(new Request(BASE, { method: 'PUT' }), { env, engine: null, store: f.store })).status).toBe(405)
    expect((await handleMetaDeletion(new Request(`${BASE}?code=1'or`), { env, engine: null, store: f.store })).status).toBe(400)
    expect((await handleMetaDeletion(post('', bad), { env: () => undefined, engine: null, store: f.store })).status).toBe(503)
    expect((await handleMetaDeletion(new Request(BASE, { method: 'OPTIONS' }), { env, engine: null, store: f.store })).status).toBe(204)
  })
})

describe('página /data-deletion', () => {
  it('English copy without the engine name', () => {
    const base = { code: 'ABCDEFGHIJKLMNOP', requested_at: null, completed_at: null }
    expect(statusText({ ...base, status: 'completed', removed_connections: 2 }).body).toContain('2 connections')
    expect(statusText({ ...base, status: 'completed', removed_connections: 1 }).body).toContain('1 connection')
    expect(statusText({ ...base, status: 'completed', removed_connections: 0 }).title).toBe('Deletion complete')
    expect(statusText({ ...base, status: 'pending_review', removed_connections: 0 }).title).toBe('Deletion in progress')
    for (const s of ['completed', 'pending_review'] as const) {
      expect(JSON.stringify(statusText({ ...base, status: s, removed_connections: 1 }))).not.toMatch(/automatisch|huginn/i)
    }
  })
})

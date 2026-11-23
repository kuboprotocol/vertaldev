import { describe, expect, it } from 'vitest';
import { AUDIO_TICKET_TTL_MS, signAudioTicket, verifyAudioTicket } from './navigatorAudio';

const SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const OTHER = 'ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=';
const SID = '2f6c1d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f';
const NOW = 1_800_000_000_000;

describe('ticket do áudio do Navigator', () => {
  it('ida e volta: o ticket válido devolve o sessionId', async () => {
    const { ticket, expiresAt } = await signAudioTicket(SECRET, SID, NOW);
    expect(expiresAt).toBe(NOW + AUDIO_TICKET_TTL_MS);
    expect(await verifyAudioTicket(SECRET, ticket, NOW + 1000)).toBe(SID);
  });

  it('expira no prazo (10 min) e não vale depois', async () => {
    const { ticket } = await signAudioTicket(SECRET, SID, NOW);
    expect(await verifyAudioTicket(SECRET, ticket, NOW + AUDIO_TICKET_TTL_MS - 1)).toBe(SID);
    expect(await verifyAudioTicket(SECRET, ticket, NOW + AUDIO_TICKET_TTL_MS)).toBeNull();
  });

  it('trocar o sessionId ou a validade invalida a assinatura', async () => {
    const { ticket } = await signAudioTicket(SECRET, SID, NOW);
    const [, exp, sig] = ticket.split('.');
    expect(await verifyAudioTicket(SECRET, `2f6c1d3e-8a4b-4c5d-9e6f-000000000000.${exp}.${sig}`, NOW)).toBeNull();
    expect(await verifyAudioTicket(SECRET, `${SID}.${Number(exp) + 1}.${sig}`, NOW)).toBeNull();
  });

  it('chave diferente não valida (ex.: ticket de outro ambiente)', async () => {
    const { ticket } = await signAudioTicket(SECRET, SID, NOW);
    expect(await verifyAudioTicket(OTHER, ticket, NOW)).toBeNull();
  });

  it('validade acima do TTL é recusada mesmo com assinatura correta', async () => {
    const { ticket } = await signAudioTicket(SECRET, SID, NOW, 60 * 60_000);
    expect(await verifyAudioTicket(SECRET, ticket, NOW)).toBeNull();
  });

  it('lixo, formato errado e sessionId que não é UUID são recusados', async () => {
    for (const bad of ['', 'abc', 'a.b.c', `${SID}.x.y`, `not-a-uuid.${NOW + 1000}.sig`, `${SID}.${NOW + 1000}.@@@`]) {
      expect(await verifyAudioTicket(SECRET, bad, NOW)).toBeNull();
    }
  });
});

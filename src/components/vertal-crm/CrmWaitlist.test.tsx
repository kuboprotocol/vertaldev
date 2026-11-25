import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const inserted: Array<Record<string, unknown>> = [];
let existing: Record<string, unknown> | null = null;
let insertError: { code: string } | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 't', user: { id: 'u1', email: 'ana@exemplo.com' } } } })) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === 'crm_waitlist' ? existing : null }) }) }),
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row);
        return { error: insertError };
      },
    }),
  },
}));

import { CrmWaitlist } from './CrmWaitlist';
import { isCrmWaitlistEnabled, WAITLIST_TEXT } from '@/lib/vertalCrm/waitlist';

describe('Vertal CRM · lista de espera', () => {
  it('ligada por padrão; "false" desliga', () => {
    expect(isCrmWaitlistEnabled({})).toBe(true);
    expect(isCrmWaitlistEnabled({ VITE_VERTAL_CRM_WAITLIST: 'false' })).toBe(false);
  });

  it('mostra "liberação em breve" (sem erro) e grava o pedido da própria conta', async () => {
    inserted.length = 0;
    existing = null;
    insertError = null;
    const { getByTestId, findByText } = render(<MemoryRouter initialEntries={['/crm?src=landing']}><CrmWaitlist langHint="pt-BR" /></MemoryRouter>);
    expect(await findByText(WAITLIST_TEXT.pt.title)).toBeTruthy();
    await waitFor(() => expect((getByTestId('crm-waitlist-join') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(getByTestId('crm-waitlist-join'));
    expect(await findByText(WAITLIST_TEXT.pt.joined)).toBeTruthy();
    expect(inserted).toEqual([expect.objectContaining({ user_id: 'u1', email: 'ana@exemplo.com', source: 'landing' })]);
  });

  it('já na lista (ou 23505): mostra confirmação', async () => {
    existing = { user_id: 'u1' };
    const { findByText } = render(<MemoryRouter><CrmWaitlist langHint="en" /></MemoryRouter>);
    expect(await findByText(WAITLIST_TEXT.en.joined)).toBeTruthy();
  });
});

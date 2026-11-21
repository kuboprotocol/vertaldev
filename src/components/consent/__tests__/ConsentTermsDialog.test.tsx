import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const callConsent = vi.fn();
vi.mock('@/lib/scrape/client', () => ({ callConsent: (...a: unknown[]) => callConsent(...a) }));

import { ConsentTermsDialog } from '../ConsentTermsDialog';
import { __resetConsentStore, requestConsent } from '@/lib/consent/store';

function status(prefill: Record<string, unknown>) {
  return {
    ok: true, status: 'ok', category: 'web_scraping', version: 'v1', title: 'Coleta web', document: '# Termo',
    prefill: { fullName: 'Maria da Silva', address: { line1: 'Rua A, 10', city: 'São Paulo', country: 'BR' }, organization: '', source: 'previous', ...prefill },
  };
}

async function openDialog() {
  render(<ConsentTermsDialog />);
  act(() => { void requestConsent({ category: 'web_scraping' }); });
  await screen.findByTestId('consent-document');
}

afterEach(() => {
  __resetConsentStore();
  callConsent.mockReset();
});

describe('cartão do termo: documento', () => {
  it('sem CPF do cadastro: campo vazio e editável; CPF inválido mostra erro e não deixa assinar', async () => {
    callConsent.mockResolvedValue(status({ document: null, documentLocked: false }));
    await openDialog();
    const input = screen.getByTestId('consent-doc-number') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input).not.toHaveAttribute('readonly');
    expect(screen.getByText(/preencha aqui/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Li o termo inteiro/));
    const sign = screen.getByRole('button', { name: /Li e assino/ });

    fireEvent.change(input, { target: { value: '52998224724' } });
    fireEvent.blur(input);
    expect(input.value).toBe('529.982.247-24');
    expect(screen.getByRole('alert')).toHaveTextContent(/dígitos verificadores/);
    expect(sign).toBeDisabled();

    fireEvent.change(input, { target: { value: '52998224725' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sign).toBeEnabled();
  });

  it('passaporte: valida o formato básico', async () => {
    callConsent.mockResolvedValue(status({ document: null, documentLocked: false }));
    await openDialog();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'passport' } });
    fireEvent.click(screen.getByLabelText(/Li o termo inteiro/));
    const input = screen.getByTestId('consent-doc-number') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ab12' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert')).toHaveTextContent(/2 letras e 6 números/);
    expect(screen.getByRole('button', { name: /Li e assino/ })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'ab123456' } });
    expect(input.value).toBe('AB123456');
    expect(screen.getByRole('button', { name: /Li e assino/ })).toBeEnabled();
  });

  it('CPF do cadastro (Stripe): vem mascarado e travado', async () => {
    callConsent.mockResolvedValue(status({ document: { type: 'cpf', country: 'BR', masked: '***.982.***-25' }, documentLocked: true, source: 'stripe' }));
    await openDialog();
    await waitFor(() => expect(screen.getByDisplayValue('***.982.***-25')).toHaveAttribute('readonly'));
    expect(screen.queryByTestId('consent-doc-number')).toBeNull();
  });
});

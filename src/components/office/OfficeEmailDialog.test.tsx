import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OfficeEmailDialog } from './OfficeEmailDialog';

const sendOfficeEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/officeEmailService', () => ({
  listGmailAccounts: vi.fn().mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111', email: 'eu@gmail.com' }]),
  sendOfficeEmail: (...args: unknown[]) => sendOfficeEmail(...args),
}));
vi.mock('@/services/officeAiService', () => ({
  OFFICE_AI_CREDIT_COST: 1,
  runOfficeAi: vi.fn(),
}));

function renderDialog() {
  return render(
    <OfficeEmailDialog
      open
      onClose={() => {}}
      title="Vendas"
      creditsAvailable={3}
      formats={[{ id: 'csv', label: 'CSV', ext: 'csv' }]}
      buildFile={() => ({ bytes: new TextEncoder().encode('a,b') })}
      sourceText={() => 'a,b'}
    />,
  );
}

describe('OfficeEmailDialog', () => {
  beforeEach(() => {
    sendOfficeEmail.mockClear();
  });

  it('não envia sem destinatário válido e sem a confirmação', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('eu@gmail.com')).toBeTruthy());
    const send = screen.getByRole('button', { name: 'Confirmar envio' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('nome@exemplo.com'), { target: { value: 'ana@ex.com' } });
    expect(send.disabled).toBe(true);
  });

  it('libera o envio só depois da confirmação e envia com confirmação', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('eu@gmail.com')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('nome@exemplo.com'), { target: { value: 'ana@ex.com' } });
    fireEvent.change(screen.getByLabelText(/Mensagem/), { target: { value: 'Segue a planilha.' } });
    const send = screen.getByRole('button', { name: 'Confirmar envio' }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole('checkbox'));
    expect(send.disabled).toBe(false);

    fireEvent.click(send);
    await waitFor(() => expect(sendOfficeEmail).toHaveBeenCalledTimes(1));
    const arg = sendOfficeEmail.mock.calls[0][0];
    expect(arg.to).toBe('ana@ex.com');
    expect(arg.attachment.filename).toBe('Vendas.csv');
  });

  it('editar o texto depois de marcar desfaz a confirmação', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('eu@gmail.com')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('nome@exemplo.com'), { target: { value: 'ana@ex.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/Mensagem/), { target: { value: 'novo texto' } });
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });
});

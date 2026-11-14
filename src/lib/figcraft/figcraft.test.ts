import { beforeEach, describe, expect, it } from 'vitest';
import {
  base64ByteLength,
  checkDesignBase64,
  designFileName,
  designStoragePath,
  designTitleFromFileName,
  isDesignId,
  isFigcraftDocumentName,
  isFigcraftTemplate,
  parseFigcraftCommands,
} from './contract';
import { figcraftFrameSrc, isFromFrame, parseFigcraftMessage } from './bridge';
import {
  registerActiveFigcraft,
  resetFigcraftBridgeForTests,
  sendFigcraftCommands,
  takeQueuedFigcraftCommands,
  activeFigcraftDesignId,
} from './activeEditor';

const UUID = '3f2c1a9e-7b44-4c1d-9a8e-112233445566';

describe('regras de documento do figCraft', () => {
  it('só .figcraft e .json viram o arquivo do design (sem o sidecar de variáveis)', () => {
    expect(isFigcraftDocumentName('Poster.figcraft')).toBe(true);
    expect(isFigcraftDocumentName('poster.FIGCRAFT')).toBe(true);
    expect(isFigcraftDocumentName('design.json')).toBe(true);
    expect(isFigcraftDocumentName('Poster.variables.json')).toBe(false);
    expect(isFigcraftDocumentName('Poster.png')).toBe(false);
    expect(isFigcraftDocumentName('Poster.fig')).toBe(false);
    expect(isFigcraftDocumentName('Poster.svg')).toBe(false);
    expect(isFigcraftDocumentName('semextensao')).toBe(false);
  });

  it('título sai do nome do arquivo, sem extensão e sem quebras', () => {
    expect(designTitleFromFileName('Loja\u0000 nova.figcraft')).toBe('Loja nova');
    expect(designTitleFromFileName('pasta/App mobile.json')).toBe('App mobile');
    expect(designTitleFromFileName('.figcraft', 'Sem nome')).toBe('Sem nome');
  });

  it('nome de arquivo e caminho no bucket', () => {
    expect(designFileName('App: v2/final')).toBe('App v2 final.figcraft');
    expect(designStoragePath('user-1', UUID)).toBe(`user-1/${UUID}.figcraft`);
    expect(isDesignId(UUID)).toBe(true);
    expect(isDesignId('../../etc')).toBe(false);
  });

  it('modelos conhecidos', () => {
    expect(isFigcraftTemplate('dashboard')).toBe(true);
    expect(isFigcraftTemplate('mobile-app')).toBe(true);
    expect(isFigcraftTemplate('rm -rf')).toBe(false);
  });
});

describe('base64 de arquivo', () => {
  it('conta bytes sem decodificar e recusa lixo', () => {
    expect(base64ByteLength('AAAA')).toBe(3);
    expect(base64ByteLength('AA==')).toBe(1);
    expect(checkDesignBase64('AAAA')).toBeNull();
    expect(checkDesignBase64('não é base64')).toBe('conteúdo não é base64 válido');
    expect(checkDesignBase64('')).toBe('conteúdo em base64 vazio');
  });
});

describe('comandos do engine', () => {
  it('aceita nomes do engine e params objeto', () => {
    const parsed = parseFigcraftCommands([
      { command: 'file.newFromTemplate', params: { template: 'dashboard' } },
      { command: 'node.create' },
    ]);
    expect(parsed).toEqual({
      commands: [
        { command: 'file.newFromTemplate', params: { template: 'dashboard' } },
        { command: 'node.create' },
      ],
    });
  });

  it('recusa nomes perigosos, params que não são objeto e listas vazias ou grandes', () => {
    expect(parseFigcraftCommands([])).toEqual({ error: 'informe ao menos um comando' });
    expect('error' in parseFigcraftCommands([{ command: 'x; rm -rf /' }])).toBe(true);
    expect('error' in parseFigcraftCommands([{ command: '../../file' }])).toBe(true);
    expect('error' in parseFigcraftCommands([{ command: 'node.create', params: [1] }])).toBe(true);
    expect('error' in parseFigcraftCommands(Array.from({ length: 41 }, () => ({ command: 'node.create' })))).toBe(true);
  });
});

describe('mensagens do figCraft', () => {
  it('lê ready, dirty, failed e save (ArrayBuffer e view)', () => {
    expect(parseFigcraftMessage({ type: 'figcraft:ready', appVersion: '0.18.1', file: false })).toEqual({
      type: 'ready',
      appVersion: '0.18.1',
      fileData: false,
    });
    expect(parseFigcraftMessage({ type: 'figcraft:dirty', dirty: true })).toEqual({ type: 'dirty', dirty: true });
    expect(parseFigcraftMessage({ type: 'figcraft:failed', error: 'sem WebGPU' })).toEqual({ type: 'failed', error: 'sem WebGPU' });

    const buf = new Uint8Array([1, 2, 3]).buffer;
    const save = parseFigcraftMessage({ type: 'figcraft:save', name: 'Poster.figcraft', bytes: buf, saveAs: true });
    expect(save).toEqual({ type: 'save', name: 'Poster.figcraft', bytes: buf, saveAs: true });

    const view = parseFigcraftMessage({ type: 'figcraft:save', name: 'a.figcraft', bytes: new Uint8Array([9, 8]), saveAs: false });
    expect(view && view.type === 'save' && new Uint8Array(view.bytes)).toEqual(new Uint8Array([9, 8]));
  });

  it('ignora o que não é do contrato', () => {
    expect(parseFigcraftMessage(null)).toBeNull();
    expect(parseFigcraftMessage('figcraft:ready')).toBeNull();
    expect(parseFigcraftMessage({ type: 'vectorcraft:ready' })).toBeNull();
    expect(parseFigcraftMessage({ type: 'figcraft:save', name: 'a.figcraft', bytes: 'texto', saveAs: false })).toBeNull();
    expect(parseFigcraftMessage({ type: 'figcraft:dirty', dirty: 'sim' })).toBeNull();
  });

  it('o iframe com host=parent e autor', () => {
    const src = figcraftFrameSrc('Ana Lima');
    expect(src).toContain('index.html?');
    expect(src).toContain('host=parent');
    expect(src).toContain('control=');
    expect(src).toContain('author=Ana+Lima');
    expect(figcraftFrameSrc()).not.toContain('author=');
  });

  it('isFromFrame exige o contentWindow do iframe e a mesma origem', () => {
    const win = {} as Window;
    const frame = { contentWindow: win } as unknown as HTMLIFrameElement;
    const same = { source: win, origin: window.location.origin } as MessageEvent;
    const other = { source: {} as Window, origin: window.location.origin } as MessageEvent;
    const foreignOrigin = { source: win, origin: 'https://evil.example' } as MessageEvent;
    expect(isFromFrame(same, frame)).toBe(true);
    expect(isFromFrame(other, frame)).toBe(false);
    expect(isFromFrame(foreignOrigin, frame)).toBe(false);
    expect(isFromFrame(same, null)).toBe(false);
  });
});

describe('ponte com o editor aberto', () => {
  beforeEach(() => resetFigcraftBridgeForTests());

  it('sem editor aberto, os comandos ficam na fila para o design', async () => {
    const r = await sendFigcraftCommands(UUID, [{ command: 'node.create', params: { type: 'frame' } }]);
    expect(r).toEqual({ status: 'queued' });
    expect(takeQueuedFigcraftCommands(UUID)).toEqual([{ command: 'node.create', params: { type: 'frame' } }]);
    expect(takeQueuedFigcraftCommands(UUID)).toEqual([]);
  });

  it('com o design aberto, roda agora e devolve o resultado de cada comando', async () => {
    const seen: string[] = [];
    const handle = registerActiveFigcraft(UUID, async (cmds) => {
      seen.push(...cmds.map((c) => c.command));
      return cmds.map((c) => ({ command: c.command, ok: c.command !== 'bad.one' }));
    });
    expect(activeFigcraftDesignId()).toBe(UUID);
    const r = await sendFigcraftCommands(UUID, [{ command: 'node.create' }, { command: 'bad.one' }]);
    expect(r.status).toBe('ran');
    expect(seen).toEqual(['node.create', 'bad.one']);
    handle.unregister();
    expect(activeFigcraftDesignId()).toBeNull();
  });

  it('design diferente do aberto vai para a fila', async () => {
    const handle = registerActiveFigcraft(UUID, async () => []);
    const r = await sendFigcraftCommands('11111111-2222-4333-8444-555555555555', [{ command: 'node.create' }]);
    expect(r.status).toBe('queued');
    handle.unregister();
  });
});

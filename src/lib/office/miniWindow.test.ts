import { describe, expect, it } from 'vitest';
import { toEmbedUrl } from '@/components/office/MiniWindow';

describe('mini janela: link para incorporação', () => {
  it('converte links de vídeo do YouTube para o formato embed', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/embed/abc123');
    expect(toEmbedUrl('youtu.be/abc123')).toBe('https://www.youtube.com/embed/abc123');
    expect(toEmbedUrl('https://m.youtube.com/watch?v=abc123&t=10')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('mantém outros sites como estão e acrescenta https quando falta o esquema', () => {
    expect(toEmbedUrl('example.com/pagina')).toBe('https://example.com/pagina');
  });

  it('recusa endereços vazios, inválidos e que não são web', () => {
    expect(toEmbedUrl('')).toBeNull();
    expect(toEmbedUrl('javascript:alert(1)')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { columnLetters, displayValue, evaluateAll, parseRef, toRef } from './formulas';

const v = (cells: Record<string, string>, ref: string) => displayValue(cells, ref);

describe('referências', () => {
  it('converte A1 e colunas acima de Z', () => {
    expect(parseRef('A1')).toEqual({ col: 0, row: 1 });
    expect(parseRef('z10')).toEqual({ col: 25, row: 10 });
    expect(parseRef('AA2')).toEqual({ col: 26, row: 2 });
    expect(parseRef('A0')).toBeNull();
    expect(parseRef('hello')).toBeNull();
  });

  it('gera letras de coluna e volta para a referência', () => {
    expect(columnLetters(0)).toBe('A');
    expect(columnLetters(25)).toBe('Z');
    expect(columnLetters(26)).toBe('AA');
    expect(toRef(26, 2)).toBe('AA2');
  });
});

describe('valores e aritmética', () => {
  it('mostra texto, números e células vazias', () => {
    expect(v({ A1: 'Produto', A2: '12', A3: '' }, 'A1')).toBe('Produto');
    expect(v({ A1: '12' }, 'A1')).toBe('12');
    expect(v({}, 'B9')).toBe('');
  });

  it('respeita precedência e parênteses', () => {
    expect(v({ A1: '=2+3*4' }, 'A1')).toBe('14');
    expect(v({ A1: '=(2+3)*4' }, 'A1')).toBe('20');
    expect(v({ A1: '=2^3^2' }, 'A1')).toBe('512');
    expect(v({ A1: '=-3+5' }, 'A1')).toBe('2');
  });

  it('calcula com referências e formata decimais', () => {
    expect(v({ A1: '10', A2: '4', A3: '=A1/A2' }, 'A3')).toBe('2.5');
    expect(v({ A1: '1', A2: '2', A3: '=A1+A2' }, 'A3')).toBe('3');
  });

  it('trata célula vazia como zero em operações', () => {
    expect(v({ A1: '=B1+5' }, 'A1')).toBe('5');
  });

  it('aceita letras minúsculas em referências', () => {
    expect(v({ A1: '4', A2: '=a1*2' }, 'A2')).toBe('8');
  });
});

describe('funções', () => {
  const sheet = { B2: '10', B3: '20', B4: 'texto', B5: '', B6: '30' };

  it('SUM, AVERAGE, MIN, MAX e COUNT ignoram texto e vazios', () => {
    expect(v({ ...sheet, C1: '=SUM(B2:B6)' }, 'C1')).toBe('60');
    expect(v({ ...sheet, C1: '=AVERAGE(B2:B6)' }, 'C1')).toBe('20');
    expect(v({ ...sheet, C1: '=MIN(B2:B6)' }, 'C1')).toBe('10');
    expect(v({ ...sheet, C1: '=MAX(B2:B6)' }, 'C1')).toBe('30');
    expect(v({ ...sheet, C1: '=COUNT(B2:B6)' }, 'C1')).toBe('3');
  });

  it('aceita vários argumentos e intervalo invertido', () => {
    expect(v({ A1: '1', A2: '2', A3: '=SUM(A1, A2, 10)' }, 'A3')).toBe('13');
    expect(v({ A1: '1', A2: '2', A3: '=SUM(A2:A1)' }, 'A3')).toBe('3');
  });

  it('ROUND e ABS', () => {
    expect(v({ A1: '=ROUND(2.345, 2)' }, 'A1')).toBe('2.35');
    expect(v({ A1: '=ROUND(7.6)' }, 'A1')).toBe('8');
    expect(v({ A1: '=ABS(-4)' }, 'A1')).toBe('4');
  });

  it('função desconhecida vira #NAME?', () => {
    expect(v({ A1: '=FOO(1)' }, 'A1')).toBe('#NAME?');
  });
});

describe('erros', () => {
  it('divisão por zero', () => {
    expect(v({ A1: '=1/0' }, 'A1')).toBe('#DIV/0!');
    expect(v({ A1: '=AVERAGE(B1:B3)' }, 'A1')).toBe('#DIV/0!');
  });

  it('texto em conta aritmética', () => {
    expect(v({ A1: 'abc', A2: '=A1+1' }, 'A2')).toBe('#VALUE!');
  });

  it('sintaxe inválida vira #ERR e não quebra a tela', () => {
    expect(v({ A1: '=1+' }, 'A1')).toBe('#ERR');
    expect(v({ A1: '=SUM(1,2' }, 'A1')).toBe('#ERR');
    expect(v({ A1: '=1 ; 2' }, 'A1')).toBe('#ERR');
  });

  it('referência fora do limite de intervalo vira #REF!', () => {
    expect(v({ A1: '=SUM(A1:ZZ99999)' }, 'A1')).toBe('#REF!');
  });

  it('dependência circular vira #CYCLE! nas duas pontas', () => {
    const cells = { A1: '=B1', B1: '=A1' };
    expect(v(cells, 'A1')).toBe('#CYCLE!');
    expect(v(cells, 'B1')).toBe('#CYCLE!');
    expect(v({ A3: '=SUM(A1:A3)' }, 'A3')).toBe('#CYCLE!');
  });

  it('fórmula muito longa é recusada', () => {
    expect(v({ A1: '=' + '1+'.repeat(400) + '1' }, 'A1')).toBe('#ERR');
  });

  it('intervalo como resultado final vira #VALUE!', () => {
    expect(v({ A1: '1', A2: '=A1:A1' }, 'A2')).toBe('#VALUE!');
  });
});

describe('evaluateAll', () => {
  it('calcula todas as células preenchidas de uma vez', () => {
    expect(evaluateAll({ A1: '2', A2: '3', A3: '=A1*A2' })).toEqual({ A1: '2', A2: '3', A3: '6' });
  });
});

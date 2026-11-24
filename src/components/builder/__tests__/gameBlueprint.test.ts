import { describe, it, expect } from 'vitest'
import {
  buildBlueprintPrompt,
  mergeBlueprintIntoConfig,
  isUsableBlueprint,
  BLUEPRINT_PROMPT_MAX,
} from '../gameBlueprint'

describe('buildBlueprintPrompt', () => {
  it('monta o pitch com título, descrição, tipo e engine', () => {
    const p = buildBlueprintPrompt({ title: 'Dragão', description: 'Voa e cospe fogo', game_type: '3d', engine: 'babylon' })
    expect(p).toContain('Título: Dragão')
    expect(p).toContain('Descrição: Voa e cospe fogo')
    expect(p).toContain('Tipo: 3d')
    expect(p).toContain('Engine: babylon')
  })

  it('omite a descrição quando ela está vazia', () => {
    const p = buildBlueprintPrompt({ title: 'Dragão', description: '   ', game_type: '2d', engine: 'phaser' })
    expect(p).not.toContain('Descrição')
  })

  it('recusa título vazio', () => {
    expect(buildBlueprintPrompt({ title: '  ', game_type: '2d', engine: 'phaser' })).toBeNull()
  })

  it('limita o tamanho ao máximo aceito pela função', () => {
    const p = buildBlueprintPrompt({ title: 'x'.repeat(5000), game_type: '2d', engine: 'phaser' })
    expect(p!.length).toBeLessThanOrEqual(BLUEPRINT_PROMPT_MAX)
  })
})

describe('mergeBlueprintIntoConfig', () => {
  it('preserva as chaves que o builder já tinha', () => {
    const merged = mergeBlueprintIntoConfig(
      { width: 800, backgroundColor: '#000' },
      { blueprint: { title: 'Dragão' }, designDoc: '# Doc', model: 'm1' },
      new Date('2026-01-01T00:00:00Z'),
    )
    expect(merged.width).toBe(800)
    expect(merged.backgroundColor).toBe('#000')
    expect(merged.blueprint).toEqual({ title: 'Dragão' })
    expect(merged.designDoc).toBe('# Doc')
    expect(merged.blueprintModel).toBe('m1')
    expect(merged.blueprintAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('aceita config nulo ou inválido', () => {
    expect(mergeBlueprintIntoConfig(null, { blueprint: { a: 1 } }).blueprint).toEqual({ a: 1 })
    expect(mergeBlueprintIntoConfig(['x'], { blueprint: { a: 1 } }).blueprint).toEqual({ a: 1 })
  })
})

describe('isUsableBlueprint', () => {
  it('aceita objeto não vazio e recusa vazio, nulo e array', () => {
    expect(isUsableBlueprint({ title: 'a' })).toBe(true)
    expect(isUsableBlueprint({})).toBe(false)
    expect(isUsableBlueprint(null)).toBe(false)
    expect(isUsableBlueprint([1])).toBe(false)
  })
})

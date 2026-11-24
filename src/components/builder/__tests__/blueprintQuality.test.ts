import { describe, it, expect } from 'vitest'
import { validateBlueprint, MAX_ENTITIES } from '../blueprintQuality'

const good = () => ({
  title: 'Ilha dos Espelhos',
  genre: 'exploração',
  dimension: '3D',
  pillars: ['exploração'],
  gameplay_loop: ['explorar', 'resolver enigma'],
  roadmap: ['protótipo', 'primeira ilha'],
  scene: {
    entities: [
      { kind: 'player', name: 'Eco', position: { x: 0, y: 0, z: 0 } },
      { kind: 'portal', name: 'Saída', position: { x: 5, y: 0, z: 2 } },
    ],
  },
})

const codes = (r: ReturnType<typeof validateBlueprint>, sev: 'error' | 'warning') =>
  r.issues.filter(i => i.severity === sev).map(i => i.path)

describe('validateBlueprint', () => {
  it('aceita um blueprint completo sem problemas', () => {
    const r = validateBlueprint(good())
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
  })

  it('recusa valor que não é objeto', () => {
    expect(validateBlueprint(null).ok).toBe(false)
    expect(validateBlueprint('texto').ok).toBe(false)
  })

  it('exige título, gênero e dimensão válida', () => {
    const b = { ...good(), title: '  ', genre: '', dimension: '5D' }
    const r = validateBlueprint(b)
    expect(r.ok).toBe(false)
    expect(codes(r, 'error')).toEqual(expect.arrayContaining(['title', 'genre', 'dimension']))
  })

  it('exige ao menos uma entidade player', () => {
    const b = good()
    b.scene.entities = [{ kind: 'npc', name: 'Guia', position: { x: 1, y: 0, z: 1 } }]
    const r = validateBlueprint(b)
    expect(r.ok).toBe(false)
    expect(r.issues.map(i => i.message)).toContain('nenhuma entidade do tipo player')
  })

  it('rejeita posição não finita (NaN ou Infinity)', () => {
    const b = good()
    b.scene.entities[1].position = { x: Number.NaN, y: 0, z: Infinity }
    const r = validateBlueprint(b)
    expect(r.ok).toBe(false)
    expect(codes(r, 'error')).toContain('scene.entities[1].position')
  })

  it('rejeita tipo de entidade desconhecido', () => {
    const b = good()
    ;(b.scene.entities[1] as { kind: string }).kind = 'boss'
    expect(codes(validateBlueprint(b), 'error')).toContain('scene.entities[1].kind')
  })

  it('limita o número de entidades', () => {
    const b = good()
    const extra = Array.from({ length: MAX_ENTITIES }, (_, i) => ({
      kind: 'prop', name: `p${i}`, position: { x: i, y: 0, z: 0 },
    }))
    b.scene.entities = [...b.scene.entities, ...extra]
    const r = validateBlueprint(b)
    expect(r.ok).toBe(false)
    expect(codes(r, 'error')).toContain('scene.entities')
  })

  it('trata falta de pilares e roadmap curto como aviso, não erro', () => {
    const b = { ...good(), pillars: [], roadmap: ['só um'] }
    const r = validateBlueprint(b)
    expect(r.ok).toBe(true)
    expect(codes(r, 'warning')).toEqual(expect.arrayContaining(['pillars', 'roadmap']))
  })

  it('avisa sobre nome de entidade repetido', () => {
    const b = good()
    b.scene.entities.push({ kind: 'prop', name: 'Eco', position: { x: 2, y: 0, z: 2 } })
    const r = validateBlueprint(b)
    expect(r.ok).toBe(true)
    expect(codes(r, 'warning')).toContain('scene.entities[2].name')
  })
})

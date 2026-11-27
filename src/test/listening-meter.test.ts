import { describe, expect, it } from 'vitest'
import { ListeningMeter } from '../lib/listeningMeter'

const play = (position: number) => ({ position, isPaused: false, isBuffering: false })

describe('ListeningMeter', () => {
  it('soma o tempo tocando de verdade', () => {
    const m = new ListeningMeter()
    for (let t = 0; t <= 31_000; t += 500) m.update(play(t), 1_000_000 + t)
    expect(m.listenedSeconds).toBe(31)
  })

  it('não conta pausa nem buffer', () => {
    const m = new ListeningMeter()
    m.update(play(0), 0)
    m.update(play(1000), 1000)
    m.update({ position: 1000, isPaused: true }, 2000)
    m.update(play(1000), 60_000)
    m.update({ position: 1500, isPaused: false, isBuffering: true }, 60_500)
    m.update(play(2000), 61_000)
    expect(m.listenedMs).toBe(1000)
  })

  it('não conta seek para frente nem para trás', () => {
    const m = new ListeningMeter()
    m.update(play(0), 0)
    m.update(play(1000), 1000)
    m.update(play(25_000), 1500) // pulou 24 s em 0,5 s
    m.update(play(26_000), 2500)
    m.update(play(5000), 3000) // voltou
    m.update(play(6000), 4000)
    expect(m.listenedMs).toBe(3000)
  })

  it('reset zera a medição', () => {
    const m = new ListeningMeter()
    m.update(play(0), 0)
    m.update(play(1000), 1000)
    m.reset()
    m.update(play(5000), 5000)
    expect(m.listenedMs).toBe(0)
  })
})

// Sem imports: medição pura, testada em src/test/listening-meter.test.ts.

/** Evento `playback_update` do Spotify iFrame API (posição e duração em ms). */
export interface PlaybackState {
  position: number;
  duration?: number;
  isPaused: boolean;
  isBuffering?: boolean;
}

/**
 * Mede o tempo de reprodução REAL a partir dos eventos `playback_update`:
 * só soma enquanto toca (sem pausa/buffer) e só avanços de posição compatíveis com o relógio
 * (um pulo para frente maior que o tempo que passou é seek e não conta; voltar também não conta).
 */
export class ListeningMeter {
  listenedMs = 0;
  private lastPos: number | null = null;
  private lastWall: number | null = null;

  update(state: PlaybackState, wallMs: number): number {
    if (state.isPaused || state.isBuffering) {
      this.lastPos = null;
      this.lastWall = null;
      return this.listenedMs;
    }
    if (this.lastPos !== null && this.lastWall !== null) {
      const dPos = state.position - this.lastPos;
      const dWall = wallMs - this.lastWall;
      if (dPos > 0 && dPos <= dWall + 1000) this.listenedMs += dPos;
    }
    this.lastPos = state.position;
    this.lastWall = wallMs;
    return this.listenedMs;
  }

  get listenedSeconds(): number {
    return Math.floor(this.listenedMs / 100) / 10;
  }

  reset(): void {
    this.listenedMs = 0;
    this.lastPos = null;
    this.lastWall = null;
  }
}

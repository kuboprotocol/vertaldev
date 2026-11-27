import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  fetchServerConsent,
  getBandwidthDeviceId,
  nextConsent,
  readLocalConsent,
  saveServerConsent,
  writeLocalConsent,
  type BandwidthConsent,
} from '@/lib/bandwidthSharing'

/**
 * Estado do consentimento de compartilhamento de banda, compartilhado entre banner, diálogo,
 * Recompensas e Perfil (uma mudança em um lugar aparece em todos).
 */
interface State {
  consent: BandwidthConsent
  /** true quando a escolha está só neste navegador (servidor sem a migração ou fora do ar). */
  localOnly: boolean
  loadedFor: string | null
}

let state: State = { consent: readLocalConsent(), localOnly: false, loadedFor: null }
const listeners = new Set<() => void>()

function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => state

/** Só para testes. */
export function __resetBandwidthConsentStore() {
  state = { consent: readLocalConsent(), localOnly: false, loadedFor: null }
  listeners.forEach((l) => l())
}

export type SaveOutcome = 'saved' | 'local' | 'error' | 'signed_out'

export function useBandwidthConsent() {
  const { user } = useAuth()
  const s = useSyncExternalStore(subscribe, snapshot, snapshot)
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId || state.loadedFor === userId) return
    state = { ...state, loadedFor: userId }
    const deviceId = getBandwidthDeviceId()
    void (async () => {
      const server = await fetchServerConsent(userId, deviceId)
      const stored = state.consent
      // Escolha local de outra conta neste navegador não vale para esta.
      const local = stored.userId && stored.userId !== userId ? { ...stored, optedIn: false, pendingSync: false } : stored
      if (server === null) {
        setState({ consent: local, localOnly: Boolean(local.updatedAt && local.pendingSync) })
        return
      }
      if (server === 'none') {
        // Escolha feita antes de o servidor estar pronto: envia agora (só o que o usuário escolheu).
        if (local.pendingSync && local.updatedAt && local.userId === userId) {
          const saved = await saveServerConsent(deviceId, local.optedIn)
          if (saved) {
            writeLocalConsent(saved)
            setState({ consent: saved, localOnly: false })
            return
          }
          setState({ localOnly: true })
          return
        }
        // Sem registro no servidor para este dispositivo = desligado.
        const off = { ...local, optedIn: false, pendingSync: false }
        writeLocalConsent(off)
        setState({ consent: off, localOnly: false })
        return
      }
      writeLocalConsent(server)
      setState({ consent: server, localOnly: false })
    })()
  }, [userId])

  const setOptIn = useCallback(
    async (optedIn: boolean): Promise<SaveOutcome> => {
      if (!userId) return 'signed_out'
      const deviceId = getBandwidthDeviceId()
      const saved = await saveServerConsent(deviceId, optedIn)
      if (saved) {
        writeLocalConsent(saved)
        setState({ consent: saved, localOnly: false })
        return 'saved'
      }
      // Servidor sem a migração: guarda a escolha neste navegador e sincroniza depois.
      const local = { ...nextConsent(state.consent, optedIn), pendingSync: true, userId }
      try {
        writeLocalConsent(local)
      } catch {
        return 'error'
      }
      setState({ consent: local, localOnly: true })
      return 'local'
    },
    [userId],
  )

  // Sem conta: sempre desligado na tela (ativar exige entrar).
  const consent = userId ? s.consent : { ...s.consent, optedIn: false }
  return { consent, localOnly: s.localOnly, signedIn: Boolean(userId), setOptIn }
}

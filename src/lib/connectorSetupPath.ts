import type { ConnectorConfig } from './connectorsConfig'

/** Página onde o conector é conectado de verdade (painel de setup). */
export function connectorSetupPath(connector: Pick<ConnectorConfig, 'slug'>): string {
  return `/connectors/${encodeURIComponent(connector.slug)}/setup`
}

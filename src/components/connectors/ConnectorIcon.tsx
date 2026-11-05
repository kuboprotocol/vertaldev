import type { CSSProperties } from 'react'
import type { ConnectorConfig } from '@/lib/connectorsConfig'

/** Ícone do conector: o logo oficial quando existe (`logoUrl`), senão o ícone padrão na cor do conector. */
export function ConnectorIcon({
  connector,
  className,
  style,
}: {
  connector: Pick<ConnectorConfig, 'icon' | 'color' | 'logoUrl' | 'name'>
  className?: string
  style?: CSSProperties
}) {
  if (connector.logoUrl) {
    return <img src={connector.logoUrl} alt={connector.name} className={`${className ?? ''} object-contain`} draggable={false} />
  }
  const Icon = connector.icon
  return <Icon className={className} style={{ color: connector.color, ...style }} />
}

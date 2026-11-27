// Textos do conector MetaMask (pt-BR, en, es). Idioma: ?lang= → Ajustes → Idioma / perfil / navegador
// (mesma regra do Agendador, do WhatsApp e do Mobile Studio).
export type MmLang = 'pt' | 'en' | 'es'

export function mmLang(hint: string | null | undefined): MmLang {
  const s = (hint ?? '').toLowerCase()
  if (s.startsWith('es')) return 'es'
  if (s.startsWith('en')) return 'en'
  return 'pt'
}

export interface MmTexts {
  back: string
  via: string
  title: string
  intro: string
  security: string[]
  tabConnect: string
  tabTrader: string
  tabTemplate: string
  network: string
  testnetTag: string
  connectExtension: string
  connectMobile: string
  connectWalletConnect: string
  noMetaMask: string
  installMetaMask: string
  connecting: string
  connectedAs: string
  connectedAt: string
  disconnect: string
  disconnected: string
  refresh: string
  balance: string
  txCount: string
  block: string
  recentTx: string
  recentTxNeedsKey: string
  noTx: string
  migrationPending: string
  disabled: string
  errors: Record<string, string>
  templateTitle: string
  templateIntro: string
  templateCopyAll: string
  templateDownload: string
  templateHint: string
  copy: string
  copied: string
  traderTitle: string
  traderDisclaimer: string
  traderIntro: string
  traderPlaceholder: string
  traderExamples: string[]
  traderBuild: string
  traderNeedsConnection: string
  traderDisabled: string
  quote: string
  pay: string
  receive: string
  price: string
  triggerNow: string
  triggerDrop: (pct: number, target: string) => string
  triggerRise: (pct: number, target: string) => string
  triggerWaiting: string
  triggerMet: string
  watch: string
  stopWatch: string
  watchingNote: string
  sign: (i: number, n: number, what: string) => string
  txApprove: string
  txSwap: string
  txSent: string
  viewTx: string
  signedByYou: string
  futureNote: string
}

const ERR_PT: Record<string, string> = {
  not_signed_in: 'Entre na sua conta Vertal primeiro.',
  no_account: 'A MetaMask não liberou nenhuma conta.',
  chain_not_allowed: 'Rede não aceita. Use Sepolia (testnet) ou Ethereum.',
  invalid_origin: 'Abra pelo endereço oficial do Vertal Dev.',
  domain_not_allowed: 'Domínio não autorizado para assinar.',
  expired: 'A mensagem expirou. Tente de novo.',
  bad_nonce: 'Mensagem inválida ou de outra sessão. Tente de novo.',
  bad_signature: 'Assinatura não confere com a carteira.',
  invalid_message: 'Mensagem inválida.',
  secret_material_refused: 'Recusado: isso parece uma frase-semente ou chave privada. Nunca cole isso em lugar nenhum.',
  migration_pending: 'Assinatura conferida, mas a tabela ainda não foi criada (migração pendente).',
  not_connected: 'Conecte a carteira primeiro.',
  rpc_unavailable: 'Rede indisponível agora. Tente em instantes.',
  not_understood: 'Não entendi a ordem. Ex.: “compre 0.01 ETH de UNI quando cair 5%”.',
  unknown_token: 'Token não encontrado na Sepolia. Use UNI, LINK, USDC ou cole o endereço 0x….',
  invalid_amount: 'Quantidade inválida.',
  no_liquidity: 'Sem liquidez para esse par na Sepolia agora.',
  mainnet_blocked: 'Mainnet bloqueada: o Trader só funciona na testnet Sepolia.',
  mainnet_not_supported_yet: 'Mainnet ainda não é suportada nesta versão.',
  testnet_only: 'Só testnet (Sepolia).',
  account_mismatch: 'A conta ativa na MetaMask não é a conectada.',
  user_rejected: 'Você recusou na MetaMask.',
  vertal_metamask_disabled: 'O conector MetaMask ainda não está liberado para a sua conta.',
  vertal_trader_disabled: 'O Trader ainda não está liberado para a sua conta.',
  network_error: 'Falha de rede.',
}
const ERR_EN: Record<string, string> = {
  not_signed_in: 'Sign in to your Vertal account first.',
  no_account: 'MetaMask did not share any account.',
  chain_not_allowed: 'Network not accepted. Use Sepolia (testnet) or Ethereum.',
  invalid_origin: 'Open it from the official Vertal Dev address.',
  domain_not_allowed: 'Domain not allowed to sign.',
  expired: 'The message expired. Try again.',
  bad_nonce: 'Invalid message or from another session. Try again.',
  bad_signature: 'Signature does not match the wallet.',
  invalid_message: 'Invalid message.',
  secret_material_refused: 'Refused: this looks like a seed phrase or private key. Never paste that anywhere.',
  migration_pending: 'Signature verified, but the table is not created yet (pending migration).',
  not_connected: 'Connect the wallet first.',
  rpc_unavailable: 'Network unavailable right now. Try again shortly.',
  not_understood: 'I did not understand the order. E.g. “buy 0.01 ETH of UNI when it drops 5%”.',
  unknown_token: 'Token not found on Sepolia. Use UNI, LINK, USDC or paste the 0x… address.',
  invalid_amount: 'Invalid amount.',
  no_liquidity: 'No liquidity for this pair on Sepolia right now.',
  mainnet_blocked: 'Mainnet blocked: the Trader only works on the Sepolia testnet.',
  mainnet_not_supported_yet: 'Mainnet is not supported in this version yet.',
  testnet_only: 'Testnet only (Sepolia).',
  account_mismatch: 'The active MetaMask account is not the connected one.',
  user_rejected: 'You rejected it in MetaMask.',
  vertal_metamask_disabled: 'The MetaMask connector is not enabled for your account yet.',
  vertal_trader_disabled: 'The Trader is not enabled for your account yet.',
  network_error: 'Network error.',
}
const ERR_ES: Record<string, string> = {
  not_signed_in: 'Inicia sesión en tu cuenta Vertal primero.',
  no_account: 'MetaMask no compartió ninguna cuenta.',
  chain_not_allowed: 'Red no aceptada. Usa Sepolia (testnet) o Ethereum.',
  invalid_origin: 'Ábrelo desde la dirección oficial de Vertal Dev.',
  domain_not_allowed: 'Dominio no autorizado para firmar.',
  expired: 'El mensaje expiró. Inténtalo de nuevo.',
  bad_nonce: 'Mensaje inválido o de otra sesión. Inténtalo de nuevo.',
  bad_signature: 'La firma no coincide con la billetera.',
  invalid_message: 'Mensaje inválido.',
  secret_material_refused: 'Rechazado: parece una frase semilla o clave privada. Nunca la pegues en ningún lugar.',
  migration_pending: 'Firma verificada, pero la tabla aún no existe (migración pendiente).',
  not_connected: 'Conecta la billetera primero.',
  rpc_unavailable: 'Red no disponible ahora. Inténtalo en un momento.',
  not_understood: 'No entendí la orden. Ej.: “compra 0.01 ETH de UNI cuando baje 5%”.',
  unknown_token: 'Token no encontrado en Sepolia. Usa UNI, LINK, USDC o pega la dirección 0x….',
  invalid_amount: 'Cantidad inválida.',
  no_liquidity: 'Sin liquidez para este par en Sepolia ahora.',
  mainnet_blocked: 'Mainnet bloqueada: el Trader solo funciona en la testnet Sepolia.',
  mainnet_not_supported_yet: 'Mainnet aún no es compatible en esta versión.',
  testnet_only: 'Solo testnet (Sepolia).',
  account_mismatch: 'La cuenta activa en MetaMask no es la conectada.',
  user_rejected: 'Lo rechazaste en MetaMask.',
  vertal_metamask_disabled: 'El conector MetaMask aún no está habilitado para tu cuenta.',
  vertal_trader_disabled: 'El Trader aún no está habilitado para tu cuenta.',
  network_error: 'Error de red.',
}

const pt: MmTexts = {
  back: 'Voltar aos conectores',
  via: 'Vertal Dev · Conectores',
  title: 'MetaMask',
  intro: 'Conecte a sua carteira assinando uma mensagem (Sign-In with Ethereum). Isso só prova que a carteira é sua: não gasta nada e não autoriza transações.',
  security: [
    'O Vertal nunca pede a sua frase-semente (12/24 palavras) nem a chave privada. Se alguém pedir, é golpe.',
    'Guardamos só o endereço público, a rede e a data da conexão.',
    'Toda transação é mostrada e assinada por você na MetaMask. O Vertal não assina nada e não guarda fundos.',
  ],
  tabConnect: 'Conexão',
  tabTrader: 'Trader (testnet)',
  tabTemplate: 'Starter Web3',
  network: 'Rede',
  testnetTag: 'testnet',
  connectExtension: 'Conectar com a MetaMask',
  connectMobile: 'Abrir no app da MetaMask',
  connectWalletConnect: 'Conectar pelo WalletConnect',
  noMetaMask: 'Não encontramos a extensão da MetaMask neste navegador.',
  installMetaMask: 'Instalar a MetaMask',
  connecting: 'Confirme na MetaMask…',
  connectedAs: 'Conectado',
  connectedAt: 'desde',
  disconnect: 'Desconectar',
  disconnected: 'Carteira desconectada.',
  refresh: 'Atualizar',
  balance: 'Saldo',
  txCount: 'Transações enviadas',
  block: 'Bloco atual',
  recentTx: 'Transações recentes',
  recentTxNeedsKey: 'Lista de transações recentes: precisa da chave do explorador na configuração do servidor.',
  noTx: 'Nenhuma transação.',
  migrationPending: 'Configuração pendente: a tabela de conexões ainda não foi criada. A assinatura funciona, mas nada fica salvo.',
  disabled: 'O conector MetaMask ainda não está liberado para a sua conta.',
  errors: ERR_PT,
  templateTitle: 'Starter Web3 (wagmi + viem)',
  templateIntro: 'Base pronta para apps com carteira: conectar a MetaMask, ler saldo, assinar mensagem e chamar contrato. Copie para o seu projeto ou peça ao VERTAL Code AI “crie um dApp com MetaMask”.',
  templateCopyAll: 'Copiar tudo',
  templateDownload: 'Baixar arquivos',
  templateHint: 'Quando o seu pedido falar de carteira/dApp, o VERTAL Code AI usa este template.',
  copy: 'Copiar',
  copied: 'Copiado',
  traderTitle: 'Trader por prompt',
  traderDisclaimer: 'Isto não é recomendação de investimento. Ferramenta experimental, só na testnet Sepolia (moedas sem valor). Você decide e assina cada operação.',
  traderIntro: 'Escreva a ordem. O Vertal monta a cotação no DEX (Uniswap na Sepolia) e a MetaMask pede a sua assinatura para cada transação. Nada é executado sozinho.',
  traderPlaceholder: 'ex.: compre 0.01 ETH de UNI quando cair 5%',
  traderExamples: ['compre 0.01 ETH de UNI', 'compre 0.005 ETH de LINK quando cair 5%', 'venda 10 UNI quando subir 3%'],
  traderBuild: 'Montar ordem',
  traderNeedsConnection: 'Conecte a MetaMask na aba Conexão primeiro.',
  traderDisabled: 'O Trader ainda não está liberado para a sua conta.',
  quote: 'Cotação',
  pay: 'Você paga',
  receive: 'Você recebe (estimado)',
  price: 'Preço',
  triggerNow: 'Executar agora (com a sua assinatura)',
  triggerDrop: (pct, target) => `Gatilho: quando cair ${pct}% (preço ≤ ${target} ETH)`,
  triggerRise: (pct, target) => `Gatilho: quando subir ${pct}% (preço ≥ ${target} ETH)`,
  triggerWaiting: 'Ainda não chegou no preço.',
  triggerMet: 'Preço atingido: assine para enviar.',
  watch: 'Acompanhar enquanto esta página estiver aberta',
  stopWatch: 'Parar de acompanhar',
  watchingNote: 'Checando a cada minuto. Quando o preço chegar, o botão de assinar aparece — nada é enviado sem você.',
  sign: (i, n, what) => `Assinar na MetaMask (${i}/${n}): ${what}`,
  txApprove: 'permitir o token',
  txSwap: 'troca',
  txSent: 'Transação enviada',
  viewTx: 'Ver no explorador',
  signedByYou: 'Assinada por você na MetaMask. Sem custódia.',
  futureNote: 'Próximo passo (não ativo): permissões limitadas e revogáveis na própria MetaMask (teto de valor, tokens e prazo).',
}

const en: MmTexts = {
  back: 'Back to connectors',
  via: 'Vertal Dev · Connectors',
  title: 'MetaMask',
  intro: 'Connect your wallet by signing a message (Sign-In with Ethereum). It only proves the wallet is yours: it spends nothing and authorizes no transactions.',
  security: [
    'Vertal never asks for your seed phrase (12/24 words) or private key. If anyone asks, it is a scam.',
    'We store only the public address, the network and the connection date.',
    'Every transaction is shown and signed by you in MetaMask. Vertal signs nothing and holds no funds.',
  ],
  tabConnect: 'Connection',
  tabTrader: 'Trader (testnet)',
  tabTemplate: 'Web3 Starter',
  network: 'Network',
  testnetTag: 'testnet',
  connectExtension: 'Connect with MetaMask',
  connectMobile: 'Open in the MetaMask app',
  connectWalletConnect: 'Connect with WalletConnect',
  noMetaMask: 'We could not find the MetaMask extension in this browser.',
  installMetaMask: 'Install MetaMask',
  connecting: 'Confirm in MetaMask…',
  connectedAs: 'Connected',
  connectedAt: 'since',
  disconnect: 'Disconnect',
  disconnected: 'Wallet disconnected.',
  refresh: 'Refresh',
  balance: 'Balance',
  txCount: 'Transactions sent',
  block: 'Current block',
  recentTx: 'Recent transactions',
  recentTxNeedsKey: 'Recent transaction list: needs the explorer key in the server configuration.',
  noTx: 'No transactions.',
  migrationPending: 'Pending setup: the connections table is not created yet. Signing works, but nothing is saved.',
  disabled: 'The MetaMask connector is not enabled for your account yet.',
  errors: ERR_EN,
  templateTitle: 'Web3 Starter (wagmi + viem)',
  templateIntro: 'Ready base for wallet apps: connect MetaMask, read balance, sign a message and call a contract. Copy it into your project or ask VERTAL Code AI “create a dApp with MetaMask”.',
  templateCopyAll: 'Copy all',
  templateDownload: 'Download files',
  templateHint: 'When your request mentions a wallet/dApp, VERTAL Code AI uses this template.',
  copy: 'Copy',
  copied: 'Copied',
  traderTitle: 'Trader by prompt',
  traderDisclaimer: 'This is not investment advice. Experimental tool, Sepolia testnet only (coins with no value). You decide and sign every operation.',
  traderIntro: 'Write the order. Vertal builds the DEX quote (Uniswap on Sepolia) and MetaMask asks for your signature on each transaction. Nothing runs on its own.',
  traderPlaceholder: 'e.g. buy 0.01 ETH of UNI when it drops 5%',
  traderExamples: ['buy 0.01 ETH of UNI', 'buy 0.005 ETH of LINK when it drops 5%', 'sell 10 UNI when it rises 3%'],
  traderBuild: 'Build order',
  traderNeedsConnection: 'Connect MetaMask in the Connection tab first.',
  traderDisabled: 'The Trader is not enabled for your account yet.',
  quote: 'Quote',
  pay: 'You pay',
  receive: 'You receive (estimated)',
  price: 'Price',
  triggerNow: 'Execute now (with your signature)',
  triggerDrop: (pct, target) => `Trigger: when it drops ${pct}% (price ≤ ${target} ETH)`,
  triggerRise: (pct, target) => `Trigger: when it rises ${pct}% (price ≥ ${target} ETH)`,
  triggerWaiting: 'Price not reached yet.',
  triggerMet: 'Price reached: sign to send.',
  watch: 'Watch while this page is open',
  stopWatch: 'Stop watching',
  watchingNote: 'Checking every minute. When the price is reached, the sign button shows up — nothing is sent without you.',
  sign: (i, n, what) => `Sign in MetaMask (${i}/${n}): ${what}`,
  txApprove: 'allow the token',
  txSwap: 'swap',
  txSent: 'Transaction sent',
  viewTx: 'View on explorer',
  signedByYou: 'Signed by you in MetaMask. No custody.',
  futureNote: 'Next step (not active): limited, revocable permissions inside MetaMask (amount cap, tokens and expiry).',
}

const es: MmTexts = {
  back: 'Volver a los conectores',
  via: 'Vertal Dev · Conectores',
  title: 'MetaMask',
  intro: 'Conecta tu billetera firmando un mensaje (Sign-In with Ethereum). Solo prueba que la billetera es tuya: no gasta nada ni autoriza transacciones.',
  security: [
    'Vertal nunca pide tu frase semilla (12/24 palabras) ni tu clave privada. Si alguien la pide, es una estafa.',
    'Guardamos solo la dirección pública, la red y la fecha de conexión.',
    'Cada transacción la ves y la firmas tú en MetaMask. Vertal no firma nada ni guarda fondos.',
  ],
  tabConnect: 'Conexión',
  tabTrader: 'Trader (testnet)',
  tabTemplate: 'Starter Web3',
  network: 'Red',
  testnetTag: 'testnet',
  connectExtension: 'Conectar con MetaMask',
  connectMobile: 'Abrir en la app de MetaMask',
  connectWalletConnect: 'Conectar con WalletConnect',
  noMetaMask: 'No encontramos la extensión de MetaMask en este navegador.',
  installMetaMask: 'Instalar MetaMask',
  connecting: 'Confirma en MetaMask…',
  connectedAs: 'Conectado',
  connectedAt: 'desde',
  disconnect: 'Desconectar',
  disconnected: 'Billetera desconectada.',
  refresh: 'Actualizar',
  balance: 'Saldo',
  txCount: 'Transacciones enviadas',
  block: 'Bloque actual',
  recentTx: 'Transacciones recientes',
  recentTxNeedsKey: 'Lista de transacciones recientes: necesita la clave del explorador en la configuración del servidor.',
  noTx: 'Ninguna transacción.',
  migrationPending: 'Configuración pendiente: la tabla de conexiones aún no existe. La firma funciona, pero no se guarda nada.',
  disabled: 'El conector MetaMask aún no está habilitado para tu cuenta.',
  errors: ERR_ES,
  templateTitle: 'Starter Web3 (wagmi + viem)',
  templateIntro: 'Base lista para apps con billetera: conectar MetaMask, leer saldo, firmar mensaje y llamar un contrato. Cópiala a tu proyecto o pide a VERTAL Code AI “crea un dApp con MetaMask”.',
  templateCopyAll: 'Copiar todo',
  templateDownload: 'Descargar archivos',
  templateHint: 'Cuando tu pedido hable de billetera/dApp, VERTAL Code AI usa esta plantilla.',
  copy: 'Copiar',
  copied: 'Copiado',
  traderTitle: 'Trader por prompt',
  traderDisclaimer: 'Esto no es una recomendación de inversión. Herramienta experimental, solo en la testnet Sepolia (monedas sin valor). Tú decides y firmas cada operación.',
  traderIntro: 'Escribe la orden. Vertal arma la cotización en el DEX (Uniswap en Sepolia) y MetaMask te pide la firma de cada transacción. Nada se ejecuta solo.',
  traderPlaceholder: 'ej.: compra 0.01 ETH de UNI cuando baje 5%',
  traderExamples: ['compra 0.01 ETH de UNI', 'compra 0.005 ETH de LINK cuando baje 5%', 'vende 10 UNI cuando suba 3%'],
  traderBuild: 'Armar orden',
  traderNeedsConnection: 'Conecta MetaMask en la pestaña Conexión primero.',
  traderDisabled: 'El Trader aún no está habilitado para tu cuenta.',
  quote: 'Cotización',
  pay: 'Pagas',
  receive: 'Recibes (estimado)',
  price: 'Precio',
  triggerNow: 'Ejecutar ahora (con tu firma)',
  triggerDrop: (pct, target) => `Disparador: cuando baje ${pct}% (precio ≤ ${target} ETH)`,
  triggerRise: (pct, target) => `Disparador: cuando suba ${pct}% (precio ≥ ${target} ETH)`,
  triggerWaiting: 'Aún no llegó al precio.',
  triggerMet: 'Precio alcanzado: firma para enviar.',
  watch: 'Seguir mientras esta página esté abierta',
  stopWatch: 'Dejar de seguir',
  watchingNote: 'Revisando cada minuto. Cuando llegue al precio aparece el botón de firmar — nada se envía sin ti.',
  sign: (i, n, what) => `Firmar en MetaMask (${i}/${n}): ${what}`,
  txApprove: 'permitir el token',
  txSwap: 'intercambio',
  txSent: 'Transacción enviada',
  viewTx: 'Ver en el explorador',
  signedByYou: 'Firmada por ti en MetaMask. Sin custodia.',
  futureNote: 'Próximo paso (no activo): permisos limitados y revocables dentro de MetaMask (tope de monto, tokens y vencimiento).',
}

export const MM_UI: Record<MmLang, MmTexts> = { pt, en, es }

export function mmError(t: MmTexts, code: string): string {
  return t.errors[code] ?? t.errors.network_error
}

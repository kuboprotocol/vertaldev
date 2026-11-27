// Vertal · Starter Web3 (wagmi + viem + MetaMask) para quem cria apps no Vertal Dev / VERTAL Code AI.
// Lógica pura: só textos. NÃO altera nenhum template, prompt de sistema ou padrão existente — é um template novo,
// e a dica para o VERTAL Code AI só é anexada ao pedido do usuário quando o pedido fala de carteira/dApp
// e o flag VERTAL_METAMASK_CODE_HINT está ligado para ele (padrão desligado).

export interface TemplateFile {
  path: string;
  content: string;
}

export const WEB3_TEMPLATE_ID = "vertal-web3-starter";

/** Pedido fala de carteira / dApp / contrato? (pt-BR, en, es) */
export function isWeb3Prompt(prompt: string): boolean {
  const s = String(prompt ?? "").toLowerCase();
  return /\b(metamask|carteira|wallet|billetera|cartera|dapp|d-app|web3|wagmi|viem|ethers|smart contract|contrato inteligente|solidity|erc-?20|erc-?721|nft|onchain|on-chain|sign[- ]in with ethereum|siwe)\b/.test(s);
}

const PKG = `{
  "name": "vertal-web3-starter",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "tsc -b && vite build", "preview": "vite preview" },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "viem": "^2.21.0",
    "wagmi": "^2.12.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
`;

const WAGMI = `import { http, createConfig } from 'wagmi'
import { sepolia, mainnet } from 'wagmi/chains'
import { injected, metaMask } from 'wagmi/connectors'

// Testnet primeiro. Mainnet só quando o app estiver pronto e auditado.
export const config = createConfig({
  chains: [sepolia, mainnet],
  connectors: [
    injected({ target: 'metaMask' }), // extensão (EIP-6963 / EIP-1193)
    metaMask(), // MetaMask SDK: celular abre o app da MetaMask
  ],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL),
    [mainnet.id]: http(import.meta.env.VITE_MAINNET_RPC_URL),
  },
})

declare module 'wagmi' {
  interface Register { config: typeof config }
}
`;

const MAIN = `import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from './wagmi'
import App from './App'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
`;

const APP = `import { useState } from 'react'
import { formatEther, parseAbi } from 'viem'
import {
  useAccount, useBalance, useChainId, useConnect, useDisconnect, useReadContract,
  useSignMessage, useSwitchChain, useWriteContract,
} from 'wagmi'
import { sepolia } from 'wagmi/chains'

// Exemplo de contrato: troque pelo seu. ABI mínima de um ERC-20.
const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])
const TOKEN = import.meta.env.VITE_TOKEN_ADDRESS as \`0x\${string}\` | undefined

export default function App() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connectors, connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { data: balance } = useBalance({ address })
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync } = useWriteContract()
  const { data: tokenBalance } = useReadContract({
    abi: ERC20_ABI, address: TOKEN, functionName: 'balanceOf', args: address ? [address] : undefined,
    query: { enabled: !!TOKEN && !!address },
  })
  const [signature, setSignature] = useState('')

  if (!isConnected) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Meu dApp</h1>
        {connectors.map((c) => (
          <button key={c.uid} disabled={isPending} onClick={() => connect({ connector: c })}>
            Conectar {c.name}
          </button>
        ))}
        <p>Nunca peça a frase-semente ou a chave privada do usuário.</p>
      </main>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <p>Conta: {address}</p>
      <p>Rede: {chainId} {chainId !== sepolia.id && <button onClick={() => switchChain({ chainId: sepolia.id })}>Usar Sepolia</button>}</p>
      <p>Saldo: {balance ? formatEther(balance.value) : '…'} {balance?.symbol}</p>
      {TOKEN && <p>Token: {tokenBalance?.toString() ?? '…'}</p>}
      <button onClick={async () => setSignature(await signMessageAsync({ message: 'Olá do meu dApp' }))}>Assinar mensagem</button>
      {signature && <pre style={{ whiteSpace: 'pre-wrap' }}>{signature}</pre>}
      {TOKEN && (
        <button onClick={() => writeContractAsync({ abi: ERC20_ABI, address: TOKEN, functionName: 'transfer', args: [address!, 0n] })}>
          Chamar contrato (transfer 0)
        </button>
      )}
      <button onClick={() => disconnect()}>Desconectar</button>
    </main>
  )
}
`;

const ENV = `# Copie para .env.local. RPC público serve para testar; em produção use o seu.
VITE_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com
# Opcional: endereço de um ERC-20 na Sepolia para ler saldo e chamar transfer
VITE_TOKEN_ADDRESS=
`;

const README = `# Vertal Web3 Starter

React + Vite + TypeScript com wagmi + viem ligados à MetaMask.

- Conectar (extensão via EIP-6963/EIP-1193; celular via MetaMask SDK)
- Ler saldo (useBalance) e ler contrato (useReadContract)
- Assinar mensagem (useSignMessage)
- Chamar contrato (useWriteContract) — o usuário assina na MetaMask

Regras: comece na Sepolia; nunca peça frase-semente nem chave privada; toda transação é assinada pelo usuário.

    npm install
    cp .env.example .env.local
    npm run dev
`;

export const WEB3_TEMPLATE_FILES: TemplateFile[] = [
  { path: "package.json", content: PKG },
  { path: "src/wagmi.ts", content: WAGMI },
  { path: "src/main.tsx", content: MAIN },
  { path: "src/App.tsx", content: APP },
  { path: ".env.example", content: ENV },
  { path: "README.md", content: README },
];

/**
 * Dica ANEXADA ao pedido do usuário (nunca ao prompt de sistema). Curta, para caber no limite de 12 000
 * caracteres do pedido: o pedido original vem primeiro e nunca é cortado por causa da dica.
 */
export function web3PromptHint(): string {
  return [
    "",
    "---",
    `[Template Vertal: ${WEB3_TEMPLATE_ID}] Para carteira/dApp, use wagmi v2 + viem v2 com a MetaMask:`,
    "- dependências: wagmi, viem, @tanstack/react-query; WagmiProvider + QueryClientProvider no main.tsx;",
    "- src/wagmi.ts: createConfig com chains [sepolia, mainnet], connectors [injected({ target: 'metaMask' }), metaMask()], transports http(VITE_*_RPC_URL);",
    "- hooks: useConnect/useAccount/useDisconnect, useBalance, useSignMessage, useReadContract, useWriteContract, useSwitchChain;",
    "- Sepolia por padrão; RPC e endereços em variáveis VITE_*; nunca peça frase-semente nem chave privada; toda transação é assinada pelo usuário na MetaMask.",
  ].join("\n");
}

export function withWeb3Hint(prompt: string, maxChars = 12_000): string {
  if (!isWeb3Prompt(prompt)) return prompt;
  const hint = web3PromptHint();
  if (prompt.length + hint.length > maxChars) return prompt; // pedido do usuário tem prioridade
  return prompt + hint;
}

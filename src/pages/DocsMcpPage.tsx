import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Copy, Check, Code2, Key, Shield, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import AnimatedLogo from '@/components/branding/AnimatedLogo'
import { motion } from 'framer-motion'

export default function DocsMcpPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const handleCopy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(id)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch {
      // ignore
    }
  }

  const codeBlocks = {
    curl: `curl -X POST https://vertal.app/functions/v1/mcp \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "your_method",
    "params": {},
    "id": 1
  }'`,
    javascript: `const response = await fetch('https://vertal.app/functions/v1/mcp', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'your_method',
    params: {},
    id: 1
  })
});

const data = await response.json();
console.log(data);`,
    python: `import requests
import json

headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
}

payload = {
    'jsonrpc': '2.0',
    'method': 'your_method',
    'params': {},
    'id': 1
}

response = requests.post(
    'https://vertal.app/functions/v1/mcp',
    headers=headers,
    json=payload
)

data = response.json()
print(data)`,
  }

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      {/* Header */}
      <header className="glass glass-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="hover:bg-accent">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <AnimatedLogo size={15} />
            <h1 className="text-xl font-bold text-foreground font-display">MCP API Documentation</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-8"
        >
          {/* Intro */}
          <div className="space-y-4">
            <h2 className="text-3xl font-bold text-foreground font-display">Getting Started with MCP</h2>
            <p className="text-lg text-muted-foreground max-w-2xl">
              O Model Context Protocol (MCP) é um protocolo aberto para comunicação entre aplicações e modelos de IA.
              Use o MCP do Vertal para integrar inteligência artificial em seus projetos.
            </p>
          </div>

          {/* Quick Start */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="glass glass-border border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Quick Start
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">1. Obtenha uma API Key</h4>
                  <p className="text-sm text-muted-foreground">
                    Vá para suas{' '}
                    <Button variant="link" className="p-0 h-auto" asChild>
                      <Link to="/affiliate-program">configurações de API</Link>
                    </Button>
                    {' '}e gere uma chave.
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">2. Faça sua primeira requisição</h4>
                  <div className="rounded-lg bg-muted p-4">
                    <code className="text-xs font-mono text-muted-foreground">{codeBlocks.curl}</code>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">3. Leia a documentação completa</h4>
                  <p className="text-sm text-muted-foreground">
                    Consulte as seções abaixo para referência de API, SDKs e melhores práticas.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Tabs com conteúdo */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <Tabs defaultValue="authentication" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="authentication">Auth</TabsTrigger>
                <TabsTrigger value="api-reference">API</TabsTrigger>
                <TabsTrigger value="sdks">SDKs</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
              </TabsList>

              {/* Authentication */}
              <TabsContent value="authentication" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="h-5 w-5" />
                      Autenticação
                    </CardTitle>
                    <CardDescription>
                      Como autenticar suas requisições ao MCP
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Bearer Token</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Use sua API Key no header Authorization:
                      </p>
                      <div className="bg-muted p-3 rounded text-xs font-mono">
                        Authorization: Bearer sk_live_xxxxxxxxxxxxx
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-foreground mb-2">Headers Obrigatórios</h4>
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-b">
                            <td className="py-2 font-mono text-xs">Authorization</td>
                            <td className="py-2 text-muted-foreground">Bearer YOUR_API_KEY</td>
                          </tr>
                          <tr className="border-b">
                            <td className="py-2 font-mono text-xs">Content-Type</td>
                            <td className="py-2 text-muted-foreground">application/json</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <Alert>
                      <Shield className="h-4 w-4" />
                      <AlertDescription>
                        Nunca compartilhe sua API Key em repositórios públicos. Use variáveis de ambiente.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* API Reference */}
              <TabsContent value="api-reference" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Endpoint Principal</CardTitle>
                    <CardDescription>
                      POST https://vertal.app/functions/v1/mcp
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Formato JSON-RPC 2.0</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Todas as requisições seguem o padrão JSON-RPC 2.0:
                      </p>
                      <div className="bg-muted p-3 rounded text-xs font-mono">
{`{
  "jsonrpc": "2.0",
  "method": "nome_do_metodo",
  "params": {
    "param1": "value1",
    "param2": "value2"
  },
  "id": 1
}`}
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-foreground mb-2">Resposta</h4>
                      <div className="bg-muted p-3 rounded text-xs font-mono">
{`{
  "jsonrpc": "2.0",
  "result": {
    "data": "..."
  },
  "id": 1
}`}
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-foreground mb-2">Erros Comuns</h4>
                      <div className="space-y-2 text-sm">
                        <div className="bg-destructive/10 p-2 rounded">
                          <p className="font-mono text-xs mb-1">-32001: Token inválido ou expirado</p>
                          <p className="text-muted-foreground">Verifique sua API Key</p>
                        </div>
                        <div className="bg-destructive/10 p-2 rounded">
                          <p className="font-mono text-xs mb-1">-32600: Invalid Request</p>
                          <p className="text-muted-foreground">JSON malformado ou parâmetros incorretos</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* SDKs */}
              <TabsContent value="sdks" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Code2 className="h-5 w-5" />
                      Exemplos de Código
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="curl" className="space-y-4">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="curl">cURL</TabsTrigger>
                        <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                        <TabsTrigger value="python">Python</TabsTrigger>
                      </TabsList>

                      {Object.entries(codeBlocks).map(([lang, code]) => (
                        <TabsContent key={lang} value={lang} className="space-y-2">
                          <div className="relative bg-muted p-4 rounded-lg overflow-x-auto">
                            <code className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
                              {code}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-2 right-2"
                              onClick={() => handleCopy(code, lang)}
                            >
                              {copiedCode === lang ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Bibliotecas Oficiais</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="font-semibold text-foreground">JavaScript / TypeScript</p>
                      <code className="text-xs bg-muted p-2 rounded block mt-1">
                        npm install @vertal/mcp-client
                      </code>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Python</p>
                      <code className="text-xs bg-muted p-2 rounded block mt-1">
                        pip install vertal-mcp-client
                      </code>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Security */}
              <TabsContent value="security" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Segurança e Boas Práticas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">✓ Guarde sua API Key</h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Use variáveis de ambiente (.env)</li>
                        <li>Nunca commite em repositórios públicos</li>
                        <li>Use secrets managers (1Password, LastPass, etc)</li>
                      </ul>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-foreground mb-2">✓ Rotação de Chaves</h4>
                      <p className="text-sm text-muted-foreground">
                        Revogue chaves antigas regularmente no painel de controle.
                        Gere uma nova chave, atualize sua aplicação, depois revogue a antiga.
                      </p>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-foreground mb-2">✓ Rate Limiting</h4>
                      <p className="text-sm text-muted-foreground">
                        Máximo 1000 requisições por minuto por API Key. Implemente retry com backoff exponencial.
                      </p>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-foreground mb-2">✓ HTTPS Obrigatório</h4>
                      <p className="text-sm text-muted-foreground">
                        Todas as requisições devem ser feitas sobre HTTPS. Conexões HTTP são rejeitadas.
                      </p>
                    </div>

                    <Alert>
                      <AlertDescription>
                        Se sua chave foi comprometida, revogue imediatamente no painel e gere uma nova.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="border-t pt-8 text-center"
          >
            <p className="text-muted-foreground text-sm">
              Dúvidas? Leia nossa{' '}
              <Button variant="link" className="p-0 h-auto">
                <a href="https://github.com/kuboprotocol/kubovibe/issues" target="_blank" rel="noopener noreferrer">
                  documentação no GitHub →
                </a>
              </Button>
            </p>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}

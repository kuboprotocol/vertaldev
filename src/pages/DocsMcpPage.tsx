import { APP_NAME } from '@/config/brand'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, Code2, Key, Shield, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import SitePage from '@/components/site/SitePage'
import { PageHeader, focusRing, surface } from '@/components/site/siteUi'
import { cn } from '@/lib/utils'
import { VERTAL_DEV_MCP_URL } from '@/lib/ecosystem'

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
    curl: `curl -X POST ${VERTAL_DEV_MCP_URL} \\
  -H "Authorization: Bearer $VERTAL_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 1
  }'`,
    javascript: `// Session token of the signed-in user (supabase-js)
const { data: { session } } = await supabase.auth.getSession();

const response = await fetch('${VERTAL_DEV_MCP_URL}', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${session.access_token}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 1
  })
});

const data = await response.json();
console.log(data);`,
    python: `import os
import requests

# Access token of your Vertal Dev session (it expires; sign in again to renew it)
headers = {
    'Authorization': f"Bearer {os.environ['VERTAL_ACCESS_TOKEN']}",
    'Content-Type': 'application/json'
}

payload = {
    'jsonrpc': '2.0',
    'method': 'tools/list',
    'params': {},
    'id': 1
}

response = requests.post(
    '${VERTAL_DEV_MCP_URL}',
    headers=headers,
    json=payload
)

data = response.json()
print(data)`,
  }

  const card = cn(surface.card, 'bg-card/50')
  const codeBox = 'rounded-lg bg-black/40 p-3 font-mono text-xs break-all text-foreground/85'

  return (
    <SitePage>
      <PageHeader
        eyebrow="Docs"
        title="MCP API"
        actions={
          <Button asChild className="rounded-full">
            <Link to="/mcp">
              <Key className="mr-2 h-4 w-4" aria-hidden />
              Connect my MCP client
            </Link>
          </Button>
        }
      >
        The Model Context Protocol (MCP) is an open protocol that connects apps and AI models. Use the {APP_NAME} MCP
        server to give your AI client access to your projects.
      </PageHeader>

      <div className="mx-auto max-w-4xl space-y-10 px-6 pb-24">
        {/* Quick start */}
        <Card className={cn(card, 'border-primary/30')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <Zap className="h-5 w-5 text-primary" aria-hidden />
              Quick start
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-[15px]">
            <div className="space-y-2">
              <h2 className="font-semibold text-foreground">1. Add the server to your MCP client</h2>
              <p className="text-muted-foreground">
                In Claude, ChatGPT, Cursor or another compatible client, add the server URL. In Claude Code:
              </p>
              <div className={codeBox}>
                <code>claude mcp add --transport http vertal-dev {VERTAL_DEV_MCP_URL}</code>
              </div>
              <p className="text-muted-foreground">
                The client opens the {APP_NAME} login for you (OAuth). You do not need to create a key.
              </p>
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold text-foreground">2. Or call it over HTTP with your session token</h2>
              <div className={codeBox}>
                <code>{codeBlocks.curl}</code>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold text-foreground">3. Read the reference</h2>
              <p className="text-muted-foreground">The tabs below cover sign-in, the API format, code examples and security.</p>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="authentication" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 rounded-full">
            <TabsTrigger value="authentication" className="rounded-full">Sign-in</TabsTrigger>
            <TabsTrigger value="api-reference" className="rounded-full">API</TabsTrigger>
            <TabsTrigger value="sdks" className="rounded-full">Examples</TabsTrigger>
            <TabsTrigger value="security" className="rounded-full">Security</TabsTrigger>
          </TabsList>

          {/* Authentication */}
          <TabsContent value="authentication" className="space-y-4">
            <Card className={card}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" aria-hidden />
                  Sign-in
                </CardTitle>
                <CardDescription>How to authenticate your MCP requests</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-[15px]">
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">OAuth 2.1 (MCP clients)</h3>
                  <p className="mb-3 text-muted-foreground">
                    The server follows the MCP authorization spec. Without a token it answers <code>401</code> with a{' '}
                    <code>WWW-Authenticate</code> header that points to the metadata below. The client finds the
                    authorization server (the {APP_NAME} login), opens the login screen and then sends the token by itself.
                  </p>
                  <div className={codeBox}>GET {VERTAL_DEV_MCP_URL}/.well-known/oauth-protected-resource</div>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <h3 className="mb-2 font-semibold text-foreground">Bearer token (direct HTTP calls)</h3>
                  <p className="mb-3 text-muted-foreground">
                    Send the <strong>access token of your session</strong> (the same JWT as your login, from{' '}
                    <code>supabase.auth.getSession()</code>). It expires after a short time, so renew it from the session.
                  </p>
                  <div className={codeBox}>Authorization: Bearer eyJhbGciOi...</div>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <h3 className="mb-2 font-semibold text-foreground">Required headers</h3>
                  <table className="w-full text-[15px]">
                    <tbody>
                      <tr className="border-b border-white/[0.06]">
                        <th scope="row" className="py-2 text-left font-mono text-xs font-normal">Authorization</th>
                        <td className="py-2 text-muted-foreground">Bearer &lt;session access token&gt;</td>
                      </tr>
                      <tr className="border-b border-white/[0.06]">
                        <th scope="row" className="py-2 text-left font-mono text-xs font-normal">Content-Type</th>
                        <td className="py-2 text-muted-foreground">application/json</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Every tool runs as the signed-in user, with the same permissions (RLS) that user has in the app. There
                    are no API keys for MCP. Access always goes through the login.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Reference */}
          <TabsContent value="api-reference" className="space-y-4">
            <Card className={card}>
              <CardHeader>
                <CardTitle>Main endpoint</CardTitle>
                <CardDescription className="break-all">POST {VERTAL_DEV_MCP_URL}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-[15px]">
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">JSON-RPC 2.0 format</h3>
                  <p className="mb-3 text-muted-foreground">Every request uses the JSON-RPC 2.0 format:</p>
                  <pre className={cn(codeBox, 'whitespace-pre')}>
{`{
  "jsonrpc": "2.0",
  "method": "method_name",
  "params": {
    "param1": "value1",
    "param2": "value2"
  },
  "id": 1
}`}
                  </pre>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <h3 className="mb-2 font-semibold text-foreground">Response</h3>
                  <pre className={cn(codeBox, 'whitespace-pre')}>
{`{
  "jsonrpc": "2.0",
  "result": {
    "data": "..."
  },
  "id": 1
}`}
                  </pre>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <h3 className="mb-2 font-semibold text-foreground">Common errors</h3>
                  <div className="space-y-2">
                    <div className="rounded-lg bg-destructive/10 p-3">
                      <p className="mb-1 font-mono text-xs">401 · -32001: Login required / Token invalid or expired</p>
                      <p className="text-muted-foreground">Log in again or renew the session access token.</p>
                    </div>
                    <div className="rounded-lg bg-destructive/10 p-3">
                      <p className="mb-1 font-mono text-xs">-32600: Invalid Request</p>
                      <p className="text-muted-foreground">The JSON is malformed or the parameters are wrong.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Examples */}
          <TabsContent value="sdks" className="space-y-4">
            <Card className={card}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5" aria-hidden />
                  Code examples
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="curl" className="space-y-4">
                  <TabsList className="grid w-full grid-cols-3 rounded-full">
                    <TabsTrigger value="curl" className="rounded-full">cURL</TabsTrigger>
                    <TabsTrigger value="javascript" className="rounded-full">JavaScript</TabsTrigger>
                    <TabsTrigger value="python" className="rounded-full">Python</TabsTrigger>
                  </TabsList>

                  {Object.entries(codeBlocks).map(([lang, code]) => (
                    <TabsContent key={lang} value={lang} className="space-y-2">
                      <div className="relative overflow-x-auto rounded-lg bg-black/40 p-4">
                        <code className="whitespace-pre-wrap break-words font-mono text-xs text-foreground/85">{code}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn('absolute right-2 top-2', focusRing)}
                          aria-label="Copy code"
                          onClick={() => handleCopy(code, lang)}
                        >
                          {copiedCode === lang ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="space-y-4">
            <Card className={card}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" aria-hidden />
                  Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-[15px]">
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">Keep your access token safe</h3>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    <li>It gives access to your account. Never paste it in repositories, screenshots or chats.</li>
                    <li>In scripts, read it from an environment variable (for example <code>VERTAL_ACCESS_TOKEN</code>).</li>
                    <li>Use an MCP client with OAuth when you can. It stores and renews the token for you.</li>
                  </ul>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <h3 className="mb-2 font-semibold text-foreground">Tokens expire</h3>
                  <p className="text-muted-foreground">
                    The access token is valid for a short time. MCP clients renew it with OAuth. For direct HTTP calls, get
                    a new token from the session when you receive <code>401</code>.
                  </p>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <h3 className="mb-2 font-semibold text-foreground">HTTPS only</h3>
                  <p className="text-muted-foreground">Send every request over HTTPS.</p>
                </div>

                <Alert>
                  <AlertDescription>
                    If your token leaked, sign out to stop renewals and change your password. The leaked token stops
                    working when it expires.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="border-t border-white/[0.06] pt-8 text-center text-[15px] text-muted-foreground">
          Have a question?{' '}
          <a
            href="https://github.com/kuboprotocol/kubovibe/issues"
            target="_blank"
            rel="noopener noreferrer"
            className={cn('rounded-sm text-primary underline-offset-4 hover:underline', focusRing)}
          >
            Open an issue on GitHub
          </a>
        </p>
      </div>
    </SitePage>
  )
}

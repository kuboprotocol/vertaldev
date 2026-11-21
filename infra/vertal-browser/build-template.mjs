// Constrói o template E2B "vertal-browser" no E2B self-hosted (vertalrun.com).
// Precisa de E2B_API_KEY e E2B_API_URL (no host: docker exec e2b-ready-1 cat /run/e2b/sdk.env).
//   node build-template.mjs            (cpu/mem: VERTAL_BROWSER_CPU=1, VERTAL_BROWSER_MEM_MB=1536)
// Roda com a imagem node-e2b do próprio stack (e2b 2.46.1), ver docs/VERTAL_NAVIGATOR.md.
import { Template, waitForPort } from 'e2b'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = process.env.TEMPLATE_DIR || dirname(fileURLToPath(import.meta.url))
const b64 = (f) => readFileSync(join(here, f)).toString('base64')
const dockerfile = readFileSync(join(here, 'e2b.Dockerfile'), 'utf8')
  .replace('__NAVD_B64__', b64('navd.py'))
  .replace('__START_B64__', b64('start.sh'))
  .replace('__POLICY_B64__', b64('chromium-policy.json'))

const name = process.env.TEMPLATE_NAME || 'vertal-browser'
const cpuCount = Number(process.env.VERTAL_BROWSER_CPU || 1)
const memoryMB = Number(process.env.VERTAL_BROWSER_MEM_MB || 1536)
const started = Date.now()
console.log(`== ${name}: build (${cpuCount} vCPU / ${memoryMB} MB)`)
try {
  const tpl = Template()
    .fromDockerfile(dockerfile)
    .setStartCmd('/opt/navigator/start.sh', waitForPort(8787))
  await Template.build(tpl, name, { cpuCount, memoryMB, onBuildLogs: (e) => console.log(`[${name}] ${String(e)}`) })
  console.log(`== ${name}: pronto em ${Math.round((Date.now() - started) / 1000)}s`)
} catch (err) {
  console.error(`== ${name}: FALHOU ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

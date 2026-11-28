// Diagnóstico do player do Spotify (iFrame API) com perfil de Android (Pixel 7).
// Uso: npx playwright install chromium && node scripts/diagnostics/spotify-embed-mobile.mjs [track_id]
// Mostra: iframe carregado, permissões `allow`, Widevine no iframe, eventos playback_update
// depois do toque no play (duração da prévia, posição avançando, estado no fim).
// Obs.: Chromium headless não tem Widevine; a prévia toca mesmo assim (não usa DRM).
import http from 'node:http';
import { chromium, devices } from 'playwright';

const track = process.argv[2] || '21WDwktTTX1IYwsrnN7mk9';
const html = `<!doctype html><meta name=viewport content="width=device-width"><div id=t></div><script>
window.__ev=[];window.onSpotifyIframeApiReady=a=>a.createController(document.getElementById('t'),
{uri:'spotify:track:${track}',width:'100%',height:352},c=>{window.__c=c;
c.addListener('playback_update',e=>__ev.push(e.data))});</script>
<script src="https://open.spotify.com/embed/iframe-api/v1" async></script>`;
const server = http.createServer((_, res) => res.end(html)).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(8000);
const frame = page.frames().find((f) => f.url().includes('open.spotify.com/embed'));
if (!frame) throw new Error('iframe do Spotify não carregou');
console.log('allow =', await page.locator('iframe').getAttribute('allow'));
console.log('widevine =', await frame.evaluate(async () => {
  try { await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }]); return 'ok'; } catch (e) { return 'indisponível: ' + e.message; }
}));
await frame.locator('button[data-testid="play-pause-button"]').first().tap();
await page.waitForTimeout(19000);
const ev = await page.evaluate(() => window.__ev);
console.log('eventos =', ev.length, 'duração(ms) =', ev.at(-1)?.duration, 'posição máx =', Math.max(0, ...ev.map((e) => e.position)));
console.log('últimos =', JSON.stringify(ev.slice(-3)));
await browser.close();
server.close();

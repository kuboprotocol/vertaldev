/**
 * Mostra a versão nova do site assim que ela é publicada.
 *
 * O service worker (vite-plugin-pwa, `registerType: 'autoUpdate'`) já ativa a versão nova sozinho
 * (`skipWaiting` + `clientsClaim`), mas a página aberta continua com o HTML/JS antigos do cache até
 * a próxima visita. Aqui a página recarrega uma vez quando o service worker novo assume o controle,
 * e pede uma verificação de atualização sempre que a aba volta a ficar visível (no celular a aba
 * fica aberta por dias).
 */
export function installServiceWorkerAutoReload(
  nav: Navigator = navigator,
  doc: Document = document,
  reload: () => void = () => window.location.reload(),
): void {
  const sw = nav.serviceWorker
  if (!sw) return

  // Sem controlador = primeira instalação: o primeiro controllerchange é só o service worker
  // assumindo a página, que já é a versão atual. Os seguintes são versões novas.
  let skipNext = !sw.controller
  let reloading = false
  sw.addEventListener('controllerchange', () => {
    if (skipNext) {
      skipNext = false
      return
    }
    if (reloading) return
    reloading = true
    reload()
  })

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState !== 'visible') return
    sw.getRegistration()
      .then((reg) => reg?.update())
      .catch(() => {})
  })
}

// Renderer — painel do Vertal Node (JS puro, sem framework).
//
//   import { mountVertalNodePanel } from "./honeygain/renderer/vertalNodePanel.js";
//   mountVertalNodePanel(document.getElementById("vertal-node"));
//
// Mostra: explicação (Honeygain SDK + exit node), botão "Ativar" (consentimento primeiro),
// interruptor de opt-out sempre visível, status (rodando / parado) e resultado do último heartbeat.

const TEXT = {
  title: "Vertal Node — ganhe compartilhando internet",
  disclosure:
    "O Vertal Node usa o Honeygain SDK. Com a sua permissão, este computador vira um ponto de saída " +
    "(exit node) e compartilha uma parte da sua internet não usada com clientes verificados da Honeygain. " +
    "Você ganha créditos no Vertal Dev por dia ativo e pode desligar quando quiser.",
  activate: "Ativar (abre o consentimento do Honeygain)",
  share: "Compartilhar internet",
  running: "Compartilhando agora",
  stopped: "Parado",
  noConsent: "Sem consentimento — nada está sendo compartilhado.",
  learnMore: "Política de privacidade do Honeygain SDK",
};

export function mountVertalNodePanel(root, { hgSdk = window.hgSdk, vertalNode = window.vertalNode } = {}) {
  root.innerHTML = `
    <section class="vertal-node">
      <h2>${TEXT.title}</h2>
      <p data-role="disclosure">${TEXT.disclosure}
        <a href="https://www.honeygain.com/sdk-privacy-policy/" target="_blank" rel="noopener">${TEXT.learnMore}</a>
      </p>
      <button type="button" data-role="activate">${TEXT.activate}</button>
      <label data-role="toggle-row">
        <input type="checkbox" data-role="toggle" /> ${TEXT.share}
      </label>
      <p data-role="status"></p>
      <p data-role="heartbeat"></p>
    </section>`;

  const $ = (role) => root.querySelector(`[data-role="${role}"]`);
  const state = { optedIn: false, running: false };

  function render() {
    $("activate").hidden = state.optedIn;
    $("toggle").checked = state.optedIn && state.running;
    $("toggle").disabled = !state.optedIn && !state.running;
    $("status").textContent = !state.optedIn ? TEXT.noConsent : state.running ? TEXT.running : TEXT.stopped;
  }

  async function refresh() {
    state.optedIn = Boolean(await hgSdk.isOptedIn());
    state.running = Boolean(await hgSdk.isRunning());
    render();
  }

  $("activate").addEventListener("click", async () => {
    const r = await vertalNode.activate();
    state.optedIn = r.optedIn;
    state.running = r.running;
    render();
  });

  // Opt-out fácil: desligar o interruptor retira o consentimento (optOut também para o SDK).
  $("toggle").addEventListener("change", async (e) => {
    if (e.target.checked) {
      await vertalNode.activate();
    } else {
      await hgSdk.optOut();
    }
    await refresh();
  });

  hgSdk.onIsRunningChange((v) => {
    state.running = Boolean(v);
    render();
  });
  hgSdk.onIsOptedInChange((v) => {
    state.optedIn = Boolean(v);
    render();
  });
  vertalNode.onHeartbeat((r) => {
    if (r && r.credited) $("heartbeat").textContent = `+${r.credits} créditos de hoje recebidos.`;
    else if (r && r.reason === "already_credited_today") $("heartbeat").textContent = "Crédito de hoje já recebido.";
    else if (r && r.status === 401) $("heartbeat").textContent = "Entre na sua conta Vertal para receber créditos.";
  });

  void refresh();
  return { refresh };
}

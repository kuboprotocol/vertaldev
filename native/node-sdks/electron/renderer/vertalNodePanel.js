// Renderer — painel do Vertal Node (JS puro, sem framework).
//
//   import { mountVertalNodePanel } from "./node-sdks/electron/renderer/vertalNodePanel.js";
//   mountVertalNodePanel(document.getElementById("vertal-node"));
//
// Marca Vertal. O nome do fornecedor do SDK aparece só na tela de consentimento do próprio SDK,
// aberta pelo botão "Ativar" (consentimento primeiro). Interruptor de opt-out sempre visível.

const TEXT = {
  title: "Vertal Node — ganhe compartilhando internet",
  disclosure:
    "Com a sua permissão, o Vertal Node compartilha uma parte da sua internet não usada por meio de um " +
    "parceiro de rede (este computador vira um ponto de saída). Antes de ligar, você vê a tela de " +
    "consentimento do parceiro, com os termos e a política de privacidade. Você ganha créditos no " +
    "Vertal Dev por dia ativo e pode desligar quando quiser.",
  activate: "Ativar (abre a tela de consentimento)",
  share: "Compartilhar internet",
  running: "Compartilhando agora",
  stopped: "Parado",
  noConsent: "Sem consentimento — nada está sendo compartilhado.",
  disabled: "Indisponível nesta versão.",
};

export function mountVertalNodePanel(root, { vertalNode = window.vertalNode } = {}) {
  root.innerHTML = `
    <section class="vertal-node">
      <h2>${TEXT.title}</h2>
      <p data-role="disclosure">${TEXT.disclosure}</p>
      <button type="button" data-role="activate">${TEXT.activate}</button>
      <label data-role="toggle-row">
        <input type="checkbox" data-role="toggle" /> ${TEXT.share}
      </label>
      <p data-role="status"></p>
      <p data-role="heartbeat"></p>
    </section>`;

  const $ = (role) => root.querySelector(`[data-role="${role}"]`);
  const state = { enabled: true, optedIn: false, running: false };

  function apply(s) {
    if (!s) return;
    if (typeof s.enabled === "boolean") state.enabled = s.enabled;
    if (typeof s.optedIn === "boolean") state.optedIn = s.optedIn;
    if (typeof s.running === "boolean") state.running = s.running;
    render();
  }

  function render() {
    $("activate").hidden = state.optedIn || !state.enabled;
    $("toggle").checked = state.optedIn && state.running;
    $("toggle").disabled = !state.enabled || (!state.optedIn && !state.running);
    $("status").textContent = !state.enabled
      ? TEXT.disabled
      : !state.optedIn
        ? TEXT.noConsent
        : state.running
          ? TEXT.running
          : TEXT.stopped;
  }

  const refresh = async () => apply(await vertalNode.status());

  $("activate").addEventListener("click", async () => apply(await vertalNode.activate()));

  // Opt-out fácil: desligar o interruptor retira o consentimento (e para o SDK).
  $("toggle").addEventListener("change", async (e) => {
    apply(e.target.checked ? await vertalNode.activate() : await vertalNode.optOut());
  });

  vertalNode.onStateChange(apply);
  vertalNode.onHeartbeat((r) => {
    if (r && r.credited) $("heartbeat").textContent = `+${r.credits} créditos de hoje recebidos.`;
    else if (r && r.reason === "already_credited_today") $("heartbeat").textContent = "Crédito de hoje já recebido.";
    else if (r && r.status === 401) $("heartbeat").textContent = "Entre na sua conta Vertal para receber créditos.";
  });

  void refresh();
  return { refresh };
}

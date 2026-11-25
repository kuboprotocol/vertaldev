#!/usr/bin/env bash
# VERTAL Code AI · instala o servidor próprio (Ollama + proxy com token) numa VM Linux (ARM ou x86).
# Uso:  cd infra/vertal-ollama && cp .env.example .env && nano .env && sudo ./setup.sh
# Modo túnel (VM que já tem Cloudflare Tunnel, ex.: vertal-e2b-vm): VERTAL_OLLAMA_MODE=tunnel no .env.
#   O proxy escuta só em 127.0.0.1:${VERTAL_OLLAMA_LOCAL_PORT:-11435}; o HTTPS fica no Cloudflare
#   (aponte um hostname do túnel para http://localhost:11435). Não abre 80/443.
# Não cria nem contrata nada na nuvem: só roda dentro de uma VM que você já tem.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "Crie o .env a partir do .env.example"; exit 1; }
# shellcheck disable=SC1091
set -a; . ./.env; set +a

if [ -z "${VERTAL_OLLAMA_TOKEN:-}" ]; then
  VERTAL_OLLAMA_TOKEN="$(openssl rand -hex 32)"
  sed -i "s/^VERTAL_OLLAMA_TOKEN=.*/VERTAL_OLLAMA_TOKEN=${VERTAL_OLLAMA_TOKEN}/" .env
  echo "Token novo gravado no .env (guarde-o no cofre; ele não é mostrado aqui)."
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker…"
  curl -fsSL https://get.docker.com | sh
fi

COMPOSE=(docker compose -f docker-compose.yml)
if [ "${VERTAL_OLLAMA_MODE:-}" = "tunnel" ]; then
  COMPOSE+=(-f docker-compose.tunnel.yml)
  export VERTAL_OLLAMA_DOMAIN=":80"
fi

# Oracle Linux/Ubuntu da Oracle vêm com iptables fechado: libera 80/443 (também libere na Security List da VCN).
if [ "${VERTAL_OLLAMA_MODE:-}" != "tunnel" ] && command -v iptables >/dev/null 2>&1; then
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport "$p" -j ACCEPT
  done
  command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save || true
fi

sed -i "s#^FROM .*#FROM ${VERTAL_OLLAMA_BASE_MODEL:-qwen2.5-coder:1.5b}#" Modelfile
"${COMPOSE[@]}" up -d
echo "Baixando ${VERTAL_OLLAMA_BASE_MODEL:-qwen2.5-coder:1.5b} (alguns GB, pode demorar)…"
"${COMPOSE[@]}" exec -T ollama ollama pull "${VERTAL_OLLAMA_BASE_MODEL:-qwen2.5-coder:1.5b}"
"${COMPOSE[@]}" exec -T ollama ollama create vertal-coder -f /vertal/Modelfile

cat <<MSG

Pronto. Configure os segredos da edge function no Supabase (não cole o token em chat):
  supabase secrets set VERTAL_OLLAMA_URL=https://<seu-hostname> VERTAL_OLLAMA_MODEL=vertal-coder
  supabase secrets set VERTAL_OLLAMA_TOKEN=\$(grep ^VERTAL_OLLAMA_TOKEN= .env | cut -d= -f2)
Meça a velocidade real:  ./bench.sh
MSG

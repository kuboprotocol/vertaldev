#!/usr/bin/env bash
# Prepara a VM (Ubuntu 22.04/24.04, ARM64 ou x86_64) e sobe Ollama + Caddy.
# Uso (na VM, como usuário com sudo):  cp .env.example .env && nano .env && ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Crie o .env a partir do .env.example"; exit 1; }
set -a; . ./.env; set +a
[ -n "${VERTAL_OLLAMA_TOKEN:-}" ] || { echo "VERTAL_OLLAMA_TOKEN vazio (openssl rand -hex 32)"; exit 1; }

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi
# Firewall do host (a Security List da VCN também precisa liberar 80/443 TCP).
if command -v iptables >/dev/null; then
  sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
  sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
  command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save || true
fi
sudo docker compose up -d
echo "Baixando o modelo ${VERTAL_OLLAMA_MODEL} (alguns GB)…"
sudo docker compose exec -T ollama ollama pull "${VERTAL_OLLAMA_MODEL}"
echo "Pronto. Teste: ./bench.sh"
echo "No Supabase (Secrets): VERTAL_OLLAMA_URL=https://${VERTAL_OLLAMA_DOMAIN}  VERTAL_OLLAMA_TOKEN=<o token>  VERTAL_OLLAMA_MODEL=${VERTAL_OLLAMA_MODEL}"

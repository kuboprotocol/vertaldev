#!/usr/bin/env bash
# Mede a velocidade real (tokens/s) pela mesma rota que a edge function usa.
# Uso: VERTAL_OLLAMA_URL=https://llm.vertal.dev VERTAL_OLLAMA_TOKEN=... ./bench.sh [modelo]
set -euo pipefail
[ -f .env ] && { set -a; . ./.env; set +a; }
URL="${VERTAL_OLLAMA_URL:-https://${VERTAL_OLLAMA_DOMAIN}}"
MODEL="${1:-${VERTAL_OLLAMA_MODEL:-qwen2.5-coder:7b}}"
start=$(date +%s.%N)
out=$(curl -fsS "$URL/v1/chat/completions" -H "Authorization: Bearer $VERTAL_OLLAMA_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"max_tokens\":256,\"messages\":[{\"role\":\"user\",\"content\":\"Escreva uma função TypeScript que valida CPF, com testes.\"}]}")
end=$(date +%s.%N)
echo "$out" | python3 -c "
import json,sys
d=json.load(sys.stdin); u=d.get('usage',{}); t=float('$end')-float('$start')
c=u.get('completion_tokens',0)
print(f'modelo: $MODEL | tempo total: {t:.1f}s | tokens de saída: {c} | ~{c/t:.1f} tok/s (inclui leitura do prompt)')"

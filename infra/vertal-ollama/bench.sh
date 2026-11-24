#!/usr/bin/env bash
# Mede a velocidade real do modelo nesta máquina (tokens/s de leitura do prompt e de geração).
set -euo pipefail
cd "$(dirname "$0")"
MODEL="${1:-vertal-coder}"
PROMPT='Escreva uma função TypeScript debounce<T extends (...a: any[]) => void>(fn: T, ms: number) com testes Vitest.'
OUT=$(docker compose exec -T ollama sh -c "wget -qO- --post-data='{\"model\":\"$MODEL\",\"prompt\":\"$PROMPT\",\"stream\":false,\"options\":{\"num_predict\":256}}' http://localhost:11434/api/generate")
python3 - "$OUT" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
pe, pd = d.get("prompt_eval_count", 0), d.get("prompt_eval_duration", 1) / 1e9
ec, ed = d.get("eval_count", 0), d.get("eval_duration", 1) / 1e9
print(f"leitura do prompt: {pe} tokens em {pd:.1f}s = {pe/pd:.1f} tok/s")
print(f"geração:          {ec} tokens em {ed:.1f}s = {ec/ed:.1f} tok/s")
print(f"carregar modelo:  {d.get('load_duration', 0)/1e9:.1f}s (só na 1ª chamada depois de ocioso)")
PY

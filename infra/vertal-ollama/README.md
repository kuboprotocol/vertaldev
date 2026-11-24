# VERTAL Code AI — kit do servidor de modelo próprio (Ollama em CPU)

Opcional. Entra na cadeia do VERTAL Code AI **depois** das camadas gratuitas e **antes** do pago,
só quando `VERTAL_OLLAMA_URL` existe nos Secrets do Supabase. Este PR **não cria** nenhuma VM.

Passo a passo, custos e velocidades esperadas: `docs/VERTAL-CODE-AI.md`, seção "Servidor próprio".

Resumo:
1. VM Ubuntu (Oracle Ampere A1 Always Free: 2 OCPU / 12 GB, ou outra), portas 80/443 abertas na VCN.
2. DNS: `llm.vertal.dev` (ou outro) apontando para o IP da VM.
3. `cp .env.example .env`, preencher token e domínio, `./setup.sh`.
4. `./bench.sh` para medir tokens/s reais.
5. Supabase → Secrets: `VERTAL_OLLAMA_URL`, `VERTAL_OLLAMA_TOKEN`, `VERTAL_OLLAMA_MODEL`.

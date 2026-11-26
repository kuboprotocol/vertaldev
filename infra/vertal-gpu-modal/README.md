# VERTAL Code AI · GPU própria (Modal, serverless)

Três apps independentes, **scale-to-zero** (o contêiner desliga 120 s depois do último pedido), no máximo
**1 contêiner** cada, pesos em cache num Volume (`vertal-hf-cache`) para cortar o tempo a frio.

| App | Modelo (licença) | GPU | Endpoint |
|---|---|---|---|
| `vertal-llm` | Qwen2.5-Coder-14B-Instruct-AWQ (Apache-2.0) no vLLM 0.11, nome `vertal-coder-gpu`, contexto 16K | A10G | `https://<workspace>--vertal-llm-serve.us-east.modal.run/v1/chat/completions` (OpenAI-compatível) |
| `vertal-image` | FLUX.1-schnell (Apache-2.0; cópia sem bloqueio `unsloth/FLUX.1-schnell`), 1024 px, 4 passos | L40S | `POST https://<workspace>--vertal-image-flux-web.us-east.modal.run/generate` |
| `vertal-video` | Wan2.1-T2V-1.3B-Diffusers (Apache-2.0), 4 s, 832×480, 16 fps, H.264 | L40S | `https://<workspace>--vertal-video-web.us-east.modal.run` (`/submit`, `/status?id=`, `/result?id=`) |
| `vertal-decide` (Vertal Decide) | Intern-Decision-4B (Apache-2.0; base Qwen3.5-4B, texto + imagens), formato `/v1/systemone` (noul/choice/score com probabilidades calibradas) | L4 (alternativa A10G) | `https://<workspace>--vertal-decide-decide-web.us-east.modal.run` (`/v1/systemone`, `/v1/systemone/video`, `/health`) |
| `vertal-omni` (Vertal Visão / Ouvir) | Qwen2.5-Omni-7B (Apache-2.0) no vLLM 0.11 (só o "thinker": foto, vídeo curto e áudio → texto), nome `vertal-omni` | L40S | `https://<workspace>--vertal-omni-serve.us-east.modal.run/v1/chat/completions` (OpenAI-compatível) |
| `vertal-novela` (Vertal Novela) | Orquestra LLM própria + FLUX + (opcional) Wan + voz Kokoro-82M (Apache-2.0, pt-BR) + ffmpeg; sem GPU própria | CPU | `https://<workspace>--vertal-novela-web.us-east.modal.run` (`/submit`, `/status?id=`, `/result?id=`, `/tts`) |

Os 3 apps novos usam o segredo Modal `vertal-media-auth` (`VERTAL_DECIDE_TOKEN`, `VERTAL_OMNI_TOKEN`,
`VERTAL_NOVELA_TOKEN` e as URLs `VERTAL_LLM_URL`, `VERTAL_IMAGE_URL`, `VERTAL_VIDEO_URL`, `VERTAL_DECIDE_URL`,
`VERTAL_OMNI_URL` que a Novela chama). Testes das funções puras da Novela: `python -m pytest infra/vertal-gpu-modal -q`.

## Segurança

Cada endpoint exige `Authorization: Bearer <token>`; os tokens ficam só no segredo Modal `vertal-gpu-auth`
(`VERTAL_LLM_TOKEN`, `VERTAL_IMAGE_TOKEN`, `VERTAL_VIDEO_TOKEN`) e nos segredos do Supabase. Nunca no repositório.

## Deploy

```bash
pip install modal && modal token new
modal secret create vertal-gpu-auth VERTAL_LLM_TOKEN=... VERTAL_IMAGE_TOKEN=... VERTAL_VIDEO_TOKEN=...
modal run vertal_llm.py::download && modal deploy vertal_llm.py
modal run vertal_image.py::download && modal deploy vertal_image.py
modal run vertal_video.py::download && modal deploy vertal_video.py
modal secret create vertal-media-auth VERTAL_DECIDE_TOKEN=... VERTAL_OMNI_TOKEN=... VERTAL_NOVELA_TOKEN=... VERTAL_LLM_URL=... (etc.)
modal run vertal_decide.py::download && modal deploy vertal_decide.py
modal run vertal_omni.py::download && modal deploy vertal_omni.py
modal deploy vertal_novela.py
```

## Ligar no VERTAL Code AI (segredos do Supabase)

- LLM: `VERTAL_OLLAMA_URL_2` (URL base, sem `/v1`), `VERTAL_OLLAMA_TOKEN_2`, `VERTAL_OLLAMA_MODEL_2=vertal-coder-gpu`,
  `VERTAL_OLLAMA_MAX_INPUT_TOKENS_2`, `VERTAL_OLLAMA_FIRST_TOKEN_MS_2`, `VERTAL_OLLAMA_TOTAL_MS_2`,
  `VERTAL_OLLAMA_MAX_OUTPUT_TOKENS_2`, `VERTAL_OLLAMA_CONTEXT_2`.
- Imagem: `VERTAL_OWN_IMAGE_URL`, `VERTAL_OWN_IMAGE_TOKEN` (opcional `_TIMEOUT_MS`, `_COST`).
- Vídeo: `VERTAL_OWN_VIDEO_URL`, `VERTAL_OWN_VIDEO_TOKEN` (opcional `_COST`).
- Sentidos (desligados sem a URL): `VERTAL_OWN_DECIDE_URL/_TOKEN`, `VERTAL_OWN_OMNI_URL/_TOKEN`,
  `VERTAL_OWN_NOVELA_URL/_TOKEN` (opcionais: `VERTAL_OWN_DECIDE_FALLBACK_MODEL`, `VERTAL_OWN_OMNI_FALLBACK_MODEL`).

Como o projeto está no limite de 100 segredos, as chaves acima podem ir todas num único segredo JSON
`VERTAL_GPU_CONFIG` (ex.: `{"VERTAL_OLLAMA_URL_2":"https://…","VERTAL_OLLAMA_TOKEN_2":"…","VERTAL_OWN_IMAGE_URL":"…"}`);
um segredo avulso com o mesmo nome vence.

Tirar o segredo desliga a opção; a cadeia volta a ser exatamente a de antes.

## Custos (preços Modal por segundo; plano Starter com US$30/mês de crédito)

A10G ≈ US$1,10/h, L40S ≈ US$1,95/h. Cada acordada paga também os 120 s ociosos antes de desligar.
Medido em 26/11/2026: LLM ~48 tok/s; imagem ~2,5 s quente; vídeo ~1 min 50 s por clipe de 4 s.

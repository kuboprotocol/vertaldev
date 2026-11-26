"""VERTAL Code AI · Vertal Visão / Vertal Ouvir — modelo multimodal próprio em GPU (Modal, scale-to-zero).

Qwen2.5-Omni-7B (Apache-2.0; arquivo LICENSE do repo Qwen/Qwen2.5-Omni-7B) servido pelo vLLM (só o "thinker":
entende foto, vídeo curto e áudio e responde em TEXTO). API OpenAI-compatível em /v1/chat/completions, nome
do modelo "vertal-omni". Partes aceitas: image_url, video_url, input_audio / audio_url.
A voz em pt-BR sai pelo Kokoro (app vertal-novela, /tts) — a voz nativa do Omni só fala inglês/chinês.

Bearer = VERTAL_OMNI_TOKEN (segredo Modal "vertal-media-auth").
Deploy:  modal deploy vertal_omni.py      Baixar pesos:  modal run vertal_omni.py::download
"""
import os
import subprocess

import modal

MODEL = "Qwen/Qwen2.5-Omni-7B"
SERVED = "vertal-omni"
PORT = 8000

app = modal.App("vertal-omni")
hf_vol = modal.Volume.from_name("vertal-hf-cache", create_if_missing=True)
vllm_vol = modal.Volume.from_name("vertal-vllm-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install(
        "vllm[audio]==0.11.0", "transformers==4.57.1", "huggingface_hub[hf_transfer]",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/cache/hf", "VLLM_USAGE_SOURCE": "vertal"})
)


@app.function(image=image, volumes={"/cache/hf": hf_vol}, timeout=3600)
def download():
    from huggingface_hub import snapshot_download

    # Pesos do talker (voz) não são usados pelo vLLM, mas estão no mesmo arquivo; baixamos tudo.
    p = snapshot_download(MODEL)
    hf_vol.commit()
    print("ok", p)


@app.function(
    image=image,
    gpu="L40S",
    volumes={"/cache/hf": hf_vol, "/root/.cache/vllm": vllm_vol},
    secrets=[modal.Secret.from_name("vertal-media-auth")],
    scaledown_window=120,
    max_containers=1,
    timeout=600,
)
@modal.concurrent(max_inputs=8)
@modal.web_server(port=PORT, startup_timeout=600)
def serve():
    env = dict(os.environ)
    env["VLLM_API_KEY"] = os.environ["VERTAL_OMNI_TOKEN"]
    env["HF_HUB_OFFLINE"] = "1"
    cmd = [
        "vllm", "serve", MODEL,
        "--served-model-name", SERVED,
        "--host", "0.0.0.0", "--port", str(PORT),
        "--max-model-len", "16384",
        "--gpu-memory-utilization", "0.90",
        "--max-num-seqs", "4",
        "--limit-mm-per-prompt", '{"image": 4, "video": 1, "audio": 2}',
        "--allowed-local-media-path", "/tmp",
        "--enforce-eager",  # sobe mais rápido a frio (sem captura de CUDA graphs)
        "--uvicorn-log-level", "warning",
    ]
    subprocess.Popen(cmd, env=env)

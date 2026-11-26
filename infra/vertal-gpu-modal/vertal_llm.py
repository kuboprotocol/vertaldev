"""VERTAL Code AI · LLM própria em GPU (Modal, scale-to-zero).

Qwen2.5-Coder-14B-Instruct-AWQ (Apache-2.0) servido pelo vLLM com API OpenAI-compatível
em /v1/chat/completions, nome do modelo "vertal-coder-gpu". Protegido por Bearer
(VLLM_API_KEY = VERTAL_LLM_TOKEN do segredo Modal "vertal-gpu-auth").

Deploy:  modal deploy vertal_llm.py      Baixar pesos:  modal run vertal_llm.py::download
"""
import os
import subprocess

import modal

MODEL = "Qwen/Qwen2.5-Coder-14B-Instruct-AWQ"
SERVED = "vertal-coder-gpu"
PORT = 8000

app = modal.App("vertal-llm")
hf_vol = modal.Volume.from_name("vertal-hf-cache", create_if_missing=True)
vllm_vol = modal.Volume.from_name("vertal-vllm-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("vllm==0.11.0", "transformers==4.57.1", "huggingface_hub[hf_transfer]")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/cache/hf", "VLLM_USAGE_SOURCE": "vertal"})
)


@app.function(image=image, volumes={"/cache/hf": hf_vol}, timeout=1800)
def download():
    from huggingface_hub import snapshot_download

    p = snapshot_download(MODEL)
    hf_vol.commit()
    print("ok", p)


@app.function(
    image=image,
    gpu="A10G",
    volumes={"/cache/hf": hf_vol, "/root/.cache/vllm": vllm_vol},
    secrets=[modal.Secret.from_name("vertal-gpu-auth")],
    scaledown_window=120,
    max_containers=1,
    timeout=600,
)
@modal.concurrent(max_inputs=8)
@modal.web_server(port=PORT, startup_timeout=600)
def serve():
    env = dict(os.environ)
    env["VLLM_API_KEY"] = os.environ["VERTAL_LLM_TOKEN"]
    env["HF_HUB_OFFLINE"] = "1"
    cmd = [
        "vllm", "serve", MODEL,
        "--served-model-name", SERVED,
        "--host", "0.0.0.0", "--port", str(PORT),
        "--max-model-len", "16384",
        "--gpu-memory-utilization", "0.92",
        "--max-num-seqs", "8",
        "--enable-prefix-caching",
        "--compilation-config", '{"cudagraph_capture_sizes": [1, 2, 4, 8]}',
    ]
    subprocess.Popen(cmd, env=env)

    # Grava o cache do torch.compile no Volume assim que o servidor sobe: a próxima partida a frio
    # pula a compilação (~45-60 s a menos).
    def _persist_compile_cache():
        import time
        import urllib.request

        for _ in range(600):
            try:
                if urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=2).status == 200:
                    vllm_vol.commit()
                    print("compile cache committed")
                    return
            except Exception:
                pass
            time.sleep(1)

    import threading

    threading.Thread(target=_persist_compile_cache, daemon=True).start()

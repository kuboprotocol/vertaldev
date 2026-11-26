"""VERTAL Code AI · imagem própria em GPU (Modal, scale-to-zero).

FLUX.1-schnell (Apache-2.0; cópia sem bloqueio unsloth/FLUX.1-schnell, idêntica à oficial),
4 passos, 1024 px. POST /generate {prompt, width?, height?, steps?, seed?, format?}
→ {image: "data:image/jpeg;base64,...", ms, seed}. Bearer = VERTAL_IMAGE_TOKEN.

Deploy:  modal deploy vertal_image.py      Baixar pesos:  modal run vertal_image.py::download
"""
import os

import modal

REPO = "unsloth/FLUX.1-schnell"
ALLOW = [
    "model_index.json", "NOTICE", "scheduler/*", "text_encoder/*", "text_encoder_2/*",
    "tokenizer/*", "tokenizer_2/*", "transformer/*", "vae/*",
]

app = modal.App("vertal-image")
hf_vol = modal.Volume.from_name("vertal-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install(
        "torch==2.8.0", "diffusers==0.35.2", "transformers==4.57.1", "accelerate==1.11.0",
        "sentencepiece", "protobuf", "safetensors", "pillow", "fastapi[standard]",
        "huggingface_hub[hf_transfer]",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/cache/hf"})
)


@app.function(image=image, volumes={"/cache/hf": hf_vol}, timeout=3600)
def download():
    from huggingface_hub import snapshot_download

    p = snapshot_download(REPO, allow_patterns=ALLOW)
    hf_vol.commit()
    print("ok", p)


@app.cls(
    image=image,
    gpu="L40S",
    volumes={"/cache/hf": hf_vol},
    secrets=[modal.Secret.from_name("vertal-gpu-auth")],
    scaledown_window=120,
    max_containers=1,
    timeout=300,
)
@modal.concurrent(max_inputs=2)
class Flux:
    @modal.enter()
    def load(self):
        import time

        import torch
        from diffusers import FluxPipeline
        from huggingface_hub import snapshot_download

        t0 = time.time()
        path = snapshot_download(REPO, allow_patterns=ALLOW, local_files_only=True)
        self.pipe = FluxPipeline.from_pretrained(path, torch_dtype=torch.bfloat16).to("cuda")
        self.load_s = round(time.time() - t0, 1)
        print(f"loaded in {self.load_s}s")

    @modal.asgi_app()
    def web(self):
        import base64
        import io
        import random
        import secrets as _s
        import threading
        import time

        import torch
        from fastapi import FastAPI, HTTPException, Request

        api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
        token = os.environ["VERTAL_IMAGE_TOKEN"]
        lock = threading.Lock()

        def auth(req: Request):
            h = req.headers.get("authorization", "")
            if not _s.compare_digest(h, f"Bearer {token}"):
                raise HTTPException(status_code=401, detail="unauthorized")

        @api.get("/health")
        def health(req: Request):
            auth(req)
            return {"ok": True, "load_s": self.load_s}

        @api.post("/generate")
        def generate(req: Request, body: dict):
            auth(req)
            prompt = str(body.get("prompt") or "").strip()[:2000]
            if not prompt:
                raise HTTPException(status_code=400, detail="empty_prompt")
            snap = lambda v, d: max(256, min(1024, int(v or d) // 16 * 16))  # noqa: E731
            w, h = snap(body.get("width"), 1024), snap(body.get("height"), 1024)
            steps = max(1, min(8, int(body.get("steps") or 4)))
            seed = int(body.get("seed") or random.randint(0, 2**31 - 1))
            fmt = "PNG" if str(body.get("format") or "").lower() == "png" else "JPEG"
            t0 = time.time()
            with lock:
                img = self.pipe(
                    prompt, width=w, height=h, num_inference_steps=steps, guidance_scale=0.0,
                    max_sequence_length=256, generator=torch.Generator("cuda").manual_seed(seed),
                ).images[0]
            buf = io.BytesIO()
            img.save(buf, format=fmt, **({"quality": 90} if fmt == "JPEG" else {}))
            mime = "image/png" if fmt == "PNG" else "image/jpeg"
            return {
                "image": f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode(),
                "ms": int((time.time() - t0) * 1000),
                "seed": seed,
                "width": w,
                "height": h,
            }

        return api

"""VERTAL Code AI · vídeo curto próprio em GPU (Modal, scale-to-zero).

Wan2.1-T2V-1.3B (Apache-2.0, Wan-AI/Wan2.1-T2V-1.3B-Diffusers), ~4 s, 480p (832x480, 16 fps).
API assíncrona (protegida por Bearer = VERTAL_VIDEO_TOKEN), servida por uma função leve sem GPU:
  POST /submit {prompt, seconds?}  → {id, status:"pending"}
  GET  /status?id=...              → {status: "pending"|"completed"|"failed", ms?}
  GET  /result?id=...              → bytes video/mp4 (H.264)

Deploy:  modal deploy vertal_video.py      Baixar pesos:  modal run vertal_video.py::download
"""
import os

import modal

REPO = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
ALLOW = ["model_index.json", "scheduler/*", "text_encoder/*", "tokenizer/*", "transformer/*", "vae/*"]
NEGATIVE = (
    "Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, images, static, "
    "overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly "
    "drawn hands, poorly drawn faces, deformed, disfigured, misshapen limbs, fused fingers, still picture, messy "
    "background, three legs, many people in the background, walking backwards"
)

app = modal.App("vertal-video")
hf_vol = modal.Volume.from_name("vertal-hf-cache", create_if_missing=True)

gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install(
        "torch==2.8.0", "diffusers==0.35.2", "transformers==4.57.1", "accelerate==1.11.0",
        "sentencepiece", "protobuf", "safetensors", "ftfy", "imageio==2.37.0", "imageio-ffmpeg==0.6.0",
        "numpy<2.3", "huggingface_hub[hf_transfer]",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/cache/hf"})
)
web_image = modal.Image.debian_slim(python_version="3.12").uv_pip_install("fastapi[standard]")


@app.function(image=gpu_image, volumes={"/cache/hf": hf_vol}, timeout=3600)
def download():
    from huggingface_hub import snapshot_download

    p = snapshot_download(REPO, allow_patterns=ALLOW)
    hf_vol.commit()
    print("ok", p)


@app.cls(
    image=gpu_image,
    gpu="L40S",
    volumes={"/cache/hf": hf_vol},
    scaledown_window=120,
    max_containers=1,
    timeout=600,
)
class Wan:
    @modal.enter()
    def load(self):
        import time

        import torch
        from diffusers import AutoencoderKLWan, UniPCMultistepScheduler, WanPipeline
        from huggingface_hub import snapshot_download

        t0 = time.time()
        path = snapshot_download(REPO, allow_patterns=ALLOW, local_files_only=True)
        vae = AutoencoderKLWan.from_pretrained(path, subfolder="vae", torch_dtype=torch.float32)
        pipe = WanPipeline.from_pretrained(path, vae=vae, torch_dtype=torch.bfloat16)
        pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=3.0)
        self.pipe = pipe.to("cuda")
        self.load_s = round(time.time() - t0, 1)
        print(f"loaded in {self.load_s}s")

    @modal.method()
    def generate(self, prompt: str, seconds: int = 4, steps: int = 30, seed: int = 0) -> dict:
        import tempfile
        import time

        import imageio
        import numpy as np
        import torch

        t0 = time.time()
        frames_n = 4 * round(max(2, min(5, seconds)) * 16 / 4) + 1  # Wan: 4n+1 quadros, 16 fps
        out = self.pipe(
            prompt=prompt[:1500], negative_prompt=NEGATIVE, height=480, width=832, num_frames=frames_n,
            guidance_scale=5.0, num_inference_steps=max(10, min(50, steps)),
            generator=torch.Generator("cuda").manual_seed(seed or int(time.time())),
        ).frames[0]
        gen_ms = int((time.time() - t0) * 1000)
        with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
            w = imageio.get_writer(f.name, fps=16, codec="libx264", pixelformat="yuv420p", quality=8, macro_block_size=16)
            for fr in out:
                w.append_data((np.clip(fr, 0, 1) * 255).astype("uint8"))
            w.close()
            data = open(f.name, "rb").read()
        return {"mp4": data, "gen_ms": gen_ms, "frames": frames_n, "load_s": self.load_s}


@app.function(image=web_image, secrets=[modal.Secret.from_name("vertal-gpu-auth")], scaledown_window=60, max_containers=1)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def web():
    import secrets as _s

    from fastapi import FastAPI, HTTPException, Request, Response

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    token = os.environ["VERTAL_VIDEO_TOKEN"]

    def auth(req: Request):
        if not _s.compare_digest(req.headers.get("authorization", ""), f"Bearer {token}"):
            raise HTTPException(status_code=401, detail="unauthorized")

    def lookup(cid: str):
        if not cid.startswith("fc-"):
            raise HTTPException(status_code=404, detail="job_not_found")
        try:
            return modal.FunctionCall.from_id(cid)
        except Exception:
            raise HTTPException(status_code=404, detail="job_not_found")

    def poll(fc):
        try:
            return "completed", fc.get(timeout=0)
        except TimeoutError:
            return "pending", None
        except modal.exception.OutputExpiredError:
            return "expired", None
        except Exception:
            return "failed", None

    @api.post("/submit")
    def submit(req: Request, body: dict):
        auth(req)
        prompt = str(body.get("prompt") or "").strip()[:1500]
        if not prompt:
            raise HTTPException(status_code=400, detail="empty_prompt")
        seconds = int(body.get("seconds") or 4)
        fc = Wan().generate.spawn(prompt, seconds)
        return {"id": fc.object_id, "status": "pending"}

    @api.get("/status")
    def status(req: Request, id: str):
        auth(req)
        st, res = poll(lookup(id))
        out = {"status": st}
        if res:
            out.update({"gen_ms": res["gen_ms"], "frames": res["frames"], "bytes": len(res["mp4"])})
        return out

    @api.get("/result")
    def result(req: Request, id: str):
        auth(req)
        st, res = poll(lookup(id))
        if st != "completed":
            raise HTTPException(status_code=409, detail=st)
        return Response(content=res["mp4"], media_type="video/mp4", headers={"Cache-Control": "private, max-age=3600"})

    return api

"""VERTAL Code AI · vídeo curto próprio em GPU (Modal, scale-to-zero).

Wan2.1-T2V-1.3B (Apache-2.0, Wan-AI/Wan2.1-T2V-1.3B-Diffusers), ~4 s, 480p (832x480, 16 fps).
API assíncrona (protegida por Bearer = VERTAL_VIDEO_TOKEN), servida por uma função leve sem GPU:
  POST /submit {prompt, seconds?}  → {id, status:"pending"}
  GET  /status?id=...              → {status: "pending"|"completed"|"failed", ms?}
  GET  /result?id=...              → bytes video/mp4 (H.264)
  POST /video {mode:"ai"|"cover", seconds, prompt?, audio_url?, image_url?, budget_gpu_s?, max_clips?, steps?}
                                   → {id, status:"pending"}  (API de marca branca: vídeo longo, até 300 s)
    "ai":    gera N cenas curtas (WanBatch, L40S) dentro do orçamento de GPU (budget_gpu_s = trava de custo real:
             para de gerar cenas quando a próxima passaria do orçamento), monta em sequência até a duração
             pedida e, com audio_url, põe a música por baixo.
    "cover": capa parada + áudio (só CPU, ffmpeg), 1280x720, 2 qps.
    /status de um job de /video devolve também gpu_s (tempo de contêiner GPU cobrado pela Modal), gpu, clips.

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
cpu_image = modal.Image.debian_slim(python_version="3.12").apt_install("ffmpeg")

import time as _time

_BOOT = _time.time()  # subida do contêiner (a Modal cobra a GPU desde a subida, não só a geração)
MAX_VIDEO_SECONDS = 300
MAX_MEDIA_BYTES = 80 * 1024 * 1024
BATCH_SCALEDOWN_S = 5


def _load_pipe():
    import torch
    from diffusers import AutoencoderKLWan, UniPCMultistepScheduler, WanPipeline
    from huggingface_hub import snapshot_download

    path = snapshot_download(REPO, allow_patterns=ALLOW, local_files_only=True)
    vae = AutoencoderKLWan.from_pretrained(path, subfolder="vae", torch_dtype=torch.float32)
    pipe = WanPipeline.from_pretrained(path, vae=vae, torch_dtype=torch.bfloat16)
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=3.0)
    return pipe.to("cuda")


def _render(pipe, prompt: str, seconds: int, steps: int, seed: int) -> bytes:
    import tempfile

    import imageio
    import numpy as np
    import torch

    frames_n = 4 * round(max(2, min(5, seconds)) * 16 / 4) + 1  # Wan: 4n+1 quadros, 16 fps
    out = pipe(
        prompt=prompt[:1500], negative_prompt=NEGATIVE, height=480, width=832, num_frames=frames_n,
        guidance_scale=5.0, num_inference_steps=max(10, min(50, steps)),
        generator=torch.Generator("cuda").manual_seed(seed),
    ).frames[0]
    with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
        w = imageio.get_writer(f.name, fps=16, codec="libx264", pixelformat="yuv420p", quality=8, macro_block_size=16)
        for fr in out:
            w.append_data((np.clip(fr, 0, 1) * 255).astype("uint8"))
        w.close()
        return open(f.name, "rb").read()


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


@app.cls(
    image=gpu_image,
    gpu="L40S",
    volumes={"/cache/hf": hf_vol},
    scaledown_window=BATCH_SCALEDOWN_S,  # vídeo longo: desce logo depois, para GPU ociosa não virar custo
    max_containers=1,
    timeout=3600,
)
class WanBatch:
    @modal.enter()
    def load(self):
        self.pipe = _load_pipe()
        self.used = False

    @modal.method()
    def clips(self, prompts: list, seconds: int, steps: int, budget_gpu_s: float, max_clips: int, seed: int = 0) -> dict:
        """Gera até max_clips cenas sem passar do orçamento de GPU (segundos de contêiner, contando a subida)."""
        t_call = _time.time()
        base = 0.0 if self.used else (t_call - _BOOT)  # contêiner novo: subida + carga do modelo entram na conta
        self.used = True
        seed = seed or int(t_call)
        out, times = [], []
        for i in range(max(1, int(max_clips))):
            spent = base + (_time.time() - t_call) + BATCH_SCALEDOWN_S
            nxt = (sum(times) / len(times)) if times else 0.0
            if out and spent + nxt > budget_gpu_s:
                break
            t0 = _time.time()
            out.append(_render(self.pipe, str(prompts[i % len(prompts)]), seconds, steps, seed + i * 7919))
            times.append(_time.time() - t0)
        gpu_s = base + (_time.time() - t_call) + BATCH_SCALEDOWN_S
        return {"clips": out, "gpu_s": round(gpu_s, 1), "gpu": "L40S", "clip_s": [round(t, 1) for t in times], "cold": base > 0}


def _safe_url(u) -> str:
    import ipaddress
    import socket
    from urllib.parse import urlparse

    if not isinstance(u, str) or not u.startswith("https://"):
        raise ValueError("url_not_allowed")
    host = urlparse(u).hostname or ""
    for info in socket.getaddrinfo(host, 443):
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise ValueError("url_not_allowed")
    return u


def _download(u, path: str):
    import urllib.request

    req = urllib.request.Request(_safe_url(u), headers={"User-Agent": "vertal-video/1"})
    with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
        total = 0
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            total += len(b)
            if total > MAX_MEDIA_BYTES:
                raise ValueError("media_too_large")
            f.write(b)


def _ffmpeg(args: list):
    import subprocess

    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *args], capture_output=True, timeout=1800)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg: " + r.stderr.decode(errors="ignore")[-400:])


@app.function(image=cpu_image, cpu=1.0, memory=1024, timeout=3600, max_containers=4)
def make_video(spec: dict) -> dict:
    """Vídeo da API de marca branca: "ai" (cenas da IA em sequência + música opcional) ou "cover" (capa + áudio)."""
    import os
    import tempfile

    t0 = _time.time()
    seconds = max(1, min(MAX_VIDEO_SECONDS, int(spec.get("seconds") or 10)))
    mode = spec.get("mode")
    info = {"gpu_s": 0.0, "gpu": None, "clips": 0}
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "out.mp4")
        audio = None
        if spec.get("audio_url"):
            audio = os.path.join(d, "audio")
            _download(spec["audio_url"], audio)
        if mode == "cover":
            if not audio:
                raise ValueError("audio_required")
            img = os.path.join(d, "cover")
            _download(spec.get("image_url"), img)
            vf = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p"
            _ffmpeg(["-loop", "1", "-framerate", "2", "-i", img, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-vf", vf,
                     "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-r", "2",
                     "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-t", str(seconds), "-shortest", "-movflags", "+faststart", out])
        else:
            prompts = [str(p)[:1500] for p in (spec.get("prompts") or [spec.get("prompt") or ""]) if str(p).strip()][:12]
            if not prompts:
                raise ValueError("empty_prompt")
            clip_s = max(2, min(5, int(spec.get("clip_seconds") or 5)))
            want = -(-seconds // clip_s)
            max_clips = max(1, min(int(spec.get("max_clips") or 24), want))
            r = WanBatch().clips.remote(prompts, clip_s, int(spec.get("steps") or 20), float(spec.get("budget_gpu_s") or 300), max_clips)
            info.update(gpu_s=r["gpu_s"], gpu=r["gpu"], clips=len(r["clips"]), clip_s=r["clip_s"], cold=r["cold"])
            names = []
            for i, b in enumerate(r["clips"]):
                n = os.path.join(d, f"c{i}.mp4")
                open(n, "wb").write(b)
                names.append(n)
            # Sequência: as cenas em ordem, repetindo o ciclo até cobrir a duração.
            reps = -(-seconds // (clip_s * len(names)))
            with open(os.path.join(d, "list.txt"), "w") as f:
                for _ in range(reps):
                    for n in names:
                        f.write(f"file '{n}'\n")
            args = ["-f", "concat", "-safe", "0", "-i", os.path.join(d, "list.txt")]
            if audio:
                args += ["-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-ar", "44100"]
            else:
                args += ["-map", "0:v:0"]
            args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "16",
                     "-t", str(seconds), "-movflags", "+faststart", out]
            _ffmpeg(args)
        data = open(out, "rb").read()
    info.update(mp4=data, seconds=seconds, mode=mode, cpu_s=round(_time.time() - t0, 1))
    return info


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
        if res and "gen_ms" in res:
            out.update({"gen_ms": res["gen_ms"], "frames": res["frames"], "bytes": len(res["mp4"])})
        elif res:
            out.update({k: res.get(k) for k in ("gpu_s", "gpu", "clips", "cpu_s", "seconds", "mode", "cold")})
            out["bytes"] = len(res["mp4"])
        return out

    @api.post("/video")
    def video(req: Request, body: dict):
        auth(req)
        mode = body.get("mode")
        if mode not in ("ai", "cover"):
            raise HTTPException(status_code=400, detail="invalid_mode")
        seconds = int(body.get("seconds") or 0)
        if seconds < 1 or seconds > MAX_VIDEO_SECONDS:
            raise HTTPException(status_code=400, detail="invalid_seconds")
        if mode == "ai" and not str(body.get("prompt") or "").strip() and not body.get("prompts"):
            raise HTTPException(status_code=400, detail="empty_prompt")
        if mode == "cover" and not (body.get("image_url") and body.get("audio_url")):
            raise HTTPException(status_code=400, detail="cover_media_required")
        keys = ("mode", "seconds", "prompt", "prompts", "audio_url", "image_url", "budget_gpu_s", "max_clips", "steps", "clip_seconds")
        fc = make_video.spawn({k: body.get(k) for k in keys})
        return {"id": fc.object_id, "status": "pending"}

    @api.get("/result")
    def result(req: Request, id: str):
        auth(req)
        st, res = poll(lookup(id))
        if st != "completed":
            raise HTTPException(status_code=409, detail=st)
        return Response(content=res["mp4"], media_type="video/mp4", headers={"Cache-Control": "private, max-age=3600"})

    return api

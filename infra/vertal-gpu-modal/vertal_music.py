"""Vertal Music AI · música própria em GPU (Modal, scale-to-zero).

ACE-Step v1.5 XL Turbo (MIT, uso comercial liberado pelos autores; text encoder Qwen3-Embedding-0.6B Apache-2.0),
formato Diffusers (`ACE-Step/acestep-v15-xl-turbo-diffusers`, AceStepPipeline do diffusers >= 0.43).
Gera música com vocal (letra com tags [verse]/[chorus]) ou instrumental, 48 kHz estéreo → MP3 192 kbps.

API assíncrona (Bearer = VERTAL_MUSIC_TOKEN, segredo Modal `vertal-music-auth`), servida por uma função leve sem GPU:
  POST /submit {prompt, lyrics?, instrumental?, seconds?, language?, bpm?, key?, seed?} → {id, status:"pending"}
  GET  /status?id=...  → {status: "pending"|"completed"|"failed"|"expired", gen_ms?, seconds?, bytes?}
  GET  /result?id=...  → bytes audio/mpeg

É o motor "próprio" do painel Música do Vertal Dev (edge function creative-music). Quando houver chave do
provedor da MusKAI (sunoapi.org) configurada, o painel usa ela primeiro e este app fica como reserva.

Deploy:  modal run vertal_music.py::download && modal deploy vertal_music.py
         modal secret create vertal-music-auth VERTAL_MUSIC_TOKEN=...
"""
import os

import modal

REPO = "ACE-Step/acestep-v15-xl-turbo-diffusers"
ALLOW = [
    "model_index.json", "condition_encoder/*", "scheduler/*", "text_encoder/*", "tokenizer/*",
    "transformer/*", "vae/*",
]

app = modal.App("vertal-music")
hf_vol = modal.Volume.from_name("vertal-hf-cache", create_if_missing=True)

gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install(
        "torch==2.8.0", "diffusers==0.43.0", "transformers>=4.57,<6", "accelerate>=1.11", "huggingface_hub>=1.32",
        "sentencepiece", "protobuf", "safetensors", "soundfile", "numpy<2.3",
    )
    .env({"HF_HOME": "/cache/hf"})
)
web_image = modal.Image.debian_slim(python_version="3.12").uv_pip_install("fastapi[standard]")

LANGS = {"pt", "en", "es", "fr", "ja", "it", "de", "ko", "zh", "ru"}


@app.function(image=gpu_image, volumes={"/cache/hf": hf_vol}, timeout=3600)
def download():
    from huggingface_hub import snapshot_download

    p = snapshot_download(REPO, allow_patterns=ALLOW)
    hf_vol.commit()
    print("ok", p)


@app.cls(
    image=gpu_image,
    gpu=["L4", "A10G", "L40S"],
    volumes={"/cache/hf": hf_vol},
    scaledown_window=60,
    max_containers=1,
    timeout=600,
)
class AceStep:
    @modal.enter()
    def load(self):
        import time

        import torch
        from diffusers import AceStepPipeline
        from huggingface_hub import snapshot_download

        t0 = time.time()
        path = snapshot_download(REPO, allow_patterns=ALLOW, local_files_only=True)
        pipe = AceStepPipeline.from_pretrained(path, torch_dtype=torch.bfloat16)
        self.pipe = pipe.to("cuda")
        try:
            self.pipe.vae.enable_tiling()
        except Exception:  # noqa: BLE001
            pass
        self.load_s = round(time.time() - t0, 1)
        print(f"loaded in {self.load_s}s")

    @modal.method()
    def generate(self, req: dict) -> dict:
        import subprocess
        import tempfile
        import time

        import soundfile as sf
        import torch

        prompt = str(req.get("prompt") or "").strip()[:1500] or "pop song"
        instrumental = bool(req.get("instrumental"))
        lyrics = "[Instrumental]" if instrumental else (str(req.get("lyrics") or "").strip()[:4000] or "[Instrumental]")
        seconds = float(max(10, min(180, int(req.get("seconds") or 60))))
        lang = str(req.get("language") or "pt").lower()[:2]
        lang = lang if lang in LANGS else "en"
        bpm = req.get("bpm")
        bpm = int(bpm) if isinstance(bpm, (int, float)) and 40 <= int(bpm) <= 220 else None
        key = str(req.get("key") or "").strip()[:20] or None
        seed = int(req.get("seed") or int(time.time()))

        t0 = time.time()
        kwargs = dict(
            prompt=prompt, lyrics=lyrics, audio_duration=seconds, vocal_language=lang,
            generator=torch.Generator(device="cuda").manual_seed(seed),
        )
        if bpm:
            kwargs["bpm"] = bpm
        if key:
            kwargs["keyscale"] = key
        try:
            out = self.pipe(**kwargs)
        except TypeError:
            kwargs.pop("bpm", None)
            kwargs.pop("keyscale", None)
            out = self.pipe(**kwargs)
        audio = out.audios[0]
        gen_ms = int((time.time() - t0) * 1000)
        with tempfile.TemporaryDirectory() as d:
            wav, mp3 = f"{d}/a.wav", f"{d}/a.mp3"
            sf.write(wav, audio.T.cpu().float().numpy(), self.pipe.sample_rate)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "192k", mp3], check=True)
            data = open(mp3, "rb").read()
        return {"mp3": data, "gen_ms": gen_ms, "seconds": seconds, "load_s": self.load_s, "seed": seed}


@app.function(image=web_image, secrets=[modal.Secret.from_name("vertal-music-auth")], scaledown_window=60, max_containers=1)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def web():
    import secrets as _s

    from fastapi import FastAPI, HTTPException, Request, Response

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    token = os.environ["VERTAL_MUSIC_TOKEN"]

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

    @api.get("/health")
    def health(req: Request):
        auth(req)
        return {"ok": True}

    @api.post("/submit")
    def submit(req: Request, body: dict):
        auth(req)
        prompt = str(body.get("prompt") or "").strip()
        if not prompt:
            raise HTTPException(status_code=400, detail="empty_prompt")
        fc = AceStep().generate.spawn(body)
        return {"id": fc.object_id, "status": "pending"}

    @api.get("/status")
    def status(req: Request, id: str):
        auth(req)
        st, res = poll(lookup(id))
        out = {"status": st}
        if res:
            out.update({"gen_ms": res["gen_ms"], "seconds": res["seconds"], "bytes": len(res["mp3"])})
        return out

    @api.get("/result")
    def result(req: Request, id: str):
        auth(req)
        st, res = poll(lookup(id))
        if st != "completed":
            raise HTTPException(status_code=409, detail=st)
        return Response(content=res["mp3"], media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})

    return api

"""Vertal · Clonador de voz em GPU própria (Modal, scale-to-zero). App "vertal-voice".

Dois trabalhos, ambos "zero-shot" (sem treino por voz: a amostra de 10–60 s do usuário é a referência):
  speak → fala um texto com a voz do usuário: Chatterbox Multilingual (Resemble AI, licença MIT, 23 idiomas
          incluindo pt). Pesos: ResembleAI/chatterbox (MIT).
  sing  → canta uma música já pronta com a voz do usuário:
          1) separa voz e instrumental com Demucs htdemucs (MIT);
          2) converte a voz cantada com Seed-VC (modelo de canto 44 kHz com F0). Seed-VC é GPL-3.0 (código e
             pesos Plachta/Seed-VC): roda SÓ aqui, como serviço separado, sem distribuir o binário — o código
             do Vertal Dev não importa nem linka nada dele (só fala por HTTP com este app). Ver docs.
          3) mixa a voz convertida de volta com o instrumental (ffmpeg) → MP3 192 kbps.

API assíncrona (Bearer = VERTAL_VOICE_TOKEN, segredo Modal `vertal-voice-auth`), igual ao vertal-music:
  POST /submit {kind:"speak", text, language?, reference_url}               → {id, status:"pending"}
  POST /submit {kind:"sing", source_url, reference_url, pitch_shift?}       → {id, status:"pending"}
  GET  /status?id=...  → {status: "pending"|"completed"|"failed"|"expired", seconds?, error?}
  GET  /result?id=...  → bytes audio/mpeg
As URLs são links assinados de curta duração do bucket privado "uploads" do Supabase (a edge function gera).

Custos (L4 ≈ US$0,80/h): fala curta ~10–20 s de GPU; música de 2–3 min ~1–2 min de GPU + ~60 s a frio.
Limite do workspace Modal: US$30/mês (não aumentar). max_containers=1 e scaledown 60 s.

Deploy (depois do OK do Laércio):
  modal secret create vertal-voice-auth VERTAL_VOICE_TOKEN=...
  modal run vertal_voice.py::download && modal deploy vertal_voice.py
"""
import os

import modal

SEED_VC_REPO = "https://github.com/Plachtaa/seed-vc.git"
SEED_VC_COMMIT = "main"  # fixe um commit depois do 1º teste (ex.: git rev-parse HEAD no contêiner)
MAX_SOURCE_BYTES = 40 * 1024 * 1024
MAX_REF_BYTES = 15 * 1024 * 1024
MAX_SONG_SECONDS = 330

app = modal.App("vertal-voice")
hf_vol = modal.Volume.from_name("vertal-hf-cache", create_if_missing=True)

gpu_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
    .uv_pip_install(
        "torch==2.6.0", "torchaudio==2.6.0", "chatterbox-tts>=0.1.4", "demucs==4.0.1", "soundfile", "numpy<2",
        "requests", "huggingface_hub", "librosa>=0.10", "scipy", "munch", "einops", "descript-audio-codec",
        "pydub", "transformers==4.46.3", "accelerate", "hydra-core", "omegaconf", "resemblyzer", "jiwer", "pyyaml", "python-dotenv",
        "funasr", "modelscope",
    )
    .run_commands(f"git clone {SEED_VC_REPO} /opt/seed-vc && cd /opt/seed-vc && git checkout {SEED_VC_COMMIT}")
    .env({"HF_HOME": "/cache/hf", "TORCH_HOME": "/cache/torch", "PYTHONUNBUFFERED": "1"})
)
web_image = modal.Image.debian_slim(python_version="3.12").uv_pip_install("fastapi[standard]")

LANGS = {"pt", "en", "es", "fr", "de", "it", "nl", "pl", "ru", "tr", "ja", "ko", "zh", "ar", "hi"}


def _fetch(url: str, path: str, limit: int) -> None:
    import requests

    if not url.startswith("https://"):
        raise ValueError("url_not_https")
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        total = 0
        with open(path, "wb") as f:
            for chunk in r.iter_content(1 << 16):
                total += len(chunk)
                if total > limit:
                    raise ValueError("file_too_large")
                f.write(chunk)


def _to_wav(src: str, dst: str, sr: int, mono: bool = True, max_s: float | None = None) -> None:
    import subprocess

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ar", str(sr)]
    if mono:
        cmd += ["-ac", "1"]
    if max_s:
        cmd += ["-t", str(max_s)]
    subprocess.run(cmd + [dst], check=True)


def _to_mp3(src: str, dst: str) -> bytes:
    import subprocess

    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-codec:a", "libmp3lame", "-b:a", "192k", dst], check=True)
    return open(dst, "rb").read()


@app.function(image=gpu_image, volumes={"/cache/hf": hf_vol}, timeout=3600)
def download():
    from huggingface_hub import snapshot_download

    snapshot_download("ResembleAI/chatterbox")
    snapshot_download("Plachta/Seed-VC")
    hf_vol.commit()
    print("ok")


@app.cls(
    image=gpu_image,
    gpu=["L4", "A10G"],
    volumes={"/cache/hf": hf_vol},
    scaledown_window=60,
    max_containers=1,
    timeout=900,
)
class Voice:
    @modal.enter()
    def load(self):
        import time

        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        t0 = time.time()
        self.tts = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
        self.load_s = round(time.time() - t0, 1)
        print(f"tts loaded in {self.load_s}s")

    @modal.method()
    def speak(self, req: dict) -> dict:
        import tempfile

        import torchaudio

        text = str(req.get("text") or "").strip()[:1500]
        if not text:
            raise ValueError("empty_text")
        lang = str(req.get("language") or "pt").lower()[:2]
        lang = lang if lang in LANGS else "pt"
        with tempfile.TemporaryDirectory() as d:
            raw, ref = f"{d}/ref.bin", f"{d}/ref.wav"
            _fetch(str(req["reference_url"]), raw, MAX_REF_BYTES)
            _to_wav(raw, ref, 24000, max_s=30)
            # Frases longas: o Chatterbox rende melhor por partes; junta tudo no fim.
            parts = _split_text(text)
            import torch

            wavs = [self.tts.generate(p, language_id=lang, audio_prompt_path=ref) for p in parts]
            wav = torch.cat([w.cpu() for w in wavs], dim=-1)
            out = f"{d}/out.wav"
            torchaudio.save(out, wav, self.tts.sr)
            mp3 = _to_mp3(out, f"{d}/out.mp3")
            return {"mp3": mp3, "seconds": round(wav.shape[-1] / self.tts.sr, 1)}

    @modal.method()
    def sing(self, req: dict) -> dict:
        import subprocess
        import tempfile

        import soundfile as sf

        with tempfile.TemporaryDirectory() as d:
            _fetch(str(req["source_url"]), f"{d}/song.bin", MAX_SOURCE_BYTES)
            _fetch(str(req["reference_url"]), f"{d}/ref.bin", MAX_REF_BYTES)
            _to_wav(f"{d}/song.bin", f"{d}/song.wav", 44100, mono=False, max_s=MAX_SONG_SECONDS)
            _to_wav(f"{d}/ref.bin", f"{d}/ref.wav", 44100, max_s=25)

            # 1) Separa voz e instrumental (Demucs htdemucs, MIT).
            subprocess.run(
                ["python", "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs", "-o", f"{d}/sep", f"{d}/song.wav"],
                check=True,
            )
            vocals = f"{d}/sep/htdemucs/song/vocals.wav"
            inst = f"{d}/sep/htdemucs/song/no_vocals.wav"

            # 2) Converte a voz cantada para a voz do usuário (Seed-VC, modelo de canto com F0, 44 kHz).
            shift = int(req.get("pitch_shift") or 0)
            os.makedirs(f"{d}/vc", exist_ok=True)
            subprocess.run(
                [
                    "python", "inference.py", "--source", vocals, "--target", f"{d}/ref.wav", "--output", f"{d}/vc",
                    "--diffusion-steps", "30", "--length-adjust", "1.0", "--inference-cfg-rate", "0.7",
                    "--f0-condition", "True", "--auto-f0-adjust", "False", "--semi-tone-shift", str(shift), "--fp16", "True",
                ],
                check=True,
                cwd="/opt/seed-vc",
            )
            outs = sorted(f for f in os.listdir(f"{d}/vc") if f.endswith(".wav"))
            if not outs:
                raise RuntimeError("seed_vc_no_output")
            converted = f"{d}/vc/{outs[-1]}"

            # 3) Mixa a voz nova com o instrumental.
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error", "-i", inst, "-i", converted, "-filter_complex",
                    "[1:a]aresample=44100,volume=1.0[v];[0:a][v]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[m]",
                    "-map", "[m]", f"{d}/mix.wav",
                ],
                check=True,
            )
            info = sf.info(f"{d}/mix.wav")
            mp3 = _to_mp3(f"{d}/mix.wav", f"{d}/mix.mp3")
            return {"mp3": mp3, "seconds": round(info.duration, 1)}


def _split_text(text: str, limit: int = 280) -> list[str]:
    import re

    sentences = re.split(r"(?<=[.!?…])\s+", text)
    parts: list[str] = []
    cur = ""
    for s in sentences:
        if len(cur) + len(s) + 1 > limit and cur:
            parts.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        parts.append(cur)
    return parts or [text[:limit]]


@app.function(image=web_image, secrets=[modal.Secret.from_name("vertal-voice-auth")], scaledown_window=60, max_containers=1)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def web():
    import secrets as _s

    from fastapi import FastAPI, HTTPException, Request, Response

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    token = os.environ["VERTAL_VOICE_TOKEN"]

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
            return "completed", fc.get(timeout=0), None
        except TimeoutError:
            return "pending", None, None
        except modal.exception.OutputExpiredError:
            return "expired", None, None
        except Exception as e:  # noqa: BLE001
            return "failed", None, type(e).__name__

    @api.get("/health")
    def health(req: Request):
        auth(req)
        return {"ok": True}

    @api.post("/submit")
    def submit(req: Request, body: dict):
        auth(req)
        kind = body.get("kind")
        if not str(body.get("reference_url") or "").startswith("https://"):
            raise HTTPException(status_code=400, detail="reference_required")
        if kind == "speak":
            if not str(body.get("text") or "").strip():
                raise HTTPException(status_code=400, detail="empty_text")
            fc = Voice().speak.spawn(body)
        elif kind == "sing":
            if not str(body.get("source_url") or "").startswith("https://"):
                raise HTTPException(status_code=400, detail="source_required")
            fc = Voice().sing.spawn(body)
        else:
            raise HTTPException(status_code=400, detail="invalid_kind")
        return {"id": fc.object_id, "status": "pending"}

    @api.get("/status")
    def status(req: Request, id: str):
        auth(req)
        st, res, err = poll(lookup(id))
        out = {"status": st}
        if res:
            out.update({"seconds": res["seconds"], "bytes": len(res["mp3"])})
        if err:
            out["error"] = err
        return out

    @api.get("/result")
    def result(req: Request, id: str):
        auth(req)
        st, res, _ = poll(lookup(id))
        if st != "completed":
            raise HTTPException(status_code=409, detail=st)
        return Response(content=res["mp3"], media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=3600"})

    return api

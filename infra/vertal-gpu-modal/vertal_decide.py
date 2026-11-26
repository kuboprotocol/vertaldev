"""VERTAL Code AI · Vertal Decide — modelo de DECISÃO próprio em GPU (Modal, scale-to-zero).

Intern-Decision-4B (Apache-2.0, internlm/Intern-Decision-4B, base Qwen3.5-4B, lê texto + até 8 imagens).
Responde no MESMO formato do /v1/systemone (estilo Jev): perguntas tipadas `choice`, `score` e `noul`, com
probabilidades calibradas (temperatura do próprio checkpoint), numa única passada (sem gerar texto).

  POST /v1/systemone (ou /)  {state, questions, images?}         → {model, answers, usage, timing}
       `state` pode ser texto, objeto JSON ou lista com partes {type:"image_url", image_url:{url}} (como no Jev);
       imagens: data:image/(png|jpeg|webp);base64,… ou https://…
  POST /v1/systemone/video   {video, questions, state?, fps?, max_frames?, rank_by?}
       → amostra quadros com ffmpeg, decide quadro a quadro, devolve {frames:[{t, answers}], top:[…]}
  GET  /health

Bearer = VERTAL_DECIDE_TOKEN (segredo Modal "vertal-media-auth").
Deploy:  modal deploy vertal_decide.py      Baixar pesos:  modal run vertal_decide.py::download
"""
import os

import modal

REPO = "internlm/Intern-Decision-4B"
MAX_IMAGE_BYTES = 8_000_000
MAX_VIDEO_BYTES = 60_000_000

app = modal.App("vertal-decide")
hf_vol = modal.Volume.from_name("vertal-hf-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .uv_pip_install(
        "torch==2.9.1", "torchvision==0.24.1", "transformers==5.14.1", "accelerate", "pillow",
        "fastapi[standard]", "httpx", "huggingface_hub[hf_transfer]", "flash-linear-attention==0.6.0",
    )
    # Caminho rápido das camadas de atenção linear do Qwen3.5 (sem ele, foto levava ~18 s; texto 0,2 s).
    .pip_install(
        "https://github.com/Dao-AILab/causal-conv1d/releases/download/v1.7.0/"
        "causal_conv1d-1.7.0+cu12torch2.9cxx11abiTRUE-cp312-cp312-linux_x86_64.whl"
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/cache/hf"})
)


@app.function(image=image, volumes={"/cache/hf": hf_vol}, timeout=1800)
def download():
    from huggingface_hub import snapshot_download

    p = snapshot_download(REPO)
    hf_vol.commit()
    print("ok", p)


def _fetch_bytes(url: str, limit: int) -> bytes:
    import base64

    import httpx

    if url.startswith("data:"):
        head, _, b64 = url.partition(",")
        if ";base64" not in head:
            raise ValueError("bad_data_url")
        data = base64.b64decode(b64, validate=False)
    elif url.startswith("https://"):
        r = httpx.get(url, timeout=20, follow_redirects=True)
        r.raise_for_status()
        data = r.content
    else:
        raise ValueError("bad_url")
    if len(data) > limit:
        raise ValueError("too_large")
    return data


@app.cls(
    image=image,
    gpu=["L4", "A10G"],  # L4 chegou a ficar 3–5 min na fila (26/11); A10G como alternativa
    volumes={"/cache/hf": hf_vol},
    secrets=[modal.Secret.from_name("vertal-media-auth")],
    scaledown_window=120,
    max_containers=1,
    timeout=600,
)
@modal.concurrent(max_inputs=4)
class Decide:
    @modal.enter()
    def load(self):
        import sys
        import threading
        import time

        from huggingface_hub import snapshot_download

        t0 = time.time()
        path = snapshot_download(REPO, local_files_only=True)
        sys.path.insert(0, path)
        from inference import DecisionEngine  # noqa: E402  (vem junto com o checkpoint)

        self.engine = DecisionEngine(checkpoint=path, media_root="/tmp", device="cuda")
        self.lock = threading.Lock()
        self.load_s = round(time.time() - t0, 1)
        print(f"loaded in {self.load_s}s")

    def _predict(self, state, questions, image_urls):
        import tempfile
        import time

        from PIL import Image

        paths = []
        try:
            for u in image_urls[:8]:
                data = _fetch_bytes(u, MAX_IMAGE_BYTES)
                f = tempfile.NamedTemporaryFile(suffix=".png", dir="/tmp", delete=False)
                f.write(data)
                f.close()
                with Image.open(f.name) as im:  # valida e normaliza (limita o lado maior a 896 px)
                    im = im.convert("RGB")
                    im.thumbnail((896, 896))
                    im.save(f.name, format="PNG")
                paths.append(f.name)
            req = {"state": state, "questions": questions}
            if paths:
                req["images"] = paths
            t0 = time.time()
            with self.lock:
                out = self.engine.predict(req)
            out["timing"] = {**out.get("timing", {}), "total_ms": round((time.time() - t0) * 1000, 1)}
            out["model"] = "vertal-decide"
            return out
        finally:
            for p in paths:
                try:
                    os.unlink(p)
                except OSError:
                    pass

    @modal.asgi_app()
    def web(self):
        import secrets as _s
        import subprocess
        import tempfile
        import time

        from fastapi import FastAPI, HTTPException, Request

        api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
        token = os.environ["VERTAL_DECIDE_TOKEN"]

        def auth(req: Request):
            if not _s.compare_digest(req.headers.get("authorization", ""), f"Bearer {token}"):
                raise HTTPException(status_code=401, detail="unauthorized")

        def split_state(body: dict):
            """Aceita o formato do Jev (state = lista de textos e partes image_url) e o do Intern (images)."""
            state = body.get("state")
            images = [u for u in (body.get("images") or []) if isinstance(u, str)]
            if isinstance(state, list):
                texts = []
                for part in state:
                    if isinstance(part, str):
                        texts.append(part)
                    elif isinstance(part, dict) and part.get("type") == "image_url":
                        u = (part.get("image_url") or {}).get("url")
                        if isinstance(u, str):
                            images.append(u)
                    elif isinstance(part, dict) and part.get("type") == "text":
                        texts.append(str(part.get("text") or ""))
                state = "\n".join(texts) if texts else "(see image)"
            if state is None:
                state = "(see image)" if images else ""
            return state, images

        @api.get("/health")
        def health(req: Request):
            auth(req)
            return {"ok": True, "load_s": self.load_s, "model": "vertal-decide"}

        @api.post("/")
        @api.post("/v1/systemone")
        def systemone(req: Request, body: dict):
            auth(req)
            questions = body.get("questions")
            if not isinstance(questions, dict) or not questions:
                raise HTTPException(status_code=400, detail="questions_required")
            state, images = split_state(body)
            try:
                return self._predict(state, questions, images)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e)[:200])

        @api.post("/v1/systemone/video")
        def video(req: Request, body: dict):
            auth(req)
            questions = body.get("questions")
            if not isinstance(questions, dict) or not questions:
                raise HTTPException(status_code=400, detail="questions_required")
            url = str(body.get("video") or "")
            fps = max(0.05, min(4.0, float(body.get("fps") or 1)))
            max_frames = max(1, min(120, int(body.get("max_frames") or 24)))
            t0 = time.time()
            try:
                data = _fetch_bytes(url, MAX_VIDEO_BYTES)
            except Exception as e:  # noqa: BLE001
                raise HTTPException(status_code=400, detail=f"video:{str(e)[:120]}")
            with tempfile.TemporaryDirectory(dir="/tmp") as d:
                src = os.path.join(d, "in.mp4")
                open(src, "wb").write(data)
                r = subprocess.run(
                    ["ffmpeg", "-v", "error", "-i", src, "-vf", f"fps={fps},scale='min(768,iw)':-2",
                     "-frames:v", str(max_frames), os.path.join(d, "f%04d.jpg")],
                    capture_output=True, timeout=120,
                )
                if r.returncode != 0:
                    raise HTTPException(status_code=400, detail="video_decode_failed")
                frames = sorted(f for f in os.listdir(d) if f.startswith("f"))
                sample_ms = int((time.time() - t0) * 1000)
                import base64

                out = []
                state = body.get("state") or "A frame sampled from a video."
                for i, fn in enumerate(frames):
                    b = open(os.path.join(d, fn), "rb").read()
                    res = self._predict(state, questions, ["data:image/jpeg;base64," + base64.b64encode(b).decode()])
                    out.append({"t": round(i / fps, 2), "answers": res["answers"], "ms": res["timing"]["total_ms"]})
            rank_by = body.get("rank_by")
            top = []
            if isinstance(rank_by, str) and rank_by in questions:
                def key(fr):
                    a = fr["answers"][rank_by]
                    return a.get("noul", a.get("score", a.get("confidence", 0)))
                top = [fr["t"] for fr in sorted(out, key=key, reverse=True)[:5]]
            return {
                "model": "vertal-decide",
                "frames": out,
                "top": top,
                "timing": {"sample_ms": sample_ms, "total_ms": int((time.time() - t0) * 1000), "frames": len(out)},
            }

        return api


@app.function(image=image, gpu=["L4", "A10G"], volumes={"/cache/hf": hf_vol}, timeout=600)
def selftest():
    """Diagnóstico: carrega o modelo e decide uma frase; grava o resultado no Dict "vertal-diag"."""
    import sys
    import time
    import traceback

    diag = modal.Dict.from_name("vertal-diag", create_if_missing=True)
    log = []
    try:
        from huggingface_hub import snapshot_download

        t0 = time.time()
        path = snapshot_download(REPO, local_files_only=True)
        sys.path.insert(0, path)
        from inference import DecisionEngine

        eng = DecisionEngine(checkpoint=path, media_root="/tmp", device="cuda")
        log.append(f"load_s {round(time.time() - t0, 1)}")
        for _ in range(2):
            t = time.time()
            r = eng.predict({"state": "I was charged twice, please refund.", "questions": {"refund": {"type": "noul", "instructions": "Is the customer asking for money back?"}}})
            log.append(f"{round((time.time() - t) * 1000)} ms {r['answers']}")
    except Exception:
        log.append(traceback.format_exc()[-3000:])
    diag["decide"] = "\n".join(log)
    print("\n".join(log))

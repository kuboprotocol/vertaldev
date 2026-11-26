"""VERTAL Code AI · Vertal Novela — "novelinha" de ~2 min por centavos (Modal, scale-to-zero, sem GPU própria).

Pipeline (tudo nosso):
  1. Vertal Decide (vertal-decide) barra pedido impróprio (noul) — e, se pedido, escolhe as cenas-chave.
  2. LLM própria (vertal-llm; reserva: vertal-omni) escreve título + ~12 cenas (narração pt-BR + prompt de imagem).
  3. FLUX.1-schnell (vertal-image) gera 1 quadro-chave vertical por cena (576x1024, 4 passos).
  4. Opcional: 1–3 cenas-chave viram clipe Wan2.1 (vertal-video). Padrão: 0.
  5. Voz pt-BR com Kokoro-82M (Apache-2.0; vozes pf_dora / pm_alex / pm_santa) em CPU.
  6. ffmpeg: movimento barato (zoom/pan), transição (xfade), legendas queimadas (ASS) e mux → MP4 H.264 720x1280.

  POST /submit {premise, voice?, scenes?(padrão 12), clips?(0–3)} → {id}
  GET  /status?id=  → {status, stage?, timings?, cost?}
  GET  /result?id=  → bytes video/mp4
  POST /tts {text, voice?} → audio/wav (voz pt-BR; usada pelo "Vertal Ouvir" para responder em voz)

Bearer = VERTAL_NOVELA_TOKEN. URLs dos outros apps no segredo "vertal-media-auth" (VERTAL_*_URL);
tokens LLM/imagem/vídeo no "vertal-gpu-auth". Deploy:  modal deploy vertal_novela.py
"""
import json
import os
import re

import modal

app = modal.App("vertal-novela")
hf_vol = modal.Volume.from_name("vertal-hf-cache", create_if_missing=True)
state = modal.Dict.from_name("vertal-novela-state", create_if_missing=True)

VOICES = {"pf_dora", "pm_alex", "pm_santa"}
W, H, FPS, XFADE = 720, 1280, 24, 0.5

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "espeak-ng", "fonts-dejavu-core")
    .pip_install("torch==2.8.0", index_url="https://download.pytorch.org/whl/cpu")
    .uv_pip_install("kokoro==0.9.4", "soundfile", "numpy<2.3", "httpx", "fastapi[standard]", "huggingface_hub[hf_transfer]")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/cache/hf"})
)
SECRETS = [modal.Secret.from_name("vertal-media-auth"), modal.Secret.from_name("vertal-gpu-auth")]

# Preços Modal por segundo (página de preços, nov/2026). Só para ESTIMAR custo por novela.
PRICE = {"A10G": 0.000306, "L40S": 0.000542, "L4": 0.000222, "CPU_CORE": 0.0000131, "MEM_GIB": 0.00000222}

SCRIPT_SYSTEM = (
    "Você é roteirista de novelinhas curtas (vídeo vertical de ~2 minutos) em português do Brasil. "
    "Responda SÓ com JSON válido, sem markdown, no formato: "
    '{"titulo": "...", "cenas": [{"narracao": "...", "imagem": "...", "movimento": "zoom_in|zoom_out|pan_esq|pan_dir"}]}. '
    "Regras: {n} cenas; cada narração com 36 a 42 palavras (a história inteira dura ~2 minutos narrada), frases curtas, emoção e um gancho no fim; "
    "a última cena fecha a história. 'imagem' é um prompt EM INGLÊS para um gerador de imagens: cena cinematográfica, "
    "mesmos personagens descritos do mesmo jeito em todas as cenas (roupa, cabelo, idade), iluminação, "
    "enquadramento vertical, sem texto na imagem. Nada de conteúdo sexual, ódio ou violência gráfica. "
    'Exemplo de UMA narração no tamanho certo (40 palavras): "Toda sexta, às sete em ponto, ele entrava calado, pedia o '
    'mesmo bolo de cenoura e pagava em moedas. Marina já sabia o pedido de cor, mas naquela noite ele deixou um '
    'bilhete dobrado embaixo do troco, com o nome dela escrito."'
)
MIN_WORDS = 300  # ~2 min narrado (Kokoro pt-BR fala ~2,6 palavras/s com as pausas)


def script_words(script: dict) -> int:
    return sum(len(c["narracao"].split()) for c in script["cenas"])


def _env(k: str) -> str:
    return (os.environ.get(k) or "").strip()


def _post(url: str, token: str, body: dict, timeout: float):
    import httpx

    r = httpx.post(url, json=body, headers={"Authorization": f"Bearer {token}"}, timeout=timeout)
    r.raise_for_status()
    return r.json()


def parse_script(text: str, n: int) -> dict:
    """Extrai o JSON do roteiro (tolera cercas ``` e texto antes/depois). Lança ValueError se inválido."""
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    a, b = t.find("{"), t.rfind("}")
    if a < 0 or b <= a:
        raise ValueError("no_json")
    d = json.loads(t[a : b + 1])
    cenas = [c for c in (d.get("cenas") or []) if isinstance(c, dict) and str(c.get("narracao") or "").strip() and str(c.get("imagem") or "").strip()]
    if len(cenas) < max(3, n // 2):
        raise ValueError("few_scenes")
    for c in cenas:
        c["narracao"] = re.sub(r"\s+", " ", str(c["narracao"])).strip()[:400]
        c["imagem"] = str(c["imagem"]).strip()[:600]
        if c.get("movimento") not in {"zoom_in", "zoom_out", "pan_esq", "pan_dir"}:
            c["movimento"] = "zoom_in"
    return {"titulo": str(d.get("titulo") or "Vertal Novela").strip()[:80], "cenas": cenas[:n]}


def caption_chunks(text: str, max_words: int = 6) -> list[str]:
    words = text.split()
    return [" ".join(words[i : i + max_words]) for i in range(0, len(words), max_words)]


def ass_time(s: float) -> str:
    s = max(0.0, s)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{sec:05.2f}"


def build_ass(scenes: list[dict]) -> str:
    """Legendas: cada cena começa em scene['start'] e a fala dura scene['speech']; blocos de até 6 palavras."""
    head = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Cap,DejaVu Sans,46,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,1,2,50,50,210,1\n"
        "Style: Title,DejaVu Sans,56,&H0000E5FF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,5,1,8,40,40,160,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lines = []
    for sc in scenes:
        chunks = caption_chunks(sc["narracao"])
        total = sum(len(c) for c in chunks) or 1
        t = sc["start"]
        for c in chunks:
            d = sc["speech"] * len(c) / total
            lines.append(f"Dialogue: 0,{ass_time(t)},{ass_time(t + d)},Cap,,0,0,0,,{c.replace('{', '(').replace('}', ')')}")
            t += d
    return head + "\n".join(lines) + "\n"


def motion_filter(kind: str, frames: int) -> str:
    z = "min(zoom+0.0007,1.18)" if kind != "zoom_out" else "if(eq(on,0),1.18,max(zoom-0.0007,1.0))"
    if kind == "pan_esq":
        return f"zoompan=z=1.15:x='(iw-iw/zoom)*(1-on/{frames})':y='(ih-ih/zoom)/2':d={frames}:s={W}x{H}:fps={FPS}"
    if kind == "pan_dir":
        return f"zoompan=z=1.15:x='(iw-iw/zoom)*on/{frames}':y='(ih-ih/zoom)/2':d={frames}:s={W}x{H}:fps={FPS}"
    return f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"


def xfade_offsets(durs: list[float], t: float = XFADE) -> list[float]:
    out, acc = [], 0.0
    for d in durs[:-1]:
        acc += d - t
        out.append(round(acc, 3))
    return out


@app.cls(image=image, volumes={"/cache/hf": hf_vol}, cpu=2, memory=2048, scaledown_window=120, max_containers=1, timeout=300)
class Voice:
    @modal.enter()
    def load(self):
        from kokoro import KPipeline

        self.pipe = KPipeline(lang_code="p", repo_id="hexgrad/Kokoro-82M")

    @modal.method()
    def speak(self, text: str, voice: str = "pf_dora", speed: float = 1.0) -> bytes:
        import io

        import numpy as np
        import soundfile as sf

        voice = voice if voice in VOICES else "pf_dora"
        parts = [a for _, _, a in self.pipe(text[:2000], voice=voice, speed=speed)]
        audio = np.concatenate(parts) if parts else np.zeros(2400, dtype="float32")
        buf = io.BytesIO()
        sf.write(buf, audio, 24000, format="WAV")
        return buf.getvalue()


@app.function(image=image, volumes={"/cache/hf": hf_vol}, secrets=SECRETS, cpu=4, memory=4096, timeout=900, max_containers=2)
def make(job: str, premise: str, voice: str = "pf_dora", n: int = 12, clips: int = 0) -> bytes:
    import concurrent.futures as cf
    import subprocess
    import tempfile
    import time

    import httpx
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    T0 = time.time()
    tm: dict = {}
    gpu_s = {"A10G": 0.0, "L40S": 0.0, "L4": 0.0}

    def stage(s):
        state[job] = {**state.get(job, {}), "status": "pending", "stage": s}

    # 1) Decide: moderação rápida do pedido
    stage("decide")
    t = time.time()
    try:
        d = _post(_env("VERTAL_DECIDE_URL") + "/v1/systemone", _env("VERTAL_DECIDE_TOKEN"), {
            "state": premise,
            "questions": {"unsafe": {"type": "noul", "instructions": "Does this story request ask for sexual content, sexual content involving minors, hate speech, graphic violence, or defamation of a real person?"}},
        }, 20)  # decisão rápida; se o Decide estiver frio/na fila, segue (a LLM também recebe a regra)
        unsafe = float(d["answers"]["unsafe"]["noul"])
    except Exception as e:  # noqa: BLE001  — sem Decide, segue (a LLM também recebe a regra)
        print("decide failed", e)
        unsafe = 0.0
    tm["decide_ms"] = int((time.time() - t) * 1000)
    gpu_s["L4"] += min(tm["decide_ms"], 2000) / 1000  # fila/frio não é tempo de GPU útil
    if unsafe >= 0.7:
        raise ValueError("premise_rejected")

    # 2) Roteiro com a LLM própria (reserva: Omni)
    stage("script")
    t = time.time()
    msgs = [{"role": "system", "content": SCRIPT_SYSTEM.replace("{n}", str(n))}, {"role": "user", "content": f"Premissa: {premise}"}]
    script = None
    for url_k, tok_k, model, gpu in (("VERTAL_LLM_URL", "VERTAL_LLM_TOKEN", "vertal-coder-gpu", "A10G"), ("VERTAL_OMNI_URL", "VERTAL_OMNI_TOKEN", "vertal-omni", "L40S")):
        t1 = time.time()
        try:
            r = _post(_env(url_k) + "/v1/chat/completions", _env(tok_k), {
                "model": model, "messages": msgs, "temperature": 0.8, "max_tokens": 2600,
                "response_format": {"type": "json_object"},
            }, 240)
            script = parse_script(r["choices"][0]["message"]["content"], n)
            if script_words(script) < MIN_WORDS:
                # Modelos pequenos encurtam o roteiro inteiro; reescrever CENA A CENA (pedidos curtos, em paralelo) segura o tamanho.
                resumo = " ".join(c["narracao"] for c in script["cenas"])[:2500]

                def grow(i):
                    try:
                        r2 = _post(_env(url_k) + "/v1/chat/completions", _env(tok_k), {
                            "model": model, "temperature": 0.7, "max_tokens": 220,
                            "messages": [
                                {"role": "system", "content": "Você é narrador de novelas em português do Brasil. Responda só com o texto da narração, sem aspas nem rótulos."},
                                {"role": "user", "content": f"História '{script['titulo']}': {resumo}\n\nReescreva a narração da cena {i + 1} de {len(script['cenas'])} "
                                 f"com 3 frases curtas e 38 a 44 palavras no total, mantendo os fatos: {script['cenas'][i]['narracao']}"},
                            ],
                        }, 120)
                        t2 = re.sub(r"\s+", " ", r2["choices"][0]["message"]["content"]).strip().strip('"')[:400]
                        if len(t2.split()) > len(script["cenas"][i]["narracao"].split()):
                            script["cenas"][i]["narracao"] = t2
                    except Exception as e:  # noqa: BLE001
                        print("grow failed", i, e)

                import concurrent.futures as _cf

                with _cf.ThreadPoolExecutor(6) as _ex:
                    list(_ex.map(grow, range(len(script["cenas"]))))
                tm["script_expanded"] = True
            tm["script_words"] = script_words(script)
            gpu_s[gpu] += time.time() - t1
            tm["script_model"] = model
            tm["script_tokens"] = r.get("usage", {})
            break
        except Exception as e:  # noqa: BLE001
            gpu_s[gpu] += time.time() - t1
            print("script failed", model, e)
    if not script:
        raise RuntimeError("script_failed")
    tm["script_ms"] = int((time.time() - t) * 1000)
    scenes = script["cenas"]

    work = tempfile.mkdtemp(dir="/tmp")

    # 3) Quadros-chave (FLUX) em paralelo com 4) clipes opcionais e 5) voz
    stage("images")
    t = time.time()
    style = ", cinematic vertical shot, soft film lighting, detailed, consistent characters, no text"

    def gen(i):
        t1 = time.time()
        for attempt in range(2):
            try:
                r = _post(_env("VERTAL_IMAGE_URL") + "/generate", _env("VERTAL_IMAGE_TOKEN"), {
                    "prompt": scenes[i]["imagem"] + style, "width": 576, "height": 1024, "steps": 4, "seed": 1234 + i,
                }, 180)
                import base64

                b = base64.b64decode(r["image"].split(",", 1)[1])
                p = os.path.join(work, f"img{i:02d}.jpg")
                open(p, "wb").write(b)
                return p, r.get("ms", 0), time.time() - t1
            except Exception as e:  # noqa: BLE001
                print("image retry", i, attempt, e)
        raise RuntimeError("image_failed")

    clip_idx: list[int] = []
    if clips > 0 and _env("VERTAL_VIDEO_URL"):
        try:
            d = _post(_env("VERTAL_DECIDE_URL") + "/v1/systemone", _env("VERTAL_DECIDE_TOKEN"), {
                "state": {f"cena_{i}": s["narracao"] for i, s in enumerate(scenes)},
                "questions": {f"m{i}": {"type": "score", "instructions": f"How much would `cena_{i}` benefit from real motion video (action, movement) instead of a still image?", "criteria": ["Not at all, a still image is fine", "Somewhat", "A lot, it is an action moment"]} for i in range(len(scenes))},
            }, 60)
            ranked = sorted(range(len(scenes)), key=lambda i: d["answers"][f"m{i}"]["score"], reverse=True)
            clip_idx = sorted(ranked[: min(3, clips)])
        except Exception as e:  # noqa: BLE001
            print("decide clips failed", e)
            clip_idx = list(range(min(3, clips)))

    def wan(i):
        t1 = time.time()
        sub = _post(_env("VERTAL_VIDEO_URL") + "/submit", _env("VERTAL_VIDEO_TOKEN"), {"prompt": scenes[i]["imagem"], "seconds": 4}, 60)
        while time.time() - t1 < 600:
            time.sleep(8)
            st = httpx.get(_env("VERTAL_VIDEO_URL") + f"/status?id={sub['id']}", headers={"Authorization": f"Bearer {_env('VERTAL_VIDEO_TOKEN')}"}, timeout=30).json()
            if st.get("status") == "completed":
                b = httpx.get(_env("VERTAL_VIDEO_URL") + f"/result?id={sub['id']}", headers={"Authorization": f"Bearer {_env('VERTAL_VIDEO_TOKEN')}"}, timeout=120).content
                p = os.path.join(work, f"wan{i:02d}.mp4")
                open(p, "wb").write(b)
                return p, st.get("gen_ms", 0), time.time() - t1
            if st.get("status") in {"failed", "expired"}:
                break
        return None, 0, time.time() - t1

    with cf.ThreadPoolExecutor(4) as ex:
        img_f = [ex.submit(gen, i) for i in range(len(scenes))]
        wan_f = {i: ex.submit(wan, i) for i in clip_idx}

        # 5) Voz (CPU, enquanto a GPU desenha)
        tv = time.time()
        pipe = KPipeline(lang_code="p", repo_id="hexgrad/Kokoro-82M")
        voice = voice if voice in VOICES else "pf_dora"
        sr = 24000
        pause = np.zeros(int(sr * (XFADE + 0.45)), dtype="float32")
        audios = []
        for sc in scenes:
            parts = [a.numpy() if hasattr(a, "numpy") else a for _, _, a in pipe(sc["narracao"], voice=voice, speed=0.95)]
            a = np.concatenate(parts).astype("float32") if parts else np.zeros(sr, dtype="float32")
            sc["speech"] = round(len(a) / sr, 3)
            audios.append(np.concatenate([np.zeros(int(sr * 0.15), dtype="float32"), a, pause]))
        tm["tts_ms"] = int((time.time() - tv) * 1000)

        imgs = [f.result() for f in img_f]
        wans = {i: f.result() for i, f in wan_f.items()}
    tm["images_ms"] = int((time.time() - t) * 1000)
    tm["images_gen_ms"] = sum(x[1] for x in imgs)
    gpu_s["L40S"] += max(x[2] for x in imgs) if imgs else 0  # serializadas num contêiner: o maior tempo de parede cobre todas
    for i, (_, gen_ms, wall) in wans.items():
        gpu_s["L40S"] += gen_ms / 1000 + 10
        tm.setdefault("clips", []).append({"scene": i, "gen_ms": gen_ms})

    # 6) Montagem
    stage("render")
    tr = time.time()
    durs = [round(len(a) / sr, 3) for a in audios]
    starts, acc = [], 0.0
    for i, d in enumerate(durs):
        starts.append(round(acc, 3))
        acc += d - XFADE
    for sc, st in zip(scenes, starts):
        sc["start"] = st + 0.15
    # áudio: cada cena começa em starts[i] (o xfade sobrepõe XFADE s de silêncio)
    total = starts[-1] + durs[-1]
    mix = np.zeros(int(total * sr) + sr, dtype="float32")
    for a, st in zip(audios, starts):
        o = int(st * sr)
        mix[o : o + len(a)] += a
    mix = mix[: int(total * sr)]
    wav = os.path.join(work, "voice.wav")
    sf.write(wav, mix, sr)
    open(os.path.join(work, "cap.ass"), "w").write(build_ass(scenes))

    def render(i):
        out = os.path.join(work, f"sc{i:02d}.mp4")
        frames = max(1, int(round(durs[i] * FPS)))
        if i in wans and wans[i][0]:
            vf = f"scale=-2:{H},crop={W}:{H},fps={FPS},setsar=1"
            cmd = ["ffmpeg", "-v", "error", "-y", "-stream_loop", "-1", "-i", wans[i][0], "-t", f"{durs[i]:.3f}", "-vf", vf]
        else:
            vf = f"scale={int(W * 1.6)}:{int(H * 1.6)},{motion_filter(scenes[i]['movimento'], frames)},setsar=1"
            cmd = ["ffmpeg", "-v", "error", "-y", "-i", imgs[i][0], "-vf", vf, "-frames:v", str(frames)]
        cmd += ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS), out]
        subprocess.run(cmd, check=True, timeout=300)
        return out

    with cf.ThreadPoolExecutor(4) as ex:
        parts = list(ex.map(render, range(len(scenes))))
    offs = xfade_offsets(durs)
    inputs, fc, last = [], [], "[0:v]"
    for p in parts:
        inputs += ["-i", p]
    for k, off in enumerate(offs, start=1):
        lab = f"[v{k}]"
        fc.append(f"{last}[{k}:v]xfade=transition=fade:duration={XFADE}:offset={off}{lab}")
        last = lab
    fc.append(f"{last}subtitles={os.path.join(work, 'cap.ass')}[vout]")
    final = os.path.join(work, "novela.mp4")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", *inputs, "-i", wav, "-filter_complex", ";".join(fc), "-map", "[vout]", "-map", f"{len(parts)}:a",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-shortest", final],
        check=True, timeout=600,
    )
    tm["render_ms"] = int((time.time() - tr) * 1000)
    data = open(final, "rb").read()
    wall = time.time() - T0
    cpu_usd = wall * (4 * PRICE["CPU_CORE"] + 4 * PRICE["MEM_GIB"])
    gpu_usd = sum(gpu_s[g] * PRICE[g] for g in gpu_s)
    # Ociosidade: cada app GPU acordado fica 120 s ligado depois do último pedido (pior caso, novela isolada).
    idle_usd = 120 * (PRICE["L4"] + PRICE["L40S"] + (PRICE["A10G"] if tm.get("script_model") == "vertal-coder-gpu" else 0))
    cost = {
        "cpu_usd": round(cpu_usd, 5), "gpu_active_usd": round(gpu_usd, 5), "idle_worst_usd": round(idle_usd, 5),
        "total_warm_usd": round(cpu_usd + gpu_usd, 5), "total_isolated_usd": round(cpu_usd + gpu_usd + idle_usd, 5),
        "gpu_seconds": {k: round(v, 1) for k, v in gpu_s.items()},
    }
    state[job] = {
        "status": "completed", "stage": "done", "titulo": script["titulo"], "seconds": round(total, 1), "scenes": len(scenes),
        "bytes": len(data), "timings": {**tm, "wall_ms": int(wall * 1000)}, "cost": cost,
    }
    print(json.dumps(state[job], ensure_ascii=False))
    return data


@app.function(image=image, secrets=SECRETS, scaledown_window=60, max_containers=1)
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def web():
    import secrets as _s
    import uuid

    from fastapi import FastAPI, HTTPException, Request, Response

    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    token = os.environ["VERTAL_NOVELA_TOKEN"]

    def auth(req: Request):
        if not _s.compare_digest(req.headers.get("authorization", ""), f"Bearer {token}"):
            raise HTTPException(status_code=401, detail="unauthorized")

    def lookup(cid: str):
        if not re.fullmatch(r"fc-[A-Za-z0-9]+", cid or ""):
            raise HTTPException(status_code=404, detail="job_not_found")
        try:
            return modal.FunctionCall.from_id(cid)
        except Exception:
            raise HTTPException(status_code=404, detail="job_not_found")

    @api.post("/submit")
    def submit(req: Request, body: dict):
        auth(req)
        premise = str(body.get("premise") or body.get("prompt") or "").strip()[:1200]
        if len(premise) < 8:
            raise HTTPException(status_code=400, detail="empty_premise")
        n = max(4, min(14, int(body.get("scenes") or 12)))
        clips = max(0, min(3, int(body.get("clips") or 0)))
        job = uuid.uuid4().hex
        fc = make.spawn(job, premise, str(body.get("voice") or "pf_dora"), n, clips)
        state[fc.object_id] = job
        state[job] = {"status": "pending", "stage": "queued"}
        return {"id": fc.object_id, "status": "pending"}

    @api.get("/status")
    def status(req: Request, id: str):
        auth(req)
        fc = lookup(id)
        job = state.get(id)
        info = state.get(job, {}) if job else {}
        try:
            fc.get(timeout=0)
            return {**info, "status": "completed"}
        except TimeoutError:
            return {"status": "pending", "stage": info.get("stage")}
        except modal.exception.OutputExpiredError:
            return {"status": "expired"}
        except Exception as e:  # noqa: BLE001
            return {"status": "failed", "error": "premise_rejected" if "premise_rejected" in str(e) else "novela_failed"}

    @api.get("/result")
    def result(req: Request, id: str):
        auth(req)
        try:
            data = lookup(id).get(timeout=0)
        except TimeoutError:
            raise HTTPException(status_code=409, detail="pending")
        except Exception:
            raise HTTPException(status_code=409, detail="failed")
        return Response(content=data, media_type="video/mp4", headers={"Cache-Control": "private, max-age=3600"})

    @api.post("/tts")
    def tts(req: Request, body: dict):
        auth(req)
        text = str(body.get("text") or "").strip()[:2000]
        if not text:
            raise HTTPException(status_code=400, detail="empty_text")
        wav = Voice().speak.remote(text, str(body.get("voice") or "pf_dora"))
        return Response(content=wav, media_type="audio/wav")

    return api

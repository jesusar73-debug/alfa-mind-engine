"""Concurso de voces de OpenRouter para reemplazar la voz de la app.

Cada muestra se arma COMO LA APP: cada frase y cada número se piden por separado
(una llamada cada uno), se recortan sus silencios y se unen con pausas exactas.
Así se oye si la voz cambia de tono entre frases o dice raro un número suelto.

La clave se lee de .env (OPENROUTER_API_KEY=...), nunca del código ni del chat.
Mide el gasto real con /api/v1/credits antes y después.

Uso:  .venv\\Scripts\\python tools\\voice_shootout.py
Salida: samples/voces-openrouter/<n>-<nombre>.mp3
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "openrouter-tts"
OUT = ROOT / "samples" / "voces-openrouter-ronda3"
API = "https://openrouter.ai/api/v1"
SR = 24000

GUIA = (
    "Eres una guía de meditación. Habla en español latinoamericano neutro, con voz femenina "
    "suave, amorosa y cálida, cercana, casi en un susurro pero clara. Habla muy despacio, "
    "con pausas largas y respiración tranquila. Sin entusiasmo, sin dramatismo."
)

# Ronda 3 (30-oct): Jesus eligió Matilda (ElevenLabs v4) pero con menos aliento/susurro.
# "filtro": cadena extra de ffmpeg por frase (agate = baja el ruido de respiración entre palabras).
EL = "elevenlabs/eleven-v4"
CANDIDATOS = [
    {"nombre": "M1-matilda-natural", "modelo": EL, "voz": "matilda", "instr": None, "tempo": 0.88},
    {"nombre": "M2-matilda-calm", "modelo": EL, "voz": "matilda", "instr": None, "tempo": 0.88, "prefijo": "[calm] "},
    {"nombre": "M3-matilda-natural-sin-aliento", "modelo": EL, "voz": "matilda", "instr": None, "tempo": 0.88,
     "filtro": "agate=threshold=0.025:ratio=4:range=0.12:attack=4:release=140"},
]

# Frases reales de la app (intro y Sintonía 10), cada una con su pausa en segundos.
FRASES = [
    ("Te doy la bienvenida. Este es tu momento para descansar la mente.", 1.5),
    ("Cierra los ojos con suavidad.", 2.0),
    ("Inhala despacio por la nariz.", 3.0),
    ("Y exhala lentamente, soltando todo el aire.", 2.0),
    ("Ahora vas a descender a un nivel más profundo de relajación.", 1.5),
]
# Números sueltos, como en la cuenta regresiva (cada uno es una llamada aparte).
NUMEROS = ["Veinticinco.", "Siete, más profundo.", "Cuatro.", "Uno."]
CIERRE = ("Estás en un estado profundo y tranquilo.", 1.0)


def api_key() -> str:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
                if key:
                    return key
    sys.exit("Falta la clave: pon OPENROUTER_API_KEY=... en el archivo .env de la carpeta del proyecto.")


def request(path: str, key: str, body: dict | None = None) -> bytes:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} en {path}: {e.read()[:400].decode('utf-8', 'replace')}") from None


def credits(key: str) -> float:
    d = json.loads(request("/credits", key))["data"]
    return float(d["total_credits"]) - float(d["total_usage"])


def speak(key: str, model: str, voice: str | None, text: str, instructions: str | None, tempo: float = 1.0, prefix: str = "", filtro: str = "") -> np.ndarray:
    # Gemini y HeyGen solo devuelven PCM crudo (16 bits, 24 kHz, mono).
    fmt = "pcm" if model.startswith(("google/", "heygen/")) else "mp3"
    body = {"model": model, "input": prefix + text, "response_format": fmt}
    if voice:
        body["voice"] = voice
    if instructions:
        body["instructions"] = instructions
    h = hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()
    clip = CACHE / f"{h}.{fmt}"
    if not clip.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        clip.write_bytes(request("/audio/speech", key, body))
    src = ["-f", "s16le", "-ar", "24000", "-ac", "1", "-i", str(clip)] if fmt == "pcm" else ["-i", str(clip)]
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", *src, *(["-af", ",".join(x for x in [f"atempo={tempo}" if tempo != 1 else "", filtro] if x)] if (tempo != 1 or filtro) else []),
         "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return trim(np.frombuffer(raw, dtype="<f4").copy())


def trim(a: np.ndarray, db: float = -45) -> np.ndarray:
    idx = np.nonzero(np.abs(a) > 10 ** (db / 20))[0]
    if idx.size == 0:
        return a
    pad = int(0.02 * SR)
    return a[max(0, idx[0] - pad): idx[-1] + pad]


def silence(s: float) -> np.ndarray:
    return np.zeros(int(s * SR), dtype=np.float32)


def main() -> None:
    key = api_key()
    before = credits(key)
    print(f"Saldo antes: ${before:.4f}")
    OUT.mkdir(parents=True, exist_ok=True)
    for c in CANDIDATOS:
        name, model, voice, instr = c["nombre"], c["modelo"], c["voz"], c["instr"]
        extra = {"tempo": c.get("tempo", 1.0), "prefix": c.get("prefijo", ""), "filtro": c.get("filtro", "")}
        parts = [silence(0.5)]
        try:
            for text, pause in FRASES:
                parts += [speak(key, model, voice, text, instr, **extra), silence(pause)]
            for n in NUMEROS:  # la cuenta: un número cada 2.5 s, como en la app
                clip = speak(key, model, voice, n, instr, **extra)
                parts += [clip, silence(max(0.4, 3.0 - clip.size / SR))]
            text, pause = CIERRE
            parts += [speak(key, model, voice, text, instr, **extra), silence(pause)]
        except Exception as e:  # una voz que falla no detiene las demás
            print(f"  {name}: FALLÓ ({e})")
            continue
        audio = np.concatenate(parts)
        wav = CACHE / f"{name}.wav"
        pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
        import wave
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", "loudnorm=I=-18:TP=-1.5:LRA=7",
             "-ar", "44100", "-b:a", "128k", str(OUT / f"{name}.mp3")],
            check=True,
        )
        print(f"  OK {name}: {audio.size / SR:.0f} s")
    after = credits(key)
    print(f"Saldo después: ${after:.4f} · gastado: ${before - after:.4f}")


if __name__ == "__main__":
    main()

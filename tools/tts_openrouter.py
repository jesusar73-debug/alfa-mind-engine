"""Voz de OpenRouter para el pipeline (elegida el 30-oct-2026: ElevenLabs v4, Matilda, [calm]).

- Cada frase se pide una sola vez: el MP3 crudo queda en content/voice-cache/ (en git),
  así reconstruir la app no vuelve a cobrar ni cambia la voz (ElevenLabs no es determinista).
- La velocidad se ajusta después con ffmpeg atempo (sin cambiar el tono); cambiarla no cuesta.
- La clave se lee de .env (OPENROUTER_API_KEY=...). Nunca va en el código ni en git.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
API = "https://openrouter.ai/api/v1"

MODEL = "elevenlabs/eleven-v4"
VOICE = "matilda"
PREFIX = "[calm] "  # etiqueta de emoción de ElevenLabs: tono calmado, sin el susurro de [softly]
TEMPO = 0.82  # 18 % más lento que su ritmo natural (30-oct: Jesus la pidió más pausada)
PRICE_PER_CHAR = 0.00008  # USD, precio de OpenRouter el 30-oct-2026 (solo para estimar)

CACHE = ROOT / "content" / "voice-cache" / f"{MODEL.replace('/', '__')}__{VOICE}"

stats = {"calls": 0, "chars": 0}


def _key() -> str:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8-sig").splitlines():
            if line.strip().startswith("OPENROUTER_API_KEY="):
                k = line.split("=", 1)[1].strip().strip('"').strip("'")
                if k:
                    return k
    sys.exit("Falta OPENROUTER_API_KEY en .env (o usa AME_TTS=piper para la voz anterior).")


def _request(path: str, body: dict | None = None, tries: int = 5) -> bytes:
    for attempt in range(tries):
        req = urllib.request.Request(
            API + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"},
            method="POST" if body is not None else "GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode("utf-8", "replace")
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(2 ** attempt * 2)  # 2, 4, 8, 16 s
                continue
            raise RuntimeError(f"OpenRouter HTTP {e.code}: {msg}") from None
        except urllib.error.URLError:
            if attempt < tries - 1:
                time.sleep(2 ** attempt * 2)
                continue
            raise
    raise RuntimeError("OpenRouter: sin respuesta")


def balance() -> float | None:
    try:
        d = json.loads(_request("/credits"))["data"]
        return float(d["total_credits"]) - float(d["total_usage"])
    except Exception:
        return None


def raw_clip(text: str) -> Path:
    """MP3 crudo de la frase (de la caché, o pedido a OpenRouter una sola vez)."""
    body = {"model": MODEL, "voice": VOICE, "input": PREFIX + text, "response_format": "mp3"}
    h = hashlib.sha1(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
    path = CACHE / f"{h}.mp3"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_request("/audio/speech", body))
        stats["calls"] += 1
        stats["chars"] += len(body["input"])
        # Índice legible: qué texto es cada archivo.
        index = CACHE / "index.json"
        data = json.loads(index.read_text(encoding="utf-8")) if index.exists() else {}
        data[path.name] = text
        index.write_text(json.dumps(data, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")
    return path


def synth(text: str, sr: int, speed: float = 1.0) -> np.ndarray:
    """Audio float32 mono a `sr` Hz. speed > 1 lo acelera respecto al ritmo elegido (TEMPO)."""
    tempo = min(1.3, TEMPO * speed)
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(raw_clip(text)), "-af", f"atempo={tempo:.4f}",
         "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype="<f4").copy()


# ------------------------------------------------- números en palabras ----

_UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
             "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
             "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés",
             "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"]
_DECENAS = {3: "treinta", 4: "cuarenta", 5: "cincuenta", 6: "sesenta", 7: "setenta", 8: "ochenta", 9: "noventa"}


def numero_en_palabras(n: int) -> str:
    """1 → "uno", 25 → "veinticinco", 97 → "noventa y siete", 100 → "cien"."""
    if n == 100:
        return "cien"
    if 0 <= n < 30:
        return _UNIDADES[n]
    if 30 <= n < 100:
        d, u = divmod(n, 10)
        return _DECENAS[d] + (f" y {_UNIDADES[u]}" if u else "")
    raise ValueError(n)

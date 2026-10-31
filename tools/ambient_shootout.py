"""Prueba de sonidos de ambiente generados en OpenRouter (30-oct-2026).

Pide lluvia, río y viento a dos modelos y guarda lo que devuelven, para escuchar y elegir:
- bytedance-seed/seed-audio-1-0 (/audio/speech, el texto describe el sonido; $0.0025/s)
- google/lyria-3-clip-preview (/chat/completions con audio, clips de 30 s; $0.04/clip)

Uso:  .venv\\Scripts\\python -I tools\\ambient_shootout.py
Salida: samples/ambiente-openrouter/<modelo>-<sonido>.<ext>
"""
from __future__ import annotations

import base64
import json
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import tts_openrouter as tts  # noqa: E402  (clave, reintentos y saldo)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "samples" / "ambiente-openrouter"

COMMON = (
    "Continuous natural ambient soundscape for a meditation app, 30 seconds, steady and calm, "
    "even volume from start to end, no music, no melody, no voices, no birds singing loudly, no thunder."
)
SOUNDS = {
    "lluvia": "Gentle steady rain falling on leaves and on a wooden roof, soft close drops. " + COMMON,
    "rio": "A calm river flowing over smooth stones, gentle water bubbling and murmuring. " + COMMON,
    "viento": "Soft wind blowing slowly through tall trees, gentle rustling leaves, slow gusts. " + COMMON,
}


def seed(prompt: str) -> bytes:
    body = {"model": "bytedance-seed/seed-audio-1-0", "input": prompt, "response_format": "mp3"}
    return tts._request("/audio/speech", body)


def lyria(prompt: str) -> tuple[bytes, str]:
    """Lyria devuelve el audio por streaming (SSE) en trozos base64."""
    body = {
        "model": "google/lyria-3-clip-preview",
        "messages": [{"role": "user", "content": prompt}],
        "modalities": ["text", "audio"],
        "stream": True,
    }
    req = urllib.request.Request(
        tts.API + "/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {tts._key()}", "Content-Type": "application/json"},
    )
    chunks: list[str] = []
    fmt = "wav"
    with urllib.request.urlopen(req, timeout=300) as r:
        for line in r:
            line = line.decode("utf-8", "replace").strip()
            if not line.startswith("data:") or line == "data: [DONE]":
                continue
            evt = json.loads(line[5:])
            for ch in evt.get("choices", []):
                audio = (ch.get("delta") or {}).get("audio") or {}
                if audio.get("data"):
                    chunks.append(audio["data"])
                if audio.get("format"):
                    fmt = audio["format"]
    if not chunks:
        raise RuntimeError("Lyria no devolvió audio")
    return base64.b64decode("".join(chunks)), fmt


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    before = tts.balance()
    print(f"Saldo antes: ${before:.4f}")
    for name, prompt in SOUNDS.items():
        try:
            path = OUT / f"seed-{name}.mp3"
            if not path.exists():
                path.write_bytes(seed(prompt))
            print(f"  OK seed-{name}")
        except Exception as e:
            print(f"  seed-{name}: FALLÓ ({e})")
        try:
            done = list(OUT.glob(f"lyria-{name}.*"))
            if not done:
                data, fmt = lyria(prompt)
                (OUT / f"lyria-{name}.{fmt}").write_bytes(data)
            print(f"  OK lyria-{name}")
        except Exception as e:
            print(f"  lyria-{name}: FALLÓ ({e})")
    after = tts.balance()
    print(f"Saldo después: ${after:.4f} · gastado ≈ ${before - after:.4f} (puede tardar en reflejarse)")


if __name__ == "__main__":
    main()

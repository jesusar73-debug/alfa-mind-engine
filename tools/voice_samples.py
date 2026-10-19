"""Genera una muestra corta con cada voz de Piper para elegir la voz guía.

Uso (desde la raíz del proyecto):
    .venv\\Scripts\\python tools\\voice_samples.py
Salida: samples/<voz>.mp3
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICES_DIR = ROOT / ".voices"
OUT_DIR = ROOT / "samples"

TEXT = (
    "Cierra suavemente los ojos. "
    "Inhala despacio... y exhala. "
    "Tu cuerpo se relaja cada vez más. "
    "Diez. Nueve. Ocho."
)

# (nombre de archivo, modelo, id de hablante, config opcional)
# Las configs ".latam.json" usan pronunciación es-419 (seseo) con voces de España.
VOICES = [
    ("latam-davefx", "es_ES-davefx-medium", 0, "es_ES-davefx-medium.latam.json"),
    ("latam-sharvard-hablante0", "es_ES-sharvard-medium", 0, "es_ES-sharvard-medium.latam.json"),
    ("latam-sharvard-hablante1", "es_ES-sharvard-medium", 1, "es_ES-sharvard-medium.latam.json"),
    ("es_AR-daniela-high", "es_AR-daniela-high", 0, None),
]

LENGTH_SCALE = "1.25"


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    for name, model, speaker, config in VOICES:
        wav = OUT_DIR / f"{name}.wav"
        config_args = ["-c", str(VOICES_DIR / config)] if config else []
        subprocess.run(
            [
                sys.executable, "-m", "piper",
                "-m", str(VOICES_DIR / f"{model}.onnx"),
                *config_args,
                "-s", str(speaker),
                "--length-scale", LENGTH_SCALE,
                "--sentence-silence", "0.7",
                "-f", str(wav),
            ],
            input=TEXT.encode("utf-8"),
            check=True,
        )
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
                "-af", "loudnorm=I=-18:TP=-1.5:LRA=7",
                "-ac", "1", "-ar", "44100", "-b:a", "96k",
                str(OUT_DIR / f"{name}.mp3"),
            ],
            check=True,
        )
        wav.unlink()
        print("OK", name)


if __name__ == "__main__":
    main()

"""Ambientes reales de la app (elegidos por Jesus el 30-oct-2026), convertidos en bucles sin corte.

Fuentes (Wikimedia Commons, libres para uso comercial):
- lluvia: "Rain on leaves (Gravity Sound).wav" · Gravity Sound · CC BY 4.0
- rio:    "433589 jackthemurray stream-river-water-up-close.wav" · jackthemurray · CC0
- viento: "20090610 0 ambience.ogg" · nille · dominio público

Para cada uno: busca los LOOP_S segundos más parejos (sin golpes), funde el final sobre el
inicio (el bucle empalma sin corte), iguala el volumen y guarda FLAC mono a 32 kHz en
public/ambient/ (FLAC no agrega silencio al final como MP3, así el empalme es exacto).
También escribe public/ambient/credits.json con autor, licencia y enlace.

Uso:  npm run build:ambient   (descarga las fuentes si faltan, a .cache/ambient-src/)
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".cache" / "ambient-src"
OUT = ROOT / "public" / "ambient"
SR = 32000
LOOP_S = 40
SEAM_S = 4
TARGET_RMS = 0.10
UA = {"User-Agent": "alfa-mind-engine (jesusar73-debug; meditation app ambient sounds)"}

CHOSEN = {
    "lluvia": "File:Rain on leaves (Gravity Sound).wav",
    "rio": "File:433589 jackthemurray stream-river-water-up-close.wav",
    "viento": "File:20090610 0 ambience.ogg",
}


def http(url: str, timeout: int = 300) -> bytes:
    for i in range(6):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < 5:  # Wikimedia limita descargas seguidas
                time.sleep(int(e.headers.get("Retry-After") or 20 * (i + 1)))
                continue
            raise
    raise RuntimeError(url)


def sources() -> dict[str, dict]:
    """Metadatos (licencia, autor, enlace) y descarga de las fuentes que falten."""
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": "|".join(CHOSEN.values()), "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiextmetadatafilter": "LicenseShortName|Artist|LicenseUrl"})
    pages = {p["title"]: p["imageinfo"][0] for p in json.loads(http(url, 40))["query"]["pages"].values()}
    out = {}
    SRC.mkdir(parents=True, exist_ok=True)
    for kind, title in CHOSEN.items():
        ii = pages[title]
        md = ii["extmetadata"]
        path = SRC / f"{kind}.{title.rsplit('.', 1)[1]}"
        if not path.exists():
            time.sleep(8)
            path.write_bytes(http(ii["url"]))
        out[kind] = {
            "path": path,
            "title": title[5:],
            "author": re.sub("<[^>]+>", "", md.get("Artist", {}).get("value", "")).strip(),
            "license": md.get("LicenseShortName", {}).get("value", ""),
            "licenseUrl": md.get("LicenseUrl", {}).get("value", ""),
            "source": ii["descriptionurl"],
        }
    return out


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").copy()


def calmest(a: np.ndarray, seconds: float) -> int:
    """Inicio (en muestras) del tramo más parejo: poca variación de volumen y sin golpes."""
    hop = SR // 10
    env = 20 * np.log10(np.sqrt((a[: a.size // hop * hop].reshape(-1, hop) ** 2).mean(1)) + 1e-9)
    win = int(seconds * 10)
    best, start = 1e9, 0
    for i in range(0, max(1, env.size - win), 5):
        w = env[i:i + win]
        score = w.std() + max(0.0, w.max() - float(np.median(w)) - 6)
        if score < best:
            best, start = score, i
    return start * hop


def make_loop(a: np.ndarray) -> np.ndarray:
    """LOOP_S segundos con la unión fundida: el final empalma con el principio."""
    n, seam = LOOP_S * SR, SEAM_S * SR
    s = calmest(a, LOOP_S + SEAM_S)
    piece = a[s:s + n + seam]
    if piece.size < n + seam:
        raise RuntimeError("La grabación es más corta que el bucle")
    loop = piece[:n].copy()
    w = np.arange(seam) / seam
    loop[:seam] = piece[:seam] * np.sin(w * np.pi / 2) + piece[n:n + seam] * np.cos(w * np.pi / 2)
    loop -= loop.mean()
    loop *= TARGET_RMS / max(1e-6, float(np.sqrt((loop ** 2).mean())))
    peak = float(np.abs(loop).max())
    if peak > 0.95:  # limita picos (gotas fuertes) sin cambiar el volumen general
        loop = np.tanh(loop / 0.95) * 0.95
    return loop.astype(np.float32)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    credits = {}
    for kind, info in sources().items():
        loop = make_loop(decode(info["path"]))
        pcm = (np.clip(loop, -1, 1) * 32767).astype("<i2").tobytes()
        dest = OUT / f"{kind}.flac"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
                        "-c:a", "flac", "-compression_level", "8", str(dest)], input=pcm, check=True)
        seam_jump = abs(float(loop[0]) - float(loop[-1]))
        print(f"OK {kind}: {dest.stat().st_size / 1e6:.2f} MB · {LOOP_S} s · salto en la unión {seam_jump:.4f} · {info['license']}")
        credits[kind] = {k: v for k, v in info.items() if k != "path"} | {"changes": f"Recortado a {LOOP_S} s, en bucle y nivelado."}
    (OUT / "credits.json").write_text(json.dumps(credits, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()

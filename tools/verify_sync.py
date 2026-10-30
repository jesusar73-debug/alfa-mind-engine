"""Verifica la sincronía real entre el MP3 final y su timeline.

Decodifica cada cuenta regresiva (tal como queda tras codificar a MP3) y busca
el inicio real de la voz cerca de cada número hablado. Falla si alguna deriva
supera 300 ms.

Uso:  npm run verify:sync
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "public" / "audio"
LIMIT_MS = 300
FRAME_S = 0.005
THRESHOLD_DB = -40.0


def decode(path: Path, sr: int = 22050) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype="<f4")


def onset(audio: np.ndarray, sr: int, t: float) -> float | None:
    """Primer frame con voz en la ventana [t-0.4, t+0.6]."""
    frame = int(FRAME_S * sr)
    a, b = max(0, int((t - 0.4) * sr)), min(audio.size, int((t + 0.6) * sr))
    win = audio[a:b]
    thr = 10 ** (THRESHOLD_DB / 20)
    for i in range(0, win.size - frame, frame):
        if np.sqrt(np.mean(win[i:i + frame] ** 2)) > thr:
            return (a + i) / sr
    return None


def main() -> None:
    manifest = json.loads((AUDIO / "manifest.json").read_text(encoding="utf-8"))
    ids = sys.argv[1:] or [k for k, s in manifest["segments"].items() if any(e["kind"] == "number" and e.get("spoken") for e in s["events"])]
    worst_all = 0.0
    failed = False
    for sid in ids:
        seg = manifest["segments"][sid]
        audio = decode(ROOT / "public" / seg["file"])
        drifts = []
        for ev in seg["events"]:
            if ev["kind"] == "number" and ev.get("spoken"):
                found = onset(audio, 22050, ev["t"])
                if found is None:
                    print(f"  {sid}: no encontré voz para el número {ev['value']}")
                    failed = True
                    continue
                drifts.append((found - ev["t"]) * 1000)
        worst = max(abs(d) for d in drifts)
        worst_all = max(worst_all, worst)
        status = "OK " if worst < LIMIT_MS else "MAL"
        failed |= worst >= LIMIT_MS
        print(f"{status} {sid}: {len(drifts)} números, deriva media {np.mean(drifts):+.0f} ms, máxima {worst:.0f} ms")
    print(f"\nDeriva máxima: {worst_all:.0f} ms (límite {LIMIT_MS} ms)")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

"""Pipeline de audio de Alfa Mind Engine.

Lee content/scripts/*.json y content/levels.json, sintetiza cada frase con Piper,
arma cada segmento con silencios exactos (a nivel de muestra), normaliza a -18 LUFS,
codifica MP3 mono y escribe public/audio/manifest.json con los tiempos reales.

Uso:  npm run build:audio
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import wave
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
SCRIPTS = CONTENT / "scripts"
VOICES_DIR = ROOT / ".voices"
CACHE = ROOT / ".cache" / "tts"
TMP = ROOT / ".cache" / "build"
OUT = ROOT / "public" / "audio"

VOICE = "es_AR-daniela-high"
LENGTH_SCALE = 1.67          # velocidad elegida ("B")
MIN_LENGTH_SCALE = 1.0       # límite al acelerar números largos para que quepan
BITRATE = "64k"
TARGET_LUFS = -18.0
LEAD_IN_S = 0.6              # silencio al inicio de cada archivo
FADE_IN_S = 0.25
FADE_OUT_S = 0.6
NUMBER_FIT = 0.85            # un número debe durar <= 85 % del intervalo
ENCODER_DELAY_S = 0.050       # retardo de LAME (1105 muestras a 22 050 Hz), medido con npm run verify:sync
TRIM_DB = -45.0              # umbral para recortar silencio de cada frase


# ---------------------------------------------------------------- TTS ----

_voice = None


def voice():
    global _voice
    if _voice is None:
        from piper import PiperVoice

        model = VOICES_DIR / f"{VOICE}.onnx"
        if not model.exists():
            sys.exit(
                f"Falta la voz {VOICE}. Descárgala con:\n"
                f"  .venv\\Scripts\\python -m piper.download_voices {VOICE} --data-dir .voices"
            )
        _voice = PiperVoice.load(str(model))
    return _voice


def sample_rate() -> int:
    return voice().config.sample_rate


def synth(text: str, length_scale: float = LENGTH_SCALE) -> np.ndarray:
    """Devuelve audio float32 mono, recortado de silencios, con caché en disco."""
    key = hashlib.sha1(f"{VOICE}|{length_scale:.3f}|{text}".encode()).hexdigest()
    cached = CACHE / f"{key}.npy"
    if cached.exists():
        return np.load(cached)
    from piper import SynthesisConfig

    cfg = SynthesisConfig(length_scale=length_scale)
    chunks = [c.audio_float_array for c in voice().synthesize(text, syn_config=cfg)]
    audio = trim(np.concatenate(chunks).astype(np.float32))
    CACHE.mkdir(parents=True, exist_ok=True)
    np.save(cached, audio)
    return audio


def trim(audio: np.ndarray) -> np.ndarray:
    thr = 10 ** (TRIM_DB / 20)
    idx = np.nonzero(np.abs(audio) > thr)[0]
    if idx.size == 0:
        return audio
    pad = int(0.02 * sample_rate())
    return audio[max(0, idx[0] - pad): idx[-1] + pad]


# ------------------------------------------------------------ armado ----

@dataclass
class Segment:
    id: str
    phase: str
    sr: int
    parts: list = field(default_factory=list)
    length: int = 0           # muestras acumuladas
    events: list = field(default_factory=list)

    def t(self) -> float:
        return round(self.length / self.sr, 3)

    def add(self, audio: np.ndarray) -> None:
        self.parts.append(audio)
        self.length += audio.size

    def silence(self, seconds: float) -> None:
        self.add(np.zeros(int(round(seconds * self.sr)), dtype=np.float32))

    def pad_to(self, seconds: float) -> None:
        target = int(round(seconds * self.sr))
        if target < self.length:
            raise ValueError(f"{self.id}: se pasó del tiempo objetivo {seconds}s")
        self.add(np.zeros(target - self.length, dtype=np.float32))

    def audio(self) -> np.ndarray:
        return np.concatenate(self.parts) if self.parts else np.zeros(1, np.float32)


def build_script(script_id: str, phase: str) -> Segment:
    data = json.loads((SCRIPTS / f"{script_id}.json").read_text(encoding="utf-8"))
    seg = Segment(script_id, phase, sample_rate())
    seg.silence(LEAD_IN_S)
    seg.events.append({"t": 0, "kind": "phase", "value": phase})
    for frase in data["frases"]:
        clip = synth(frase["texto"])
        start = seg.t()
        dur = clip.size / seg.sr
        pause = frase.get("pausa_ms", 0) / 1000
        seg.events.append({"t": start, "kind": "say", "text": frase["texto"], "dur": round(dur, 3)})
        if "respiracion" in frase:
            seg.events.append({"t": start, "kind": "breath", "value": frase["respiracion"],
                               "dur": round(dur + pause, 3)})
        if "numero" in frase:
            seg.events.append({"t": start, "kind": "number", "value": frase["numero"], "spoken": True})
        seg.add(clip)
        seg.silence(pause)
    return seg


def fit_number(n: int, interval: float) -> np.ndarray:
    """Sintetiza un número; si no cabe en el intervalo, lo dice más rápido."""
    text = f"{n}."
    clip = synth(text)
    limit = interval * NUMBER_FIT
    scale = LENGTH_SCALE
    while clip.size / sample_rate() > limit and scale > MIN_LENGTH_SCALE:
        scale = max(MIN_LENGTH_SCALE, round(scale * limit / (clip.size / sample_rate()) - 0.02, 3))
        clip = synth(text, scale)
    if clip.size / sample_rate() > interval - 0.1:
        raise ValueError(f"El número {n} no cabe en {interval}s ni acelerado.")
    return clip


def says(n: int, start: int, every: int) -> bool:
    return every == 1 or n == start or n == 1 or n % every == 0


def build_countdown(start: int, interval: float, every: int) -> Segment:
    seg = Segment(countdown_id(start, interval, every), "countdown", sample_rate())
    seg.silence(LEAD_IN_S)
    seg.events.append({"t": 0, "kind": "phase", "value": "countdown"})
    lead = f"Ahora cuenta conmigo, en silencio, desde {start}."
    seg.events.append({"t": seg.t(), "kind": "say", "text": lead})
    seg.add(synth(lead))
    seg.silence(1.5)
    t0 = seg.length / seg.sr
    for k, n in enumerate(range(start, 0, -1)):
        onset = t0 + k * interval
        seg.pad_to(onset)
        spoken = says(n, start, every)
        seg.events.append({"t": round(onset, 3), "kind": "number", "value": n, "spoken": spoken})
        if spoken:
            seg.add(fit_number(n, interval))
    seg.pad_to(t0 + start * interval + 1.0)
    return seg


def countdown_id(start: int, interval: float, every: int) -> str:
    return f"cd-{start}-{int(interval)}-{every}"


# ----------------------------------------------------------- ffmpeg ----

def write_wav(path: Path, audio: np.ndarray, sr: int, channels: int = 1) -> None:
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def measure_lufs(path: Path) -> float:
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr)
    if not m:
        raise RuntimeError(f"No pude medir loudness de {path}:\n{r.stderr[-800:]}")
    return float(m[-1])


def encode(seg: Segment) -> dict:
    audio = seg.audio()
    n_in, n_out = int(FADE_IN_S * seg.sr), int(FADE_OUT_S * seg.sr)
    audio[:n_in] *= np.linspace(0, 1, n_in, dtype=np.float32)
    audio[-n_out:] *= np.linspace(1, 0, n_out, dtype=np.float32)
    wav = TMP / f"{seg.id}.wav"
    write_wav(wav, audio, seg.sr)
    gain = TARGET_LUFS - measure_lufs(wav)
    mp3 = OUT / f"{seg.id}.mp3"
    # MP3 "crudo" (sin ID3 ni cabecera Xing/LAME): así la app puede unir los
    # segmentos de una sesión en un solo archivo continuo sin cortes.
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
         "-af", f"volume={gain:.2f}dB,alimiter=limit=0.89:level=false",
         "-ac", "1", "-ar", str(seg.sr), "-c:a", "libmp3lame", "-b:a", BITRATE,
         "-write_xing", "0", "-id3v2_version", "0", "-write_id3v1", "0", str(mp3)],
        check=True,
    )
    # Sin cabecera, el reproductor no recorta el retardo del codificador:
    # la duración real es (cuadros × muestras por cuadro) y la voz se corre ENCODER_DELAY_S.
    frames = int(subprocess.run(
        ["ffprobe", "-v", "error", "-count_packets", "-select_streams", "a:0",
         "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(mp3)],
        capture_output=True, text=True, check=True,
    ).stdout.strip())
    samples_per_frame = 1152 if seg.sr >= 32000 else 576
    events = [{**e, "t": round(e["t"] + ENCODER_DELAY_S, 3)} if e["t"] > 0 else e for e in seg.events]
    return {
        "file": f"audio/{mp3.name}",
        "phase": seg.phase,
        "duration": round(frames * samples_per_frame / seg.sr, 4),
        "bytes": mp3.stat().st_size,
        "events": events,
    }



# -------------------------------------------------------------- main ----

def main() -> None:
    levels = json.loads((CONTENT / "levels.json").read_text(encoding="utf-8"))
    modules = json.loads((CONTENT / "modules.json").read_text(encoding="utf-8"))

    script_ids = set(modules["conditioning"]["segments"])
    for tool in modules["tools"]:
        script_ids |= set(tool["segments"]) | set(tool.get("segmentsAwake", []))
    script_ids.discard("countdown")

    starts = sorted({lv["from"] for lv in levels["levels"]} | {levels["toolCountdownFrom"]}, reverse=True)
    jobs: list[tuple[str, callable]] = []
    for sid in sorted(script_ids):
        phase = "exit" if sid == "salida" else "intro" if sid.startswith("intro") else "content"
        jobs.append((sid, lambda sid=sid, phase=phase: build_script(sid, phase)))
    for start in starts:
        for interval in levels["intervals"]:
            for every in levels["sayEvery"]:
                if start <= 10 and every != 1:
                    continue  # en cuentas cortas siempre se dice cada número
                jobs.append((countdown_id(start, interval, every),
                             lambda s=start, i=interval, e=every: build_countdown(s, i, e)))

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    TMP.mkdir(parents=True, exist_ok=True)

    segments = {}
    for i, (sid, job) in enumerate(jobs, 1):
        print(f"[{i}/{len(jobs)}] {sid}", flush=True)
        segments[sid] = encode(job())

    total = sum(s["bytes"] for s in segments.values())
    manifest = {
        "voice": VOICE,
        "lengthScale": LENGTH_SCALE,
        "bitrate": BITRATE,
        "totalBytes": total,
        "segments": segments,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    minutes = sum(s["duration"] for s in segments.values()) / 60
    print(f"\nListo: {len(segments)} archivos, {minutes:.1f} min de voz, {total / 1e6:.1f} MB en total.")
    if total > 60e6:
        print("AVISO: se pasa del presupuesto de 60 MB. Baja BITRATE.")


if __name__ == "__main__":
    main()

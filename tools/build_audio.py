"""Pipeline de audio de Alfa Mind Engine.

Lee content/scripts/*.json y content/levels.json, sintetiza cada frase con la voz elegida
(OpenRouter · ElevenLabs v4 Matilda; o Piper con AME_TTS=piper),
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

sys.stdout.reconfigure(encoding="utf-8")  # la consola de Windows no imprime ≈ ni acentos por defecto
sys.path.insert(0, str(Path(__file__).resolve().parent))
import tts_openrouter  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
SCRIPTS = CONTENT / "scripts"
VOICES_DIR = ROOT / ".voices"
CACHE = ROOT / ".cache" / "tts"
TMP = ROOT / ".cache" / "build"
OUT = ROOT / "public" / "audio"

# Motor de voz: "openrouter" (Matilda, desde el 30-oct-2026) o "piper" (Daniela, la voz anterior).
import os  # noqa: E402
ENGINE = os.environ.get("AME_TTS", "openrouter")
SR = 22050                   # todo el audio de voz a 22 050 Hz (el retardo del codificador se midió así)
VOICE = "es_AR-daniela-high"
LENGTH_SCALE = 1.67          # velocidad de Piper elegida ("B")
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
    return SR


DURATIONS: list[tuple[str, float]] = []  # (texto, segundos) para detectar clips raros


def synth(text: str, speed: float = 1.0) -> np.ndarray:
    """Audio float32 mono a SR, recortado de silencios. speed > 1 lo dice más rápido (para que quepa)."""
    if ENGINE == "openrouter":
        audio = trim(tts_openrouter.synth(text, SR, speed))
        if speed == 1.0:
            DURATIONS.append((text, audio.size / SR))
        return audio
    return synth_piper(text, max(MIN_LENGTH_SCALE, LENGTH_SCALE / speed))


def synth_piper(text: str, length_scale: float = LENGTH_SCALE) -> np.ndarray:
    """Voz anterior (Piper, Daniela). Con caché en disco."""
    key = hashlib.sha1(f"{VOICE}|{length_scale:.3f}|{text}".encode()).hexdigest()
    cached = CACHE / f"{key}.npy"
    if cached.exists():
        return np.load(cached)
    from piper import SynthesisConfig

    cfg = SynthesisConfig(length_scale=length_scale)
    chunks = [c.audio_float_array for c in voice().synthesize(text, syn_config=cfg)]
    audio = np.concatenate(chunks).astype(np.float32)
    if voice().config.sample_rate != SR:
        raise RuntimeError("La voz de Piper no está a 22 050 Hz")
    audio = trim(audio)
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


def add_frase(seg: Segment, frase: dict) -> None:
    """Agrega una frase y su pausa, con sus eventos (texto, respiración, número)."""
    # "voz": arreglo de pronunciación solo para Piper (p. ej. slide → eslaid); ElevenLabs lee el texto tal cual.
    clip = synth(frase.get("voz", frase["texto"]) if ENGINE == "piper" else frase["texto"])
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


def build_script(script_id: str, phase: str) -> Segment:
    data = json.loads((SCRIPTS / f"{script_id}.json").read_text(encoding="utf-8"))
    seg = Segment(script_id, phase, sample_rate())
    seg.silence(LEAD_IN_S)
    if "fases" in data:
        return build_phased(seg, data)
    seg.events.append({"t": 0, "kind": "phase", "value": phase})
    for frase in data["frases"]:
        add_frase(seg, frase)
    return seg


def build_phased(seg: Segment, data: dict) -> Segment:
    """Rutina con fases de inicio y fin fijos (p. ej. Sintonía 10).

    Cada fase empieza en su segundo exacto; "resto" rellena con silencio hasta su fin.
    Si la voz de una fase se pasa de su fin, la siguiente empieza al terminar la voz (se avisa).
    """
    for fase in data["fases"]:
        start = fase["inicio_s"]
        first = fase is data["fases"][0]
        if first:
            pass  # la primera fase empieza tras el breve silencio inicial del archivo
        elif seg.t() > start + 0.01:
            print(f"  AVISO {seg.id}: la fase '{fase['id']}' empieza {seg.t() - start:.1f} s tarde")
        else:
            seg.pad_to(start)
        t = 0 if first else seg.t()
        seg.events.append({"t": t, "kind": "phase", "value": fase["fase"]})
        seg.events.append({"t": t, "kind": "chapter", "value": fase["nombre"]})
        frases = fase["frases"]
        if fase.get("resto"):
            # Si voz + pausas no caben hasta el fin de la fase, se acortan las pausas (no la voz),
            # como mucho a la mitad, para que la fase siguiente empiece en su segundo exacto.
            habla = sum(synth(f.get("voz", f["texto"]) if ENGINE == "piper" else f["texto"]).size for f in frases) / seg.sr
            pausas = sum(f.get("pausa_ms", 0) for f in frases) / 1000
            libre = fase["fin_s"] - seg.t() - habla
            if pausas > 0 and libre < pausas:
                k = max(0.5, libre / pausas)
                print(f"  {seg.id}: pausas de '{fase['id']}' al {k * 100:.0f} % para que la fase quepa")
                frases = [{**f, "pausa_ms": f.get("pausa_ms", 0) * k} for f in frases]
        for frase in frases:
            add_frase(seg, frase)
        if seg.t() > fase["fin_s"] + 0.01:
            print(f"  AVISO {seg.id}: la voz de '{fase['id']}' termina {seg.t() - fase['fin_s']:.1f} s después de su fin")
        elif fase.get("resto"):
            seg.pad_to(fase["fin_s"])
    return seg


OVERFLOWS: list[str] = []  # números que no cupieron ni acelerados (se reportan al final)


def number_text(n: int) -> str:
    """Piper expande las cifras solo; ElevenLabs necesita las palabras (si no, puede leerlas en inglés)."""
    if ENGINE == "piper":
        return f"{n}."
    # "Once" y "Quince" también son palabras inglesas (once, quince = membrillo): solas, la voz
    # las leía en inglés. Con esta grafía solo se pueden leer en español (en pantalla no se ve).
    w = {11: "ónse", 15: "kínse"}.get(n) or tts_openrouter.numero_en_palabras(n)
    return w[0].upper() + w[1:] + "."


def fit_number(n: int, interval: float) -> np.ndarray:
    """Sintetiza un número; si no cabe en el intervalo, lo dice un poco más rápido (sin cambiar el tono)."""
    text = number_text(n)
    limit = interval * NUMBER_FIT
    clip = synth(text)
    for speed in (1.08, 1.16, 1.25, 1.35, 1.45):
        if clip.size / sample_rate() <= limit:
            break
        clip = synth(text, speed)
    if clip.size / sample_rate() > interval - 0.1:
        OVERFLOWS.append(f"{n} a {interval:g} s ({clip.size / sample_rate():.2f} s)")
        clip = clip[: int((interval - 0.1) * sample_rate())]  # recorte de emergencia; se reporta
    return clip


def says(n: int, start: int, every: int) -> bool:
    return every == 1 or n == start or n == 1 or n % every == 0


def build_countdown(start: int, interval: float, every: int) -> Segment:
    seg = Segment(countdown_id(start, interval, every), "countdown", sample_rate())
    seg.silence(LEAD_IN_S)
    seg.events.append({"t": 0, "kind": "phase", "value": "countdown"})
    lead = f"Ahora cuenta conmigo, en silencio, desde {number_text(start)[:-1].lower()}."
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

    before = tts_openrouter.balance() if ENGINE == "openrouter" else None
    if before is not None:
        print(f"Voz: OpenRouter {tts_openrouter.MODEL} · {tts_openrouter.VOICE} · saldo ${before:.4f}")
    segments = {}
    for i, (sid, job) in enumerate(jobs, 1):
        print(f"[{i}/{len(jobs)}] {sid}", flush=True)
        segments[sid] = encode(job())

    total = sum(s["bytes"] for s in segments.values())
    manifest = {
        "voice": VOICE if ENGINE == "piper" else f"{tts_openrouter.MODEL}:{tts_openrouter.VOICE}",
        "lengthScale": LENGTH_SCALE,
        "bitrate": BITRATE,
        "totalBytes": total,
        "segments": segments,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    minutes = sum(s["duration"] for s in segments.values()) / 60
    print(f"\nListo: {len(segments)} archivos, {minutes:.1f} min de voz, {total / 1e6:.1f} MB en total.")
    if ENGINE == "openrouter":
        st = tts_openrouter.stats
        print(f"OpenRouter: {st['calls']} frases nuevas, {st['chars']} caracteres "
              f"(≈ ${st['chars'] * tts_openrouter.PRICE_PER_CHAR:.2f}); el resto salió de la caché.")
        after = tts_openrouter.balance()
        if before is not None and after is not None:
            print(f"Saldo: ${before:.4f} → ${after:.4f} (puede tardar unos minutos en reflejarse)")
        # Clips raros: segundos por carácter muy distintos de la mediana (voz que lee de más o de menos).
        # Solo frases (≥ 12 letras), sin repetir: en palabras sueltas la pausa final pesa demasiado.
        rates = [(t, d / len(t)) for t, d in dict(DURATIONS).items() if len(t) >= 12]
        if rates:
            med = float(np.median([r for _, r in rates]))
            odd = [(t, r / med) for t, r in rates if r > 2 * med or r < 0.4 * med]
            for t, k in odd:
                print(f"  REVISAR: «{t}» dura {k:.1f}× lo normal")
    if OVERFLOWS:
        print("AVISO: números que no cupieron ni acelerados (se recortaron):", ", ".join(OVERFLOWS))
    if total > 60e6:
        print("AVISO: se pasa del presupuesto de 60 MB. Baja BITRATE.")


if __name__ == "__main__":
    main()

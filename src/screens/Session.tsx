import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioSession, VisualClock, type Clock } from '../audio/engine';
import { stateAt, type TimelineState } from '../audio/timeline';
import type { AudioManifest, PlannedSegment, TimelineEvent } from '../audio/types';
import { BreathOrb } from '../components/BreathOrb';
import { Button, Slider, Toggle } from '../components/ui';
import { conditioningSpec, flattenEvents, LEVELS, planSegments, TOOLS, toolSpec, type SessionSpec } from '../data/content';
import { useManifest } from '../data/useManifest';
import { t, tl } from '../i18n';
import { keepScreenOn, setMediaSession, setMediaState } from '../platform/device';
import { diagStart } from '../platform/diag';
import { navigate } from '../router';
import { markConditioningComplete, markToolComplete, streak, useProgress } from '../state/progress';
import { getSettings, useSettings } from '../state/settings';

type Status = 'prep' | 'loading' | 'running' | 'done' | 'error';

declare global {
  interface Window {
    __ame?: { clock: Clock; events: TimelineEvent[]; session: AudioSession | null; segments: PlannedSegment[] };
  }
}

function debugEnabled() {
  try {
    return localStorage.getItem('ame.debug') === '1';
  } catch {
    return false;
  }
}

export function SessionScreen({ kind, id }: { kind: 'acond' | 'tool'; id: string }) {
  const [settings, updateSettings] = useSettings();
  const manifest = useManifest();
  const progress = useProgress();

  const level = kind === 'acond' ? LEVELS.find((l) => l.id === id) : undefined;
  const tool = kind === 'tool' ? TOOLS.find((x) => x.id === id) : undefined;

  const [status, setStatus] = useState<Status>('prep');
  const [loadPct, setLoadPct] = useState(0);
  const [visualOnly, setVisualOnly] = useState(false);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<TimelineState | null>(null);
  const [fraction, setFraction] = useState(0);
  const [eyesClosed, setEyesClosed] = useState(false);
  const [showVolumes, setShowVolumes] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [suspendedNotice, setSuspendedNotice] = useState(false);

  const sessionRef = useRef<AudioSession | null>(null);
  const clockRef = useRef<Clock | null>(null);
  const eventsRef = useRef<TimelineEvent[]>([]);
  const specRef = useRef<SessionSpec | null>(null);
  const segmentsRef = useRef<PlannedSegment[]>([]);
  const finishedRef = useRef(false);

  const spec = useMemo<SessionSpec | null>(() => {
    if (level) return conditioningSpec(level, settings.interval, settings.sayEvery);
    if (tool) return toolSpec(tool, settings.interval, settings.sleepDirect);
    return null;
  }, [level, tool, settings.interval, settings.sayEvery, settings.sleepDirect]);

  // ---------------------------------------------------------- final ----
  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const s = specRef.current;
    if (s?.kind === 'conditioning' && s.levelId) markConditioningComplete(s.levelId);
    if (s?.kind === 'tool' && s.toolId) markToolComplete(s.toolId);
    setStatus('done');
    setEyesClosed(false);
    keepScreenOn(false);
    setMediaState('none');
  }, []);

  // --------------------------------------------- bucle de la interfaz ----
  // La pantalla se dibuja leyendo el reloj del AUDIO (audio.currentTime).
  useEffect(() => {
    if (status !== 'running') return;
    let raf = 0;
    let lastKey = '';
    const tick = () => {
      const clock = clockRef.current;
      if (clock) {
        const now = clock.time();
        const st = stateAt(eventsRef.current, now);
        const key = `${st.phase}|${st.number}|${st.caption}|${st.breath?.start}`;
        if (key !== lastKey) {
          lastKey = key;
          setView(st);
        }
        setFraction(now / clock.totalDuration);
        if (clock instanceof VisualClock && now >= clock.totalDuration) finish();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, finish]);

  // Limpieza al salir de la pantalla.
  useEffect(
    () => () => {
      sessionRef.current?.stop();
      keepScreenOn(false);
      setMediaSession('', null);
    },
    [],
  );

  // ------------------------------------------------------- controles ----
  const pause = useCallback(() => {
    const c = clockRef.current;
    if (sessionRef.current) sessionRef.current.pause();
    else if (c instanceof VisualClock) c.pause();
    setPaused(true);
    setMediaState('paused');
  }, []);

  const resume = useCallback(() => {
    const c = clockRef.current;
    if (sessionRef.current) {
      // Si el sistema no deja reanudar, el botón vuelve a "Continuar".
      sessionRef.current.resume().catch(() => {
        setPaused(true);
        setMediaState('paused');
      });
    } else if (c instanceof VisualClock) c.resume();
    setPaused(false);
    setMediaState('playing');
  }, []);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    keepScreenOn(false);
    setMediaSession('', null);
    navigate('/');
  }, []);

  const startVisual = useCallback((segments: PlannedSegment[]) => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    const total = segments[segments.length - 1].offset + segments[segments.length - 1].duration;
    const clock = new VisualClock(total);
    clockRef.current = clock;
    clock.start();
    setVisualOnly(true);
    setStatus('running');
    keepScreenOn(true);
  }, []);

  const start = useCallback(async () => {
    if (!spec || !manifest) return;
    specRef.current = spec;
    const current = getSettings();
    let segments: PlannedSegment[];
    try {
      segments = planSegments(spec, manifest as AudioManifest);
    } catch {
      setStatus('error');
      return;
    }
    segmentsRef.current = segments;
    eventsRef.current = flattenEvents(segments);
    // Se crea dentro del toque en "Iniciar" para que Android permita el audio.
    const session = new AudioSession(segments, manifest, current, spec.sleep);
    sessionRef.current = session;
    clockRef.current = session;
    if (debugEnabled()) window.__ame = { clock: session, events: eventsRef.current, session, segments };
    session.onFinished = finish;
    session.onSuspended = () => setSuspendedNotice(true);
    session.onExternalPause = () => {
      setPaused(true);
      setMediaState('paused');
    };
    session.onExternalResume = () => {
      setPaused(false);
      setMediaState('playing');
    };
    diagStart(spec.title);
    setStatus('loading');
    try {
      await session.load(setLoadPct);
      await session.start();
    } catch (err) {
      console.error(err);
      session.stop();
      sessionRef.current = null;
      setStatus('error');
      return;
    }
    setStatus('running');
    keepScreenOn(true);
    setMediaSession(spec.title, { play: resume, pause, stop });
    setMediaState('playing');
  }, [spec, manifest, finish, pause, resume, stop]);

  // ------------------------------------------------------------ vistas ----
  if (!spec) {
    return (
      <div className="safe-top p-6">
        <p>No encontré esa sesión.</p>
        <Button className="mt-4" onClick={() => navigate('/')}>
          {t('session.back')}
        </Button>
      </div>
    );
  }

  if (status === 'prep' || status === 'loading') {
    const toneOn = settings.toneEnabled;
    return (
      <div className="safe-top safe-bottom mx-auto flex h-full max-w-lg flex-col px-5">
        <button type="button" onClick={() => navigate(kind === 'tool' ? '/herramientas' : '/')} className="-ml-2 min-h-12 self-start px-2 text-muted">
          ‹ {t('session.back')}
        </button>
        <div className="flex-1 overflow-y-auto">
          <h1 className="mt-2 text-2xl font-semibold">{spec.title}</h1>
          <h2 className="mt-6 text-sm uppercase tracking-widest text-indigo">{t('session.prepTitle')}</h2>
          <ol className="mt-3 space-y-3">
            {[...(tool?.instructions ?? []), ...tl('session.prep')].map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card text-xs text-muted">{i + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
          {toneOn && settings.toneMode === 'binaural' && (
            <p className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-200">🎧 {t('session.binauralWarning')}</p>
          )}
          {tool?.sleepOption && (
            <div className="mt-4 rounded-2xl bg-card px-4">
              <Toggle label={t('session.sleepDirect')} checked={settings.sleepDirect} onChange={(v) => updateSettings({ sleepDirect: v })} />
            </div>
          )}
        </div>
        <Button variant="primary" className="mt-4 min-h-16 w-full text-xl" disabled={!manifest || status === 'loading'} onClick={() => void start()}>
          {status === 'loading' ? t('session.loading', { pct: Math.round(loadPct * 100) }) : t('session.start')}
        </Button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="safe-top safe-bottom mx-auto flex h-full max-w-lg flex-col justify-center gap-4 px-6 text-center">
        <p className="text-lg">{t('session.audioError')}</p>
        <Button
          variant="primary"
          disabled={!segmentsRef.current.length}
          onClick={() => startVisual(segmentsRef.current)}
        >
          {t('session.visualMode')}
        </Button>
        <Button onClick={() => navigate('/')}>{t('session.back')}</Button>
      </div>
    );
  }

  if (status === 'done') {
    const s = streak(progress);
    return (
      <div className="safe-top safe-bottom mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-6 px-6 text-center" data-testid="session-done">
        <BreathOrb breath={null} size="sm" />
        <h1 className="text-3xl font-semibold">{t('session.doneTitle')}</h1>
        <p className="text-muted">
          {spec.sleep
            ? t('session.doneSleep')
            : spec.kind === 'conditioning'
              ? t('session.doneConditioning', { streak: s, days: t('home.days') })
              : t('session.doneTool')}
        </p>
        <Button variant="primary" className="w-full" onClick={() => navigate('/')}>
          {t('session.back')}
        </Button>
      </div>
    );
  }

  // ------------------------------------------------------- en curso ----
  const showNumber = view && (view.phase === 'countdown' || view.phase === 'exit') && view.number !== null;
  return (
    <div className="safe-top safe-bottom fixed inset-0 mx-auto flex max-w-lg flex-col overflow-hidden px-5" data-testid="session-running">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{spec.title}</p>
          <p className="text-xs uppercase tracking-widest text-indigo" data-testid="phase">
            {view ? t(`session.phases.${view.phase}`) : ''}
          </p>
        </div>
        <button type="button" onClick={() => setShowVolumes((v) => !v)} aria-expanded={showVolumes} className="min-h-12 rounded-xl px-3 text-sm text-muted active:bg-card">
          {t('session.volumes')}
        </button>
      </header>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-card" aria-hidden>
        <div className="h-full bg-gradient-to-r from-sky to-indigo" style={{ width: `${Math.min(100, fraction * 100)}%` }} />
      </div>

      {showVolumes && (
        <div className="mt-3 space-y-1 rounded-2xl bg-card p-4">
          <Slider
            label={t('session.voice')}
            value={settings.voiceVolume}
            disabled={visualOnly}
            onChange={(v) => {
              updateSettings({ voiceVolume: v });
              sessionRef.current?.setVoiceVolume(v);
            }}
          />
          <Slider
            label={t('session.tone')}
            value={settings.toneVolume}
            disabled={visualOnly || !settings.toneEnabled}
            onChange={(v) => {
              updateSettings({ toneVolume: v });
              sessionRef.current?.setToneVolume(v);
            }}
          />
        </div>
      )}

      {suspendedNotice && (
        <p className="mt-3 rounded-2xl bg-amber-300/10 p-3 text-sm text-amber-200" onClick={() => setSuspendedNotice(false)}>
          {t('session.suspended')}
        </p>
      )}

      <main className="flex flex-1 flex-col items-center justify-center text-center">
        {showNumber ? (
          <p className="font-light tabular-nums leading-none text-ink" style={{ fontSize: 'min(42vw, 11rem)' }} data-testid="big-number" aria-live="off">
            {view!.number}
          </p>
        ) : (
          <BreathOrb breath={view?.breath ?? null} />
        )}
        {view?.breath && <p className="mt-6 text-lg text-sky">{t(`session.breath.${view.breath.value}`)}</p>}
        {(settings.showCaptions || visualOnly) && view?.caption && view.phase !== 'countdown' && (
          <p className="mt-6 min-h-[4.5rem] max-w-sm text-lg leading-relaxed text-ink/80" data-testid="caption">
            {view.caption}
          </p>
        )}
      </main>

      <footer className="grid grid-cols-3 gap-3 pb-2">
        {confirmStop ? (
          <>
            <p className="col-span-3 text-center text-sm text-muted">{t('session.stopConfirm')}</p>
            <Button onClick={() => setConfirmStop(false)}>{t('update.later')}</Button>
            <Button variant="danger" className="col-span-2" onClick={stop}>
              {t('session.stop')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" onClick={() => setConfirmStop(true)}>
              {t('session.stop')}
            </Button>
            <Button variant="primary" onClick={paused ? resume : pause} data-testid="pause">
              {paused ? t('session.resume') : t('session.pause')}
            </Button>
            <Button onClick={() => setEyesClosed(true)}>{t('session.eyesClosed')}</Button>
          </>
        )}
      </footer>

      {eyesClosed && <EyesClosed number={showNumber ? view!.number : null} onExit={() => setEyesClosed(false)} />}
    </div>
  );
}

/** Pantalla casi negra pero encendida. Doble toque para salir. */
function EyesClosed({ number, onExit }: { number: number | null; onExit: () => void }) {
  const last = useRef(0);
  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-black"
      onClick={() => {
        const now = Date.now();
        if (now - last.current < 450) onExit();
        last.current = now;
      }}
      data-testid="eyes-closed"
    >
      <p className="text-7xl font-light tabular-nums text-white/[0.06]">{number ?? ''}</p>
      <p className="absolute bottom-10 text-xs text-white/[0.12]">{t('session.eyesClosedHint')}</p>
    </div>
  );
}

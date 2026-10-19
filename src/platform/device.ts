// Wake Lock y Media Session: mantener la pantalla encendida y controlar
// la sesión desde la notificación / pantalla de bloqueo de Android.

let lock: WakeLockSensor | null = null;
let wanted = false;

type WakeLockSensor = { release(): Promise<void>; released: boolean };

async function acquire() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSensor> } };
    if (wanted && nav.wakeLock && (!lock || lock.released) && document.visibilityState === 'visible') {
      lock = await nav.wakeLock.request('screen');
    }
  } catch {
    // Batería baja o permiso denegado: seguimos sin wake lock.
  }
}

function onVisibility() {
  if (document.visibilityState === 'visible') void acquire();
}

export function keepScreenOn(on: boolean): void {
  wanted = on;
  if (on) {
    document.addEventListener('visibilitychange', onVisibility);
    void acquire();
  } else {
    document.removeEventListener('visibilitychange', onVisibility);
    void lock?.release().catch(() => undefined);
    lock = null;
  }
}

export function wakeLockSupported(): boolean {
  return 'wakeLock' in navigator;
}

export interface MediaHandlers {
  play: () => void;
  pause: () => void;
  stop: () => void;
}

export function setMediaSession(title: string, handlers: MediaHandlers | null): void {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  if (!handlers) {
    ms.metadata = null;
    for (const a of ['play', 'pause', 'stop'] as const) ms.setActionHandler(a, null);
    ms.playbackState = 'none';
    return;
  }
  const base = import.meta.env.BASE_URL;
  ms.metadata = new MediaMetadata({
    title,
    artist: 'Alfa Mind Engine',
    album: 'Relajación guiada',
    artwork: [
      { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
  });
  ms.setActionHandler('play', handlers.play);
  ms.setActionHandler('pause', handlers.pause);
  ms.setActionHandler('stop', handlers.stop);
}

export function setMediaState(state: MediaSessionPlaybackState): void {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state;
}

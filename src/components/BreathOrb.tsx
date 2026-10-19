import type { TimelineState } from '../audio/timeline';

/**
 * Esfera de respiración. Si la voz marca inhala/sostén/exhala, sigue esos
 * tiempos exactos; si no, respira sola en un ciclo lento de 10 s.
 * Con prefers-reduced-motion queda quieta.
 */
export function BreathOrb({ breath, size = 'lg' }: { breath: TimelineState['breath']; size?: 'lg' | 'sm' }) {
  const dim = size === 'lg' ? 'h-56 w-56' : 'h-28 w-28';
  const guided = breath !== null;
  const scale = !guided ? undefined : breath.value === 'exhala' ? 0.62 : 1;
  const duration = !guided ? undefined : breath.value === 'sostén' ? 0.2 : Math.max(1, breath.dur * 0.9);

  return (
    <div className={`relative ${dim}`} aria-hidden>
      <div
        className={`orb absolute inset-0 rounded-full bg-gradient-to-br from-sky/60 via-indigo/40 to-indigo/10 blur-[2px] ${guided ? '' : 'breathe-idle'}`}
        style={
          guided
            ? { transform: `scale(${scale})`, transition: `transform ${duration}s ease-in-out`, opacity: 0.85 }
            : undefined
        }
      />
      <div className="absolute inset-[18%] rounded-full bg-bg/40" />
    </div>
  );
}

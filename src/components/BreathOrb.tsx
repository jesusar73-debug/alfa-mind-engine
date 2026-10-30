import type { TimelineState } from '../audio/timeline';

/**
 * Esfera de respiración, plana y en el color de la tinta (sirve sobre cualquier
 * tono del descenso). Si la voz marca inhala/sostén/exhala, sigue esos tiempos;
 * si no, respira sola en un ciclo lento de 10 s. Con prefers-reduced-motion queda quieta.
 */
export function BreathOrb({ breath, size = 'lg' }: { breath: TimelineState['breath']; size?: 'lg' | 'sm' }) {
  const dim = size === 'lg' ? 'h-56 w-56' : 'h-24 w-24';
  const guided = breath !== null;
  const scale = !guided ? undefined : breath.value === 'exhala' ? 0.62 : 1;
  const duration = !guided ? undefined : breath.value === 'sostén' ? 0.2 : Math.max(1, breath.dur * 0.9);

  return (
    <div className={`relative ${dim}`} aria-hidden>
      <div
        className={`orb absolute inset-0 rounded-full border-[1.5px] border-current opacity-40 ${guided ? '' : 'breathe-idle'}`}
        style={guided ? { transform: `scale(${scale})`, transition: `transform ${duration}s ease-in-out` } : undefined}
      />
      <div
        className={`orb absolute inset-[16%] rounded-full bg-current opacity-[0.12] ${guided ? '' : 'breathe-idle'}`}
        style={guided ? { transform: `scale(${scale})`, transition: `transform ${duration}s ease-in-out` } : undefined}
      />
      <div className="absolute inset-[44%] rounded-full bg-current opacity-80" />
    </div>
  );
}

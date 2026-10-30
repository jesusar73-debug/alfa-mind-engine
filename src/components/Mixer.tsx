import type { AmbientKind } from '../audio/ambient';
import { AMBIENT_KINDS } from '../audio/ambient';
import { BEATS, type Beat } from '../audio/tone';
import { t, type TKey } from '../i18n';
import type { Settings } from '../state/settings';
import { Slider } from './ui';

/** Fila de opciones en píldora (una sola elegida). */
function Chips<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex flex-wrap gap-2 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`press min-h-11 rounded-full px-4 text-sm ${on ? 'bg-ink text-card' : 'bg-bg text-muted'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface MixerHandlers {
  onVoice: (v: number) => void;
  onAmbientVolume: (v: number) => void;
  onAmbient: (k: AmbientKind) => void;
  onTone: (v: number) => void;
  onBeat: (b: Beat) => void;
}

/**
 * Mezclador de tres canales: voz guía, ambiente y ondas, cada uno con su volumen.
 * Se usa en Ajustes y, durante la sesión, en el panel "Mezclador".
 */
export function Mixer({ settings, handlers, disabled }: { settings: Settings; handlers: MixerHandlers; disabled?: boolean }) {
  const s = settings;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1" aria-label={t('mixer.voice')}>
        <Slider label={t('mixer.voice')} value={s.voiceVolume} disabled={disabled} onChange={handlers.onVoice} />
      </section>

      <section className="flex flex-col gap-2" aria-label={t('mixer.ambient')}>
        <Slider label={t('mixer.ambient')} value={s.ambientVolume} disabled={disabled || s.ambient === 'ninguno'} onChange={handlers.onAmbientVolume} />
        <Chips
          label={t('mixer.ambientKind')}
          value={s.ambient}
          disabled={disabled}
          onChange={handlers.onAmbient}
          options={AMBIENT_KINDS.map((k) => ({ value: k, label: t(`mixer.kinds.${k}` as TKey) }))}
        />
      </section>

      <section className="flex flex-col gap-2" aria-label={t('mixer.waves')}>
        <Slider label={t('mixer.waves')} value={s.toneVolume} disabled={disabled || !s.toneEnabled} onChange={handlers.onTone} />
        <Chips
          label={t('mixer.beat')}
          value={s.beat}
          disabled={disabled || !s.toneEnabled}
          onChange={handlers.onBeat}
          options={BEATS.map((b) => ({ value: b, label: t(`mixer.beats.${b}` as TKey) }))}
        />
        <p className="text-sm text-muted">{t(`mixer.beatHint.${s.beat}` as TKey)}</p>
        {s.toneEnabled && s.toneMode === 'binaural' && <p className="rounded-2xl bg-notice p-3 text-sm text-notice-ink">{t('mixer.headphones')}</p>}
      </section>
    </div>
  );
}

import { useRef, useState } from 'react';
import { ambientBuffer, LiveAmbient } from '../audio/ambient';
import { getMixer, setGain, sliderToGain } from '../audio/mixer';
import { LiveTone } from '../audio/tone';
import { Mixer } from '../components/Mixer';
import { Button, Card, Segmented, Toggle } from '../components/ui';
import { INTERVALS } from '../data/content';
import { t } from '../i18n';
import { useSettings } from '../state/settings';

const TEST_S = 5;

export function SettingsScreen() {
  const [s, update] = useSettings();
  const [testing, setTesting] = useState(false);
  const toneRef = useRef<LiveTone | null>(null);
  const ambientRef = useRef<LiveAmbient | null>(null);

  // Escuchar 5 s de ondas + ambiente, con los volúmenes que se mueven en vivo.
  const testMix = async () => {
    if (testing) return;
    setTesting(true);
    const { ctx, voice } = getMixer();
    void ctx.resume();
    setGain(voice, sliderToGain(s.voiceVolume), 0.01);
    if (s.toneEnabled) {
      toneRef.current = new LiveTone(s.toneMode, s.toneVolume, s.beat);
      toneRef.current.start(1);
    }
    if (s.ambient !== 'ninguno') {
      ambientRef.current = new LiveAmbient(await ambientBuffer(s.ambient), s.ambientVolume);
      ambientRef.current.start(1);
    }
    window.setTimeout(() => {
      toneRef.current?.stop(1);
      ambientRef.current?.stop(1);
      toneRef.current = null;
      ambientRef.current = null;
      setTesting(false);
    }, TEST_S * 1000);
  };

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

      <Card className="space-y-5">
        <h2 className="text-base font-semibold">{t('mixer.title')}</h2>
        <Mixer
          settings={s}
          handlers={{
            onVoice: (v) => update({ voiceVolume: v }),
            onAmbientVolume: (v) => {
              update({ ambientVolume: v });
              ambientRef.current?.setVolume(v);
            },
            onAmbient: (k) => update({ ambient: k }),
            onTone: (v) => {
              update({ toneVolume: v });
              toneRef.current?.setVolume(v);
            },
            onBeat: (b) => {
              update({ beat: b });
              toneRef.current?.setBeat(b);
            },
          }}
        />
        <Button className="w-full" disabled={testing || (!s.toneEnabled && s.ambient === 'ninguno')} onClick={() => void testMix()} data-testid="test-mix">
          {t('mixer.test')}
        </Button>
        <p className="text-sm text-muted">{t('settings.voiceName')}</p>
      </Card>

      <Card className="space-y-3">
        <Toggle label={t('settings.toneEnabled')} checked={s.toneEnabled} onChange={(v) => update({ toneEnabled: v })} />
        <p className="text-sm text-muted">{t('settings.toneMode')}</p>
        <Segmented
          label={t('settings.toneMode')}
          value={s.toneMode}
          onChange={(v) => update({ toneMode: v })}
          options={[
            { value: 'isocronico', label: t('settings.isocronico'), hint: t('settings.isocronicoHint') },
            { value: 'binaural', label: t('settings.binaural'), hint: t('settings.binauralHint') },
          ]}
        />
      </Card>

      <Card className="space-y-3">
        <p className="text-sm text-muted">{t('settings.interval')}</p>
        <Segmented
          label={t('settings.interval')}
          value={s.interval}
          onChange={(v) => update({ interval: v })}
          options={INTERVALS.map((n) => ({ value: n, label: t('settings.seconds', { n }) }))}
        />
        <p className="pt-2 text-sm text-muted">{t('settings.sayEvery')}</p>
        <Segmented
          label={t('settings.sayEvery')}
          value={s.sayEvery}
          onChange={(v) => update({ sayEvery: v })}
          options={[
            { value: 1 as const, label: t('settings.every1') },
            { value: 5 as const, label: t('settings.every5') },
          ]}
        />
      </Card>

      <Card className="space-y-3">
        <p className="text-sm text-muted">{t('settings.engine')}</p>
        <Segmented
          label={t('settings.engine')}
          value={s.engine}
          onChange={(v) => update({ engine: v })}
          options={[
            { value: 'webaudio', label: t('settings.engineWeb') },
            { value: 'compat', label: t('settings.engineCompat') },
          ]}
        />
        <p className="text-xs text-muted">{t('settings.engineHint')}</p>
        <Toggle label={t('settings.captions')} checked={s.showCaptions} onChange={(v) => update({ showCaptions: v })} />
      </Card>
    </div>
  );
}

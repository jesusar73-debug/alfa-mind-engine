import { useRef, useState } from 'react';
import { getMixer } from '../audio/mixer';
import { LiveTone } from '../audio/tone';
import { Button, Card, Segmented, Slider, Toggle } from '../components/ui';
import { INTERVALS } from '../data/content';
import { t } from '../i18n';
import { useSettings } from '../state/settings';

export function SettingsScreen() {
  const [s, update] = useSettings();
  const [testing, setTesting] = useState(false);
  const testRef = useRef<LiveTone | null>(null);

  const testTone = () => {
    if (testing) return;
    void getMixer().ctx.resume();
    const tone = new LiveTone(s.toneMode, s.toneVolume);
    testRef.current = tone;
    tone.start(1);
    setTesting(true);
    window.setTimeout(() => {
      tone.stop(1);
      testRef.current = null;
      setTesting(false);
    }, 5000);
  };

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

      <Card className="space-y-2">
        <Slider label={t('settings.voiceVolume')} value={s.voiceVolume} onChange={(v) => update({ voiceVolume: v })} />
        <Slider
          label={t('settings.toneVolume')}
          value={s.toneVolume}
          disabled={!s.toneEnabled}
          onChange={(v) => {
            update({ toneVolume: v });
            testRef.current?.setVolume(v);
          }}
        />
        <p className="pt-1 text-sm text-muted">{t('settings.voiceName')}</p>
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
            { value: 'binaural', label: t('settings.binaural'), hint: `🎧 ${t('settings.binauralHint')}` },
          ]}
        />
        <Button className="w-full" disabled={!s.toneEnabled || testing} onClick={testTone}>
          {t('settings.test')}
        </Button>
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

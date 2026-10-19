import { useState } from 'react';
import { Calendar } from '../components/Calendar';
import { Button, Card } from '../components/ui';
import { conditioningSpec, LEVELS, TOOLS, toolSpec } from '../data/content';
import { minutesOf, useManifest } from '../data/useManifest';
import { t } from '../i18n';
import { completedCount, daysSinceLast, doneToday, positionFor, streak, useProgress } from '../state/progress';
import { useSettings } from '../state/settings';
import { navigate } from '../router';

export function Home({ tab }: { tab: 'acond' | 'tools' }) {
  return (
    <div>
      <header className="pb-4 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('app.name')}</h1>
        <p className="text-sm text-muted">{t('app.tagline')}</p>
      </header>

      <div role="tablist" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-card p-1">
        {(
          [
            ['acond', '#/', t('home.tabConditioning')],
            ['tools', '#/herramientas', t('home.tabTools')],
          ] as const
        ).map(([id, href, label]) => (
          <a
            key={id}
            role="tab"
            aria-selected={tab === id}
            href={href}
            className={`flex min-h-14 items-center justify-center rounded-xl text-sm font-medium ${
              tab === id ? 'bg-bg text-sky shadow' : 'text-muted'
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {tab === 'acond' ? <Conditioning /> : <Tools />}
    </div>
  );
}

function Conditioning() {
  const progress = useProgress();
  const [settings] = useSettings();
  const manifest = useManifest();
  const [showLevels, setShowLevels] = useState(false);

  const count = completedCount(progress);
  const pos = positionFor(count);
  const today = doneToday(progress);
  const gap = daysSinceLast(progress);
  const spec = conditioningSpec(pos.level, settings.interval, settings.sayEvery);
  const min = minutesOf(spec, manifest);
  const s = streak(progress);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs uppercase tracking-widest text-indigo">{t('home.today')}</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{pos.level.name}</h2>
            <p className="text-muted">
              {t('home.countdown', { from: pos.level.from })}
              {min !== null && ` · ${t('home.minutes', { min })}`}
            </p>
          </div>
          <p className="text-right text-sm text-muted" data-testid="level-day">
            {pos.levelDays ? t('home.dayOf', { day: Math.min(pos.dayInLevel, pos.levelDays), total: pos.levelDays }) : t('home.dayFree', { day: pos.dayInLevel })}
          </p>
        </div>

        {today ? (
          <p className="mt-4 rounded-2xl bg-sky/10 p-3 text-sm text-sky" data-testid="done-today">
            {t('home.doneToday')}
          </p>
        ) : gap !== null && gap > 1 ? (
          <p className="mt-4 rounded-2xl bg-indigo/10 p-3 text-sm text-indigo">
            {t('home.resume', { level: pos.level.name, day: pos.dayInLevel })}
          </p>
        ) : null}

        <Button variant="primary" className="mt-4 w-full text-lg" onClick={() => navigate(`/sesion/acond/${pos.level.id}`)}>
          {today ? t('home.repeat') : t('home.start')}
        </Button>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">{t('home.streak')}</p>
          <p className="text-2xl font-semibold" data-testid="streak">
            {s} <span className="text-sm font-normal text-muted">{t('home.days')}</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">{t('home.completed')}</p>
          <p className="text-2xl font-semibold" data-testid="completed">
            {count}
          </p>
        </Card>
      </div>

      <Card>
        <Calendar progress={progress} />
      </Card>

      <div>
        <Button variant="ghost" className="w-full" onClick={() => setShowLevels((v) => !v)} aria-expanded={showLevels}>
          {t('home.otherLevel')} {showLevels ? '▴' : '▾'}
        </Button>
        {showLevels && (
          <ul className="mt-2 space-y-2">
            {LEVELS.map((lv) => {
              const m = minutesOf(conditioningSpec(lv, settings.interval, settings.sayEvery), manifest);
              return (
                <li key={lv.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/sesion/acond/${lv.id}`)}
                    className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-line bg-card px-4 text-left active:bg-line"
                  >
                    <span>
                      {lv.name} <span className="text-muted">· {t('home.countdown', { from: lv.from })}</span>
                    </span>
                    {m !== null && <span className="text-sm text-muted">{t('home.minutes', { min: m })}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Tools() {
  const [settings] = useSettings();
  const manifest = useManifest();
  return (
    <ul className="space-y-3">
      {TOOLS.map((tool, i) => {
        const min = minutesOf(toolSpec(tool, settings.interval, settings.sleepDirect), manifest);
        return (
          <li key={tool.id}>
            <Card>
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo/15 font-semibold text-indigo">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">{tool.title}</h2>
                  <p className="text-sm text-muted">{tool.summary}</p>
                  {min !== null && <p className="mt-1 text-xs text-muted">{t('home.minutes', { min })}</p>}
                </div>
              </div>
              <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate(`/sesion/tool/${tool.id}`)}>
                {t('home.start')}
              </Button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

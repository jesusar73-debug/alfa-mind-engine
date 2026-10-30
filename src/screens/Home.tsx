import { useState } from 'react';
import { Button, Card, Mark } from '../components/ui';
import { conditioningSpec, LEVELS, TOOLS, toolSpec } from '../data/content';
import { minutesOf, useManifest } from '../data/useManifest';
import { t } from '../i18n';
import { navigate } from '../router';
import {
  completedCount,
  currentPosition,
  dayKey,
  daysSinceLast,
  doneToday,
  streak,
  useProgress,
  type Progress,
} from '../state/progress';
import { useSettings } from '../state/settings';

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return t('home.greetMorning');
  if (h >= 12 && h < 19) return t('home.greetAfternoon');
  return t('home.greetNight');
}

export function Home({ tab }: { tab: 'acond' | 'tools' }) {
  const progress = useProgress();
  const today = doneToday(progress);
  const gap = daysSinceLast(progress);
  const pos = currentPosition(progress);
  const sub = today
    ? t('home.doneToday')
    : gap !== null && gap > 1
      ? t('home.resume', { level: pos.level.name, day: pos.dayInLevel })
      : t('home.waiting');

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 pt-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-accent">
          <Mark className="h-6 w-6" />
          {t('app.short')}
        </p>
        <div>
          <h1 className="text-[30px] font-normal leading-[1.08] tracking-[-0.02em]">{greeting()}</h1>
          <p className="mt-1.5 text-[15px] text-muted" data-testid={today ? 'done-today' : undefined}>
            {sub}
          </p>
        </div>
      </header>

      <div role="tablist" className="flex gap-6">
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
            className={`flex min-h-11 items-center text-[15px] ${
              tab === id ? 'font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-accent)]' : 'text-muted'
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {tab === 'acond' ? <Conditioning progress={progress} /> : <Tools />}
    </div>
  );
}

function Conditioning({ progress }: { progress: Progress }) {
  const [settings] = useSettings();
  const manifest = useManifest();
  const [showLevels, setShowLevels] = useState(false);

  const count = completedCount(progress);
  const pos = currentPosition(progress);
  const today = doneToday(progress);
  const spec = conditioningSpec(pos.level, settings.interval, settings.sayEvery);
  const min = minutesOf(spec, manifest);
  const s = streak(progress);
  const doneInLevel = pos.levelDays ? Math.min(pos.dayInLevel - 1, pos.levelDays) : 0;

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3">
        <h2 className="flex items-baseline justify-between gap-3">
          <span className="num text-[38px] font-normal leading-none tracking-[-0.03em]">{t('home.countdown', { from: pos.level.from })}</span>
          <span className="text-sm text-muted">{pos.level.name}</span>
        </h2>
        <p className="text-sm text-muted">
          <span data-testid="level-day">
            {pos.levelDays
              ? t('home.dayOf', { day: Math.min(pos.dayInLevel, pos.levelDays), total: pos.levelDays })
              : t('home.dayFree', { day: pos.dayInLevel })}
          </span>
          {min !== null && ` · ${t('home.minutesAbout', { min })}`}
        </p>
        {pos.levelDays && (
          <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${pos.levelDays}, 1fr)` }} aria-label={t('home.dotsLabel', { done: doneInLevel, total: pos.levelDays })} role="img">
            {Array.from({ length: pos.levelDays }, (_, i) => (
              <i key={i} className={`h-1.5 rounded-full ${i < doneInLevel ? 'bg-accent' : i === doneInLevel ? 'bg-ink' : 'bg-line'}`} />
            ))}
          </div>
        )}
      </Card>

      <WeekStrip progress={progress} />

      <p className="text-sm text-muted">
        {t('home.streakPrefix')}{' '}
        <strong className="font-semibold text-ink">
          <span data-testid="streak">{s}</span> {s === 1 ? t('home.day') : t('home.days')}
        </strong>{' '}
        · <span data-testid="completed">{count}</span> {count === 1 ? t('home.sessionDone') : t('home.sessionsDone')}
      </p>

      <Button variant="primary" className="w-full text-lg" onClick={() => navigate(`/sesion/acond/${pos.level.id}`)}>
        {today ? t('home.repeat') : t('home.start')}
      </Button>

      <div className="flex flex-col">
        <a href="#/progreso" className="flex min-h-12 items-center justify-center text-sm text-muted underline-offset-4 active:underline">
          {t('home.changeStart')}
        </a>
        <button type="button" className="press flex min-h-12 items-center justify-center text-sm text-muted" onClick={() => setShowLevels((v) => !v)} aria-expanded={showLevels}>
          {t('home.otherLevel')} {showLevels ? '▴' : '▾'}
        </button>
        {showLevels && (
          <ul className="mt-1 overflow-hidden rounded-[22px] bg-card">
            {LEVELS.map((lv) => {
              const m = minutesOf(conditioningSpec(lv, settings.interval, settings.sayEvery), manifest);
              return (
                <li key={lv.id} className="border-t border-bg first:border-t-0">
                  <button
                    type="button"
                    onClick={() => navigate(`/sesion/acond/${lv.id}`)}
                    className="press flex min-h-14 w-full items-center justify-between px-5 text-left active:bg-bg"
                  >
                    <span>
                      {lv.name} <span className="num text-muted">· {t('home.countdown', { from: lv.from })}</span>
                    </span>
                    {m !== null && <span className="num text-sm text-muted">{t('home.minutes', { min: m })}</span>}
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

/** La semana actual (lunes a domingo): días hechos rellenos, hoy con un aro. */
function WeekStrip({ progress }: { progress: Progress }) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const todayKey = dayKey(now);
  return (
    <ol className="grid grid-cols-7 text-center text-xs text-muted" aria-label={t('home.weekLabel')}>
      {labels.map((l, i) => {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        const key = dayKey(d);
        const done = Boolean(progress.days[key]);
        const isToday = key === todayKey;
        return (
          <li key={key} data-done={done || undefined} className="flex flex-col items-center gap-1.5" aria-label={`${d.getDate()}${done ? ' ✓' : ''}${isToday ? ' (hoy)' : ''}`}>
            <span aria-hidden>{l}</span>
            <span
              aria-hidden
              className={`num flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium ${
                done ? 'bg-accent text-on-accent' : 'text-ink'
              } ${isToday ? 'shadow-[inset_0_0_0_1.5px_var(--color-ink)]' : ''}`}
            >
              {d.getDate()}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Tools() {
  const [settings] = useSettings();
  const manifest = useManifest();
  return (
    <ul className="overflow-hidden rounded-[22px] bg-card">
      {TOOLS.map((tool) => {
        const min = minutesOf(toolSpec(tool, settings.interval, settings.sleepDirect), manifest);
        return (
          <li key={tool.id} className="border-t border-bg first:border-t-0">
            <button
              type="button"
              onClick={() => navigate(`/sesion/tool/${tool.id}`)}
              className="press flex w-full items-center gap-4 px-5 py-4 text-left active:bg-bg"
              aria-label={`${t('home.start')}: ${tool.title}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold">{tool.title}</span>
                <span className="mt-0.5 block text-sm text-muted">{tool.summary}</span>
                {min !== null && <span className="num mt-1 block text-xs text-muted">{t('home.minutesAbout', { min })}</span>}
              </span>
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

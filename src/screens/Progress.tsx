import { useRef, useState } from 'react';
import { Calendar } from '../components/Calendar';
import { Button, Card } from '../components/ui';
import { LEVELS } from '../data/content';
import { t } from '../i18n';
import { completedCount, currentPosition, makeBackup, restoreBackup, setStartLevel, startLevelIndex, streak, useProgress } from '../state/progress';

export function ProgressScreen() {
  const progress = useProgress();
  const count = completedCount(progress);
  const pos = currentPosition(progress);
  const startIdx = startLevelIndex(progress.startLevelId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(makeBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alfa-mind-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importBackup = async (file: File) => {
    try {
      const { days } = restoreBackup(await file.text());
      setMessage(t('progress.imported', { days }));
    } catch (e) {
      setMessage(t('progress.importError', { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">{t('progress.title')}</h1>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted">{t('home.streak')}</p>
          <p className="text-2xl font-semibold">
            {streak(progress)} <span className="text-sm font-normal text-muted">{t('home.days')}</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted">{t('home.completed')}</p>
          <p className="text-2xl font-semibold">{count}</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm uppercase tracking-widest text-indigo">{t('progress.calendar')}</h2>
        <Calendar progress={progress} />
      </Card>

      <Card>
        <h2 className="text-sm uppercase tracking-widest text-indigo" id="start-level">
          {t('progress.startTitle')}
        </h2>
        <p className="mt-2 text-sm text-muted">{t('progress.startHint')}</p>
        <div role="radiogroup" aria-labelledby="start-level" className="mt-3 grid grid-cols-2 gap-2">
          {LEVELS.map((lv, i) => {
            const active = i === startIdx;
            return (
              <button
                key={lv.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStartLevel(lv.id)}
                className={`min-h-14 rounded-2xl border px-3 py-2 text-left text-sm transition-colors ${
                  active ? 'border-sky bg-sky/15 text-sky' : 'border-line bg-bg text-muted'
                }`}
              >
                <span className="block font-medium">{lv.name}</span>
                <span className="block text-xs opacity-80">{t('home.countdown', { from: lv.from })}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 rounded-2xl bg-sky/10 p-3 text-sm text-sky" data-testid="start-preview">
          {t('progress.startPreview', {
            level: pos.level.name,
            day: pos.levelDays
              ? t('home.dayOf', { day: pos.dayInLevel, total: pos.levelDays }).toLowerCase()
              : t('home.dayFree', { day: pos.dayInLevel }).toLowerCase(),
          })}
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm uppercase tracking-widest text-indigo">{t('progress.levels')}</h2>
        <ol className="space-y-3">
          {LEVELS.map((lv, i) => {
            const skipped = i < startIdx;
            const done = !skipped && i < pos.levelIndex;
            const current = i === pos.levelIndex;
            const doneInLevel = done ? (lv.days ?? 0) : current ? pos.dayInLevel - 1 : 0;
            const pct = lv.days ? Math.min(100, (doneInLevel / lv.days) * 100) : current ? 100 : 0;
            return (
              <li key={lv.id} className={skipped ? 'opacity-50' : ''}>
                <div className="flex justify-between text-sm">
                  <span className={current ? 'font-semibold text-sky' : done ? 'text-ink' : 'text-muted'}>
                    {lv.name} · {lv.from} → 1
                  </span>
                  <span className="text-muted">
                    {skipped ? t('progress.levelSkipped') : done ? t('progress.levelDone') : current ? t('progress.levelCurrent') : ''}
                    {lv.days && !skipped ? ` ${Math.min(doneInLevel, lv.days)}/${lv.days}` : ''}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg">
                  <div className={`h-full ${done ? 'bg-sky/60' : 'bg-sky'}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm uppercase tracking-widest text-indigo">{t('progress.backup')}</h2>
        <div className="grid gap-3">
          <Button onClick={exportBackup} data-testid="export">
            {t('progress.export')}
          </Button>
          <Button onClick={() => fileRef.current?.click()}>{t('progress.import')}</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="import-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBackup(f);
              e.target.value = '';
            }}
          />
        </div>
        {message && (
          <p role="status" className="mt-3 text-sm text-sky">
            {message}
          </p>
        )}
      </Card>
    </div>
  );
}

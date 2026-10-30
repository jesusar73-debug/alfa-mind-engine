import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '../components/ui';
import { t } from '../i18n';
import {
  compareImportance,
  emptyEntry,
  formatDay,
  getJournal,
  journalAsText,
  parseDay,
  saveEntry,
  summarizeWeek,
  useJournal,
  type JournalEntry,
} from '../state/journal';
import { dayKey } from '../state/progress';

const SHORT = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric' });
const pct = (x: number) => `${Math.round(x * 100)} %`;

const field = 'w-full rounded-2xl bg-bg px-4 py-3 text-base text-ink placeholder:text-muted focus-visible:outline-2';

export function JournalScreen() {
  const journal = useJournal();
  const todayKey = dayKey();
  const [day, setDay] = useState(todayKey);
  const [draft, setDraft] = useState<JournalEntry>(() => getJournal().entries[todayKey] ?? emptyEntry());
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const copyRef = useRef<HTMLTextAreaElement>(null);

  // Al cambiar de día se carga lo que ya estaba anotado.
  useEffect(() => {
    setDraft(getJournal().entries[day] ?? emptyEntry());
    setSaved(false);
  }, [day]);

  // Se guarda solo, medio segundo después de dejar de escribir.
  const change = (patch: Partial<JournalEntry>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveEntry(day, next);
      setSaved(true);
    }, 450);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const move = (n: number) => {
    const d = parseDay(day);
    const next = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
    if (next <= todayKey) {
      window.clearTimeout(timer.current);
      saveEntry(day, draft);
      setDay(next);
    }
  };

  const week = summarizeWeek(journal, parseDay(day));
  const cmp = compareImportance(journal);
  const isSunday = new Date().getDay() === 0;
  const history = Object.keys(journal.entries).sort().reverse().slice(0, 14);
  const text = journalAsText(journal);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      // Sin portapapeles: se muestra el texto seleccionado para copiarlo a mano.
      setCopied('fail');
      window.setTimeout(() => copyRef.current?.select(), 0);
    }
  };

  let verdict: string;
  if (!cmp.enough) verdict = t('journal.needMore', { n: 2 });
  else if (cmp.lowBetter) verdict = t('journal.lowBetter');
  else if (cmp.noDifference) verdict = cmp.spanDays >= 28 ? t('journal.noDiff4w') : t('journal.noDiffYet', { n: cmp.spanDays });
  else verdict = t('journal.highBetter');

  return (
    <div className="space-y-4 pt-2">
      <header>
        <h1 className="text-2xl font-semibold">{t('journal.title')}</h1>
        <p className="mt-1 text-[15px] text-muted">{t('journal.subtitle')}</p>
      </header>

      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => move(-1)} aria-label={t('journal.prevDay')} className="press h-12 w-12 shrink-0 rounded-full text-2xl text-muted active:bg-bg">
            ‹
          </button>
          <p className="min-w-0 text-center font-semibold" data-testid="journal-day">
            {day === todayKey ? `${t('journal.today')} · ` : ''}
            {formatDay(day)}
          </p>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={day === todayKey}
            aria-label={t('journal.nextDay')}
            className="press h-12 w-12 shrink-0 rounded-full text-2xl text-muted active:bg-bg disabled:opacity-30"
          >
            ›
          </button>
        </div>

        <label className="block space-y-2">
          <span className="font-medium">{t('journal.slide')}</span>
          <input
            className={field}
            name="slide"
            autoComplete="off"
            value={draft.slide}
            onChange={(e) => change({ slide: e.target.value })}
            placeholder={t('journal.slidePh')}
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="font-medium">{t('journal.importance')}</legend>
          <div role="radiogroup" aria-label={t('journal.importance')} className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const on = draft.importance === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => change({ importance: on ? null : n })}
                  className={`press num h-12 rounded-full text-[17px] font-medium ${on ? 'bg-ink text-card' : 'bg-bg text-ink'}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="flex justify-between text-sm text-muted">
            <span>{t('journal.low')}</span>
            <span>{t('journal.high')}</span>
          </p>
        </fieldset>

        <div className="space-y-2">
          <label className="block space-y-2">
            <span className="font-medium">{t('journal.action')}</span>
            <input
              className={field}
              name="action"
              autoComplete="off"
              value={draft.action}
              onChange={(e) => change({ action: e.target.value })}
              placeholder={t('journal.actionPh')}
            />
          </label>
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              name="actionDone"
              checked={draft.actionDone}
              onChange={(e) => change({ actionDone: e.target.checked })}
              className="h-6 w-6 shrink-0 accent-[var(--color-accent)]"
            />
            <span>{t('journal.done')}</span>
          </label>
          <input
            className={field}
            name="actionNote"
            autoComplete="off"
            value={draft.actionNote}
            onChange={(e) => change({ actionNote: e.target.value })}
            placeholder={t('journal.notePh')}
            aria-label={t('journal.note')}
          />
        </div>

        <label className="block space-y-2">
          <span className="font-medium">{t('journal.signals')}</span>
          <textarea
            className={`${field} min-h-24 resize-y`}
            name="signals"
            rows={3}
            value={draft.signals}
            onChange={(e) => change({ signals: e.target.value })}
            placeholder={t('journal.signalsPh')}
          />
        </label>

        <p className="h-5 text-sm text-accent" role="status" data-testid="journal-saved">
          {saved ? t('journal.saved') : ''}
        </p>
      </Card>

      <Card className="space-y-3" data-testid="week">
        <h2 className="text-base font-semibold">{isSunday ? t('journal.sundayTitle') : t('journal.weekTitle')}</h2>
        {week.days === 0 ? (
          <p className="text-muted">{t('journal.weekEmpty')}</p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-bg p-3">
                <dt className="text-xs text-muted">{t('journal.daysLogged')}</dt>
                <dd className="num mt-1 text-xl font-semibold">
                  {week.days}
                  <span className="text-sm font-normal text-muted"> / 7</span>
                </dd>
              </div>
              <div className="rounded-2xl bg-bg p-3">
                <dt className="text-xs text-muted">{t('journal.avgImportance')}</dt>
                <dd className="num mt-1 text-xl font-semibold" data-testid="avg-importance">
                  {week.avgImportance === null ? '—' : week.avgImportance.toLocaleString('es')}
                </dd>
              </div>
              <div className="rounded-2xl bg-bg p-3">
                <dt className="text-xs text-muted">{t('journal.actionsDone')}</dt>
                <dd className="num mt-1 text-xl font-semibold" data-testid="actions-done">
                  {week.actionsDone}
                  <span className="text-sm font-normal text-muted"> / {week.actionsSet}</span>
                </dd>
              </div>
            </dl>
            {week.signals.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-medium">{t('journal.signalsList')}</h3>
                <ul className="space-y-1.5 text-[15px]">
                  {week.signals.map((s) => (
                    <li key={s.day} className="break-words">
                      <span className="text-muted">{SHORT.format(parseDay(s.day))} · </span>
                      {s.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="space-y-3" data-testid="question">
        <h2 className="text-base font-semibold">{t('journal.questionTitle')}</h2>
        <p className="text-[15px] text-muted">{t('journal.question')}</p>
        {cmp.enough && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 text-left font-normal">{t('journal.group')}</th>
                <th className="py-1 text-right font-normal">{t('journal.days')}</th>
                <th className="py-1 text-right font-normal">{t('journal.actions')}</th>
                <th className="py-1 text-right font-normal">{t('journal.signalsShort')}</th>
              </tr>
            </thead>
            <tbody className="num">
              <tr>
                <td className="py-1">{t('journal.lowGroup')}</td>
                <td className="py-1 text-right">{cmp.low.days}</td>
                <td className="py-1 text-right">{pct(cmp.low.actionRate)}</td>
                <td className="py-1 text-right">{pct(cmp.low.signalRate)}</td>
              </tr>
              <tr>
                <td className="py-1">{t('journal.highGroup')}</td>
                <td className="py-1 text-right">{cmp.high.days}</td>
                <td className="py-1 text-right">{pct(cmp.high.actionRate)}</td>
                <td className="py-1 text-right">{pct(cmp.high.signalRate)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="font-medium" data-testid="verdict">
          {verdict}
        </p>
      </Card>

      {history.length > 0 && (
        <Card className="space-y-2">
          <h2 className="text-base font-semibold">{t('journal.history')}</h2>
          <ul className="-mx-2">
            {history.map((k) => {
              const e = journal.entries[k];
              return (
                <li key={k}>
                  <button type="button" onClick={() => setDay(k)} className="press flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 text-left active:bg-bg">
                    <span className="w-16 shrink-0 text-sm text-muted">{SHORT.format(parseDay(k))}</span>
                    <span className="min-w-0 flex-1 truncate">{e.slide.trim() || e.action.trim() || t('journal.noSlide')}</span>
                    <span className="num shrink-0 text-sm text-muted">{e.importance === null ? '—' : `${e.importance}/10`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="space-y-3">
        <Button className="w-full" disabled={!text} onClick={() => void copy()} data-testid="copy-journal">
          {copied === 'ok' ? t('journal.copied') : t('journal.copy')}
        </Button>
        {copied === 'fail' && (
          <>
            <p className="text-sm text-muted">{t('journal.copyManual')}</p>
            <textarea ref={copyRef} readOnly value={text} rows={6} className={`${field} text-sm`} aria-label={t('journal.copy')} />
          </>
        )}
      </Card>
    </div>
  );
}

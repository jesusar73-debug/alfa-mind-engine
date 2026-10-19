import { useState } from 'react';
import { t } from '../i18n';
import { dayKey, type Progress } from '../state/progress';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTH = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' });

/** Calendario mensual: hoy resaltado, días completados rellenos. */
export function Calendar({ progress }: { progress: Progress }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const todayKey = dayKey(today);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // semana empieza en lunes
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];

  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const raw = MONTH.format(cursor);
  const title = raw.charAt(0).toUpperCase() + raw.slice(1);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} aria-label={t('progress.prevMonth')} className="h-12 w-12 rounded-xl text-2xl text-muted active:bg-line">
          ‹
        </button>
        <p className="font-medium">{title}</p>
        <button type="button" onClick={() => move(1)} aria-label={t('progress.nextMonth')} className="h-12 w-12 rounded-xl text-2xl text-muted active:bg-line">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <ol className="mt-1 grid grid-cols-7 gap-1" aria-label={title}>
        {cells.map((d, i) => {
          if (!d) return <li key={`e${i}`} />;
          const key = dayKey(d);
          const done = Boolean(progress.days[key]);
          const isToday = key === todayKey;
          return (
            <li
              key={key}
              data-day={key}
              data-done={done || undefined}
              aria-label={`${d.getDate()}${done ? ' ✓' : ''}${isToday ? ' (hoy)' : ''}`}
              className={`flex aspect-square items-center justify-center rounded-xl text-sm ${
                done ? 'bg-sky/80 font-semibold text-slate-950' : 'text-ink/80'
              } ${isToday ? 'ring-2 ring-indigo ring-offset-2 ring-offset-card' : ''}`}
            >
              {d.getDate()}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-sky/80" /> {t('progress.legendDone')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded ring-2 ring-indigo" /> {t('progress.legendToday')}
        </span>
      </div>
    </div>
  );
}

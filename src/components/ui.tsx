import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

// Botones redondos (píldora), una sola decisión para toda la app.
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent font-semibold',
  secondary: 'bg-card text-ink font-medium shadow-[inset_0_0_0_1px_var(--color-line)]',
  ghost: 'text-muted font-medium',
  danger: 'bg-card text-danger font-medium shadow-[inset_0_0_0_1px_var(--color-line)]',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`press min-h-14 rounded-full px-6 text-base disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

/** Superficie un tono más clara que el fondo; sin borde ni sombra. */
export function Card({ children, className = '', ...rest }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={`rounded-[22px] bg-card p-5 ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`press min-h-14 rounded-2xl px-3 py-2 text-sm ${active ? 'bg-ink text-card' : 'bg-bg text-muted'}`}
          >
            <span className="block font-medium">{o.label}</span>
            {o.hint && <span className="block text-xs opacity-80">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`block ${disabled ? 'opacity-40' : ''}`}>
      <span className="flex justify-between text-[15px]">
        <span className="font-medium">{label}</span>
        <span className="num inline-block w-[3.6em] text-right text-muted">{Math.round(value * 100)} %</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        aria-label={label}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-4">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-card transition-transform duration-200 ${
            checked ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

/** Marca de Alfa Mind: un punto en calma con dos ondas. */
export function Mark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="6.6" opacity=".7" />
      <circle cx="12" cy="12" r="10" opacity=".4" />
    </svg>
  );
}

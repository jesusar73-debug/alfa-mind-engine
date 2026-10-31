import { useEffect, useState } from 'react';
import { Button, Card } from '../components/ui';
import { useManifest } from '../data/useManifest';
import { t, tl, type TKey } from '../i18n';

interface AmbientCredit {
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
}
import { readDiag } from '../platform/diag';

export function AboutScreen() {
  const manifest = useManifest();
  const [lines] = useState(readDiag);
  const [copied, setCopied] = useState(false);
  const [ambient, setAmbient] = useState<Record<string, AmbientCredit> | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}ambient/credits.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setAmbient)
      .catch(() => setAmbient(null));
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold">{t('about.title')}</h1>
      <Card className="space-y-3 leading-relaxed">
        {tl('about.body').map((p, i) => (
          <p key={i} className={i === 1 || i === 2 ? 'font-medium text-notice-ink' : ''}>
            {p}
          </p>
        ))}
      </Card>
      <Card className="space-y-2 text-sm text-muted">
        <h2 className="text-base font-semibold text-ink">{t('about.credits')}</h2>
        <p>{t('about.voiceCredit')}</p>
        {ambient && (
          <div data-testid="ambient-credits">
            <p>{t('about.ambientCredits')}</p>
            <ul className="mt-1 space-y-1">
              {Object.entries(ambient).map(([kind, c]) => (
                <li key={kind} className="break-words">
                  {t(`about.ambientKinds.${kind}` as TKey)}: “
                  <a className="underline underline-offset-2" href={c.source} target="_blank" rel="noreferrer">
                    {c.title.replace(/\.(wav|ogg)$/, '')}
                  </a>
                  ”, {c.author} ·{' '}
                  {c.licenseUrl ? (
                    <a className="underline underline-offset-2" href={c.licenseUrl} target="_blank" rel="noreferrer">
                      {c.license}
                    </a>
                  ) : (
                    c.license
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p>{t('about.version', { v: __APP_VERSION__ })}</p>
        {manifest && <p>{t('about.storage', { mb: (manifest.totalBytes / 1e6).toFixed(1) })}</p>}
      </Card>
      <Card className="space-y-3 text-sm">
        <h2 className="text-base font-semibold text-ink">{t('about.diagTitle')}</h2>
        {lines.length ? (
          <>
            <p className="text-muted">{t('about.diagHint')}</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-bg p-3 text-xs text-muted" data-testid="diag">
              {lines.slice(1).join('\n')}
            </pre>
            <Button className="w-full" onClick={() => void copy()}>
              {copied ? t('about.diagCopied') : t('about.diagCopy')}
            </Button>
          </>
        ) : (
          <p className="text-muted">{t('about.diagEmpty')}</p>
        )}
      </Card>
    </div>
  );
}

import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../i18n';
import { Button } from './ui';

/** Aviso discreto de "Nueva versión disponible". Nunca recarga a mitad de una sesión. */
export function UpdateToast({ hidden = false }: { hidden?: boolean }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Revisa si hay versión nueva cada hora mientras la app está abierta.
      if (reg) window.setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const id = window.setTimeout(() => setOfflineReady(false), 4000);
    return () => window.clearTimeout(id);
  }, [offlineReady, setOfflineReady]);

  if (hidden || (!needRefresh && !offlineReady)) return null;

  return (
    <div role="status" className="fixed inset-x-3 bottom-24 z-20 mx-auto max-w-md rounded-2xl border border-line bg-card/95 p-4 shadow-xl backdrop-blur">
      {needRefresh ? (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm">{t('update.available')}</p>
          <Button variant="ghost" onClick={() => setNeedRefresh(false)} className="min-h-12 px-3 text-sm">
            {t('update.later')}
          </Button>
          <Button variant="primary" onClick={() => void updateServiceWorker(true)} className="min-h-12 px-4 text-sm">
            {t('update.reload')}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-sky">{t('update.offlineReady')}</p>
      )}
    </div>
  );
}

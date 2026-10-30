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
    <div role="status" className="fixed inset-x-4 bottom-24 z-20 mx-auto max-w-md rounded-[22px] bg-card p-4 shadow-[0_8px_24px_rgba(20,38,43,0.14)]">
      {needRefresh ? (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] font-medium">{t('update.available')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setNeedRefresh(false)} className="min-h-12 text-sm">
              {t('update.later')}
            </Button>
            <Button variant="primary" onClick={() => void updateServiceWorker(true)} className="min-h-12 text-sm">
              {t('update.reload')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-accent">{t('update.offlineReady')}</p>
      )}
    </div>
  );
}

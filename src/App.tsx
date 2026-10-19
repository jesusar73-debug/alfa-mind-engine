import { useEffect, useState } from 'react';
import { t } from './i18n';
import { UpdateToast } from './components/UpdateToast';
import { Home } from './screens/Home';
import { SessionScreen } from './screens/Session';
import { ProgressScreen } from './screens/Progress';
import { SettingsScreen } from './screens/Settings';
import { AboutScreen } from './screens/About';

/** Rutas con hash (#/...) para que funcione igual en GitHub Pages y offline. */
export type Route =
  | { name: 'home'; tab: 'acond' | 'tools' }
  | { name: 'progress' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'session'; kind: 'acond' | 'tool'; id: string };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'herramientas':
      return { name: 'home', tab: 'tools' };
    case 'progreso':
      return { name: 'progress' };
    case 'ajustes':
      return { name: 'settings' };
    case 'acerca':
      return { name: 'about' };
    case 'sesion':
      if ((parts[1] === 'acond' || parts[1] === 'tool') && parts[2]) return { name: 'session', kind: parts[1], id: parts[2] };
      return { name: 'home', tab: 'acond' };
    default:
      return { name: 'home', tab: 'acond' };
  }
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

const NAV = [
  { path: '/', label: t('nav.home'), icon: 'M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z', match: 'home' },
  { path: '/progreso', label: t('nav.progress'), icon: 'M4 5h16v16H4zM4 9h16M9 3v4M15 3v4', match: 'progress' },
  { path: '/ajustes', label: t('nav.settings'), icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4', match: 'settings' },
  { path: '/acerca', label: t('nav.about'), icon: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-5M12 8h0', match: 'about' },
] as const;

export default function App() {
  const route = useRoute();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name]);

  return (
    <>
      {route.name === 'session' ? (
        <SessionScreen key={`${route.kind}/${route.id}`} kind={route.kind} id={route.id} />
      ) : (
        <Shell route={route} />
      )}
      {/* Un solo registro del service worker; oculto durante la sesión. */}
      <UpdateToast hidden={route.name === 'session'} />
    </>
  );
}

function Shell({ route }: { route: Exclude<Route, { name: 'session' }> }) {
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <main className="safe-top flex-1 px-4 pb-28">
        {route.name === 'home' && <Home tab={route.tab} />}
        {route.name === 'progress' && <ProgressScreen />}
        {route.name === 'settings' && <SettingsScreen />}
        {route.name === 'about' && <AboutScreen />}
      </main>
      <nav
        aria-label="Principal"
        className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 backdrop-blur"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map((n) => {
            const active = route.name === n.match;
            return (
              <li key={n.path}>
                <a
                  href={`#${n.path}`}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${
                    active ? 'text-sky' : 'text-muted'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={n.icon} />
                  </svg>
                  {n.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

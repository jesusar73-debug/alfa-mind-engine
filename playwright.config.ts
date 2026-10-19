import { defineConfig } from '@playwright/test';

// Las pruebas corren contra el build de producción (npm run build) servido con vite preview.
export default defineConfig({
  testDir: 'tests',
  timeout: 5 * 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    locale: 'es-MX',
    serviceWorkers: 'allow',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npm run preview -- --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
  },
});

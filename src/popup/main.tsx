import { createRoot } from 'react-dom/client';
import { ensureProfileLibrary } from '@/shared/profileLibrary';
import { getSettings } from '@/shared/storage';
import type { Theme } from '@/shared/types';
import App from './App';
import { ToastProvider } from './components/Toast';
import { applyThemeClass } from './utils/theme';
import './index.css';

async function bootstrap(): Promise<void> {
  await ensureProfileLibrary();
  const settings = await getSettings();
  let currentTheme: Theme = settings.theme;

  applyThemeClass(currentTheme);

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemThemeChange = () => {
    if (currentTheme === 'system') {
      applyThemeClass('system');
    }
  };

  mediaQuery.addEventListener('change', handleSystemThemeChange);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.settings) {
      return;
    }

    const nextSettings = changes.settings.newValue as { theme?: Theme } | undefined;
    if (nextSettings?.theme) {
      currentTheme = nextSettings.theme;
      applyThemeClass(currentTheme);
    }
  });

  createRoot(document.getElementById('root')!).render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

void bootstrap();

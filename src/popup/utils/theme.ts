import type { Theme } from '@/shared/types';

export function resolveIsDark(theme: Theme): boolean {
  if (theme === 'dark') {
    return true;
  }

  if (theme === 'light') {
    return false;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyThemeClass(theme: Theme): void {
  document.documentElement.classList.toggle('dark', resolveIsDark(theme));
}

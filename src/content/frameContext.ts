import { scanPageFieldsWithMeta } from '@/content/scanner';
import type { PortalName } from '@/shared/types';
import { detectPortal } from '@/shared/utils';

const WATCHER_DEBOUNCE_MS = 300;

export interface LocalFormContext {
  fieldCount: number;
  portal: PortalName;
  url: string;
  isTopFrame: boolean;
}

let watcherStarted = false;
let watcherTimer: ReturnType<typeof setTimeout> | undefined;
let lastRegisteredCount = -1;

export function scanLocalFormContext(): LocalFormContext {
  const scanResult = scanPageFieldsWithMeta();
  return {
    fieldCount: scanResult.fields.length,
    portal: detectPortal(window.location.href),
    url: window.location.href,
    isTopFrame: window === window.top,
  };
}

export async function registerFormContext(force = false): Promise<void> {
  try {
    const context = scanLocalFormContext();

    if (
      !force &&
      context.fieldCount === lastRegisteredCount &&
      lastRegisteredCount >= 0
    ) {
      return;
    }

    lastRegisteredCount = context.fieldCount;

    await chrome.runtime.sendMessage({
      type: 'REGISTER_FORM_CONTEXT',
      fieldCount: context.fieldCount,
      portal: context.portal,
      url: context.url,
      isTopFrame: context.isTopFrame,
    });
  } catch {
    // Background may be unavailable during teardown.
  }
}

export function startFormContextWatcher(): void {
  if (watcherStarted || typeof document === 'undefined') {
    return;
  }

  watcherStarted = true;

  const scheduleRegister = (): void => {
    if (watcherTimer) {
      clearTimeout(watcherTimer);
    }

    watcherTimer = setTimeout(() => {
      void registerFormContext();
    }, WATCHER_DEBOUNCE_MS);
  };

  void registerFormContext();

  const observer = new MutationObserver(() => {
    scheduleRegister();
  });

  const root = document.documentElement;
  if (root) {
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  window.addEventListener('load', () => {
    void registerFormContext();
  });
}

export function resetFormContextWatcherForTests(): void {
  watcherStarted = false;
  lastRegisteredCount = -1;
  if (watcherTimer) {
    clearTimeout(watcherTimer);
    watcherTimer = undefined;
  }
}

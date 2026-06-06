import type { JobApplication, PortalName } from '@/shared/types';
import { generateId, isElementVisible } from '@/shared/utils';

const DEBOUNCE_MS = 300;

const SUCCESS_TEXT_PATTERNS = [
  /application submitted/i,
  /thank you for applying/i,
  /we'?ve received/i,
  /application received/i,
];

const SUCCESS_URL_PATTERNS = [
  /thank[-_]?you/i,
  /confirmation/i,
  /submitted/i,
  /success/i,
];

const MODAL_SELECTORS = ['[role="dialog"]', '.modal', '[class*="modal" i]'];

export interface JobInfo {
  company: string;
  role: string;
  portal: PortalName;
  url: string;
}

export interface AutoLoggerDeps {
  getCoverLetterUsed: () => string | undefined;
  extractJobInfo: () => JobInfo;
  onLogged?: () => void;
}

function logAutoLogger(message: string): void {
  console.log('[JobAutofill AutoLogger]', message);
}

function getPageText(): string {
  try {
    return document.body?.innerText ?? '';
  } catch {
    return '';
  }
}

function hasSuccessText(text: string): boolean {
  return SUCCESS_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function hasSuccessUrl(url: string): boolean {
  return SUCCESS_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function hasGreenhouseConfirmation(url: string): boolean {
  return /\/confirmation/i.test(url);
}

function hasLeverThankYouHeading(): boolean {
  const headings = document.querySelectorAll('h1');

  for (const heading of headings) {
    if (
      heading instanceof HTMLElement &&
      isElementVisible(heading) &&
      /thank you/i.test(heading.textContent ?? '')
    ) {
      return true;
    }
  }

  return false;
}

function hasSuccessModal(): boolean {
  for (const selector of MODAL_SELECTORS) {
    const modals = document.querySelectorAll(selector);

    for (const modal of modals) {
      if (!(modal instanceof HTMLElement) || !isElementVisible(modal)) {
        continue;
      }

      const text = modal.innerText ?? '';
      if (hasSuccessText(text)) {
        return true;
      }
    }
  }

  return false;
}

export function isApplicationSubmitted(): boolean {
  const pageText = getPageText();
  const currentUrl = location.href;

  if (hasSuccessText(pageText)) {
    return true;
  }

  if (hasSuccessUrl(currentUrl)) {
    return true;
  }

  if (hasGreenhouseConfirmation(currentUrl)) {
    return true;
  }

  if (hasLeverThankYouHeading()) {
    return true;
  }

  if (hasSuccessModal()) {
    return true;
  }

  return false;
}

export class AutoLogger {
  private readonly deps: AutoLoggerDeps;
  private active = false;
  private loggedForPage = false;
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private originalPushState: History['pushState'] | null = null;
  private originalReplaceState: History['replaceState'] | null = null;

  constructor(deps: AutoLoggerDeps) {
    this.deps = deps;
  }

  startWatching(): void {
    if (this.active || !document.body) {
      return;
    }

    this.loggedForPage = false;
    this.observer = new MutationObserver(() => {
      this.scheduleCheck();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-modal'],
    });

    this.patchHistory();
    this.active = true;
    logAutoLogger('started');
    this.scheduleCheck();
  }

  stopWatching(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    this.observer?.disconnect();
    this.observer = null;
    this.restoreHistory();
    this.active = false;
    logAutoLogger('stopped');
  }

  private patchHistory(): void {
    if (this.originalPushState) {
      return;
    }

    this.originalPushState = history.pushState.bind(history);
    this.originalReplaceState = history.replaceState.bind(history);

    history.pushState = (...args: Parameters<History['pushState']>) => {
      this.originalPushState?.(...args);
      this.scheduleCheck();
    };

    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      this.originalReplaceState?.(...args);
      this.scheduleCheck();
    };
  }

  private restoreHistory(): void {
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
      this.originalPushState = null;
    }

    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }
  }

  private scheduleCheck(): void {
    if (!this.active) {
      return;
    }

    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.checkForSubmission();
    }, DEBOUNCE_MS);
  }

  private checkForSubmission(): void {
    if (!this.active || this.loggedForPage) {
      return;
    }

    if (!isApplicationSubmitted()) {
      return;
    }

    const jobInfo = this.deps.extractJobInfo();
    if (!jobInfo.company.trim() && !jobInfo.role.trim()) {
      return;
    }

    this.logApplication(jobInfo);
  }

  private logApplication(jobInfo: JobInfo): void {
    const coverLetterUsed = this.deps.getCoverLetterUsed();
    const application: JobApplication = {
      id: generateId(),
      company: jobInfo.company,
      role: jobInfo.role,
      portal: jobInfo.portal,
      url: jobInfo.url,
      appliedAt: Date.now(),
      status: 'applied',
      ...(coverLetterUsed ? { coverLetterUsed } : {}),
    };

    try {
      if (!chrome.runtime?.id) {
        return;
      }

      void chrome.runtime.sendMessage({
        type: 'LOG_APPLICATION',
        payload: application,
      });

      this.loggedForPage = true;
      this.deps.onLogged?.();
      logAutoLogger(
        `logged application for ${application.company} - ${application.role}`,
      );
    } catch (error) {
      console.warn('[JobAutofill AutoLogger] Failed to log application:', error);
    }
  }
}

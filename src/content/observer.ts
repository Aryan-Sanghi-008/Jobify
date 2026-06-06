import { scanPageFieldsWithMeta } from '@/content/scanner';
import { Logger } from '@/shared/logger';
import type { FormField } from '@/shared/types';
import { detectPortal } from '@/shared/utils';

const DEBOUNCE_MS = 300;

const COMPLETION_TEXT_PATTERNS = [
  /application submitted/i,
  /thank you for applying/i,
  /we['']ve received your application/i,
  /application received/i,
];

const COMPLETION_URL_PATTERNS = [
  /thank[-_]?you/i,
  /confirmation/i,
  /submitted/i,
  /success/i,
];

function logObserver(message: string): void {
  Logger.debug('Observer', message);
}

function getFieldSignature(field: FormField): string {
  const element = field.element;
  const name =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? element.name
      : '';

  return `${field.label}|${field.type}|${element.id}|${name}`;
}

function getFieldSignatures(fields: FormField[]): Set<string> {
  return new Set(fields.map(getFieldSignature));
}

function setsAreEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function hasMeaningfulFieldChange(
  previous: Set<string>,
  current: Set<string>,
): boolean {
  if (previous.size === 0 && current.size === 0) {
    return false;
  }

  return !setsAreEqual(previous, current);
}

function hasLeftJobPage(): boolean {
  return detectPortal(location.href) === 'generic';
}

function safeScanPageFields(): FormField[] {
  try {
    return scanPageFieldsWithMeta().fields;
  } catch (error) {
    logObserver(
      `scan failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return [];
  }
}

function getPageText(): string {
  try {
    return document.body?.innerText ?? '';
  } catch {
    return '';
  }
}

export class FormObserver {
  private readonly onNewPage: (fields: FormField[]) => void;
  private readonly onFormComplete: () => void;
  private active = false;
  private paused = false;
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private previousFieldSignatures = new Set<string>();
  private previousUrl = '';
  private hadVisibleFields = false;
  private completionFired = false;
  private originalPushState: History['pushState'] | null = null;
  private originalReplaceState: History['replaceState'] | null = null;

  constructor(
    onNewPage: (fields: FormField[]) => void,
    onFormComplete: () => void,
  ) {
    this.onNewPage = onNewPage;
    this.onFormComplete = onFormComplete;
  }

  start(): void {
    if (this.active || !document.body) {
      return;
    }

    const initialFields = safeScanPageFields();
    this.previousFieldSignatures = getFieldSignatures(initialFields);
    this.hadVisibleFields = initialFields.length > 0;
    this.previousUrl = location.href;
    this.completionFired = false;

    this.observer = new MutationObserver(() => {
      this.scheduleCheck();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled'],
    });

    this.patchHistory();
    this.active = true;
    logObserver('started');
  }

  stop(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    this.observer?.disconnect();
    this.observer = null;
    this.restoreHistory();

    this.active = false;
    this.completionFired = false;
    logObserver('stopped');
  }

  isActive(): boolean {
    return this.active;
  }

  checkNow(): void {
    if (!this.active) {
      return;
    }

    this.checkForChanges();
  }

  pause(): void {
    this.paused = true;
    logObserver('paused');
  }

  resume(): void {
    this.paused = false;
    logObserver('resumed');
  }

  private patchHistory(): void {
    if (this.originalPushState) {
      return;
    }

    this.originalPushState = history.pushState.bind(history);
    this.originalReplaceState = history.replaceState.bind(history);

    history.pushState = (...args: Parameters<History['pushState']>) => {
      this.originalPushState?.(...args);
      this.handleNavigation();
    };

    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      this.originalReplaceState?.(...args);
      this.handleNavigation();
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

  private handleNavigation(): void {
    if (hasLeftJobPage()) {
      logObserver('left job page — stopping observer');
      this.stop();
      return;
    }

    this.scheduleCheck();
  }

  private scheduleCheck(): void {
    if (!this.active || this.paused) {
      return;
    }

    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.checkForChanges();
    }, DEBOUNCE_MS);
  }

  private checkCompletion(pageText: string, fields: FormField[]): boolean {
    const currentUrl = location.href;
    const urlChanged = currentUrl !== this.previousUrl;

    if (COMPLETION_TEXT_PATTERNS.some((pattern) => pattern.test(pageText))) {
      return true;
    }

    if (
      urlChanged &&
      COMPLETION_URL_PATTERNS.some((pattern) => pattern.test(currentUrl))
    ) {
      return true;
    }

    if (urlChanged && this.hadVisibleFields && fields.length === 0) {
      return true;
    }

    return false;
  }

  private checkForChanges(): void {
    if (!this.active || this.paused || this.completionFired) {
      return;
    }

    if (hasLeftJobPage()) {
      logObserver('left job page — stopping observer');
      this.stop();
      return;
    }

    try {
      const pageText = getPageText();
      const fields = safeScanPageFields();
      const currentSignatures = getFieldSignatures(fields);
      const currentUrl = location.href;

      if (this.checkCompletion(pageText, fields)) {
        this.completionFired = true;
        this.previousUrl = currentUrl;
        logObserver('form complete');
        this.onFormComplete();
        return;
      }

      if (hasMeaningfulFieldChange(this.previousFieldSignatures, currentSignatures)) {
        this.previousFieldSignatures = currentSignatures;
        this.hadVisibleFields = fields.length > 0;
        this.previousUrl = currentUrl;
        logObserver('new form page detected');
        this.onNewPage(fields);
        return;
      }

      this.hadVisibleFields = fields.length > 0;
      this.previousUrl = currentUrl;
    } catch (error) {
      logObserver(
        `check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}

import { fillFields } from '@/content/filler';
import { matchFields } from '@/content/matcher';
import { scanForNextButton, scanPageFields } from '@/content/scanner';
import { ATS_SELECTORS, PORTAL_URLS } from '@/shared/constants';
import { flattenProfile, getAutofillData } from '@/shared/storage';
import type { AppSettings, FillResult, UserProfile } from '@/shared/types';
import { isElementVisible, waitForElement } from '@/shared/utils';

const LINKEDIN_SELECTORS = {
  easyApplyModal: '.jobs-easy-apply-modal',
  easyApplyButton: 'button[aria-label="Easy Apply"]',
  applyButton: 'button[aria-label="Apply"], a[aria-label="Apply"]',
  jobTitle: ['.jobs-unified-top-card__job-title', 'h1'],
  company: ['.jobs-unified-top-card__company-name', '.topcard__org-name-link'],
  location: ['.jobs-unified-top-card__bullet'],
} as const;

const MAX_EASY_APPLY_STEPS = 10;
const STEP_TRANSITION_MS = 600;
const MODAL_WAIT_MS = 3000;

export type LinkedInApplyType = 'easy-apply' | 'external-apply' | 'none';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function queryText(selectors: readonly string[]): string {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const text = element?.textContent?.replace(/\s+/g, ' ').trim();
    if (text) {
      return text;
    }
  }

  return '';
}

function mergeFillResults(left: FillResult, right: FillResult): FillResult {
  return {
    filled: left.filled + right.filled,
    skipped: left.skipped + right.skipped,
    unknown: [...left.unknown, ...right.unknown],
    errors: [...left.errors, ...right.errors],
  };
}

function emptyFillResult(errors: string[] = []): FillResult {
  return {
    filled: 0,
    skipped: 0,
    unknown: [],
    errors,
  };
}

function isLinkedInHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com');
  } catch {
    return url.includes('linkedin.com');
  }
}

function getApplyHref(element: HTMLElement): string | null {
  if (element instanceof HTMLAnchorElement && element.href) {
    return element.href;
  }

  const anchor = element.closest('a[href]');
  if (anchor instanceof HTMLAnchorElement && anchor.href) {
    return anchor.href;
  }

  const nestedAnchor = element.querySelector('a[href]');
  if (nestedAnchor instanceof HTMLAnchorElement && nestedAnchor.href) {
    return nestedAnchor.href;
  }

  return null;
}

function findEasyApplyButton(): HTMLButtonElement | null {
  const buttons = document.querySelectorAll(LINKEDIN_SELECTORS.easyApplyButton);

  for (const button of buttons) {
    if (button instanceof HTMLButtonElement && isElementVisible(button)) {
      return button;
    }
  }

  return null;
}

function findApplyControl(): HTMLElement | null {
  const controls = document.querySelectorAll(LINKEDIN_SELECTORS.applyButton);

  for (const control of controls) {
    if (control instanceof HTMLElement && isElementVisible(control)) {
      return control;
    }
  }

  return null;
}

function findApplyLink(): HTMLAnchorElement | null {
  const control = findApplyControl();
  if (!control) {
    return null;
  }

  if (control instanceof HTMLAnchorElement) {
    return control;
  }

  const anchor = control.closest('a[href]');
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function findNextButtonInModal(modal: HTMLElement): HTMLButtonElement | null {
  const linkedInNext = modal.querySelector(ATS_SELECTORS.linkedin.nextButton);
  if (
    linkedInNext instanceof HTMLButtonElement &&
    isElementVisible(linkedInNext) &&
    !linkedInNext.disabled
  ) {
    return linkedInNext;
  }

  const genericNext = scanForNextButton(modal);
  if (genericNext && isElementVisible(genericNext) && !genericNext.disabled) {
    return genericNext;
  }

  return null;
}

export class LinkedInPortal {
  isApplicable(): boolean {
    const href = window.location.href.toLowerCase();
    return PORTAL_URLS.linkedin.some((pattern) => href.includes(pattern));
  }

  getApplyType(): LinkedInApplyType {
    if (findEasyApplyButton()) {
      return 'easy-apply';
    }

    const applyControl = findApplyControl();
    if (!applyControl) {
      return 'none';
    }

    const href = getApplyHref(applyControl);
    if (href && !isLinkedInHost(href)) {
      return 'external-apply';
    }

    return 'none';
  }

  getExternalApplyUrl(): string | null {
    const applyLink = findApplyLink();
    if (!applyLink?.href) {
      return null;
    }

    return isLinkedInHost(applyLink.href) ? null : applyLink.href;
  }

  extractJobInfo(): { company: string; title: string; location: string } {
    return {
      title: queryText(LINKEDIN_SELECTORS.jobTitle),
      company: queryText(LINKEDIN_SELECTORS.company),
      location: queryText(LINKEDIN_SELECTORS.location),
    };
  }

  async handleEasyApply(
    profile: UserProfile,
    settings: AppSettings,
  ): Promise<FillResult> {
    const easyApplyButton = findEasyApplyButton();
    if (!easyApplyButton) {
      return emptyFillResult(['Easy Apply button not found']);
    }

    easyApplyButton.click();

    let modal: HTMLElement;
    try {
      modal = await waitForElement(LINKEDIN_SELECTORS.easyApplyModal, MODAL_WAIT_MS);
    } catch {
      return emptyFillResult(['Easy Apply modal did not open']);
    }

    const { learnedFields, communityFields } = await getAutofillData();
    const flatProfile = flattenProfile(profile);
    let combinedResult = emptyFillResult();

    for (let step = 0; step < MAX_EASY_APPLY_STEPS; step += 1) {
      const fields = scanPageFields(modal);
      const matchedFields = matchFields(
        fields,
        profile,
        learnedFields,
        communityFields,
        'linkedin',
      );
      const stepResult = fillFields(matchedFields, flatProfile, settings);
      combinedResult = mergeFillResults(combinedResult, stepResult);

      if (settings.pauseBeforeSubmit) {
        break;
      }

      const nextButton = findNextButtonInModal(modal);
      if (!nextButton) {
        break;
      }

      nextButton.click();
      await delay(STEP_TRANSITION_MS);
    }

    return combinedResult;
  }
}

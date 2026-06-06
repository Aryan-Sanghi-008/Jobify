import type { PortalName } from './types';
import { isElementVisible, normalizeLabel } from './utils';

export interface PortalSelectors {
  applyButton: string[];
  nextButton: string[];
  submitButton: string[];
  formContainer: string[];
  jobTitle: string[];
  companyName: string[];
  location: string[];
  easyApplyButton: string[];
  coverLetterField: string[];
}

const EMPTY_SELECTORS: PortalSelectors = {
  applyButton: [],
  nextButton: [],
  submitButton: [],
  formContainer: [],
  jobTitle: [],
  companyName: [],
  location: [],
  easyApplyButton: [],
  coverLetterField: [],
};

const BUTTON_SELECTORS = ['button', 'a[href]', 'input[type="submit"]', '[role="button"]'];

const NEXT_BUTTON_PATTERNS = [/^next$/i, /^continue$/i, /^proceed$/i];

const SUBMIT_BUTTON_PATTERNS = [
  /^submit$/i,
  /^apply now$/i,
  /^send application$/i,
  /^submit application$/i,
  /^apply$/i,
];

const COVER_LETTER_LABEL_PATTERNS = [
  'cover letter',
  'cover note',
  'message',
  'why are you interested',
  'why do you want to join',
];

const PORTAL_SELECTORS: Record<PortalName, PortalSelectors> = {
  linkedin: {
    applyButton: [
      'button[aria-label="Apply"]',
      'a[aria-label="Apply"]',
      '.jobs-apply-button',
    ],
    nextButton: [
      'button[aria-label="Continue to next step"]',
      'button[aria-label="Review your application"]',
      'button.artdeco-button--primary',
    ],
    submitButton: [
      'button[aria-label="Submit application"]',
      'button[aria-label="Submit"]',
    ],
    formContainer: [
      '.jobs-easy-apply-modal',
      '.jobs-easy-apply-content',
    ],
    jobTitle: [
      '.jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title',
      'h1',
    ],
    companyName: [
      '.jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      '.job-details-jobs-unified-top-card__company-name',
    ],
    location: [
      '.jobs-unified-top-card__bullet',
      '.job-details-jobs-unified-top-card__primary-description-container',
    ],
    easyApplyButton: [
      'button[aria-label="Easy Apply"]',
      'button.jobs-apply-button',
    ],
    coverLetterField: [
      'textarea[name*="cover" i]',
      'textarea[id*="cover" i]',
    ],
  },
  naukri: {
    applyButton: [
      'button#apply-button',
      'a.apply-button',
      'button[data-testid="apply-button"]',
    ],
    nextButton: [
      'button[type="submit"]',
      'button.next-btn',
    ],
    submitButton: [
      'button[type="submit"]',
      'button.submit-btn',
    ],
    formContainer: [
      'form[class*="apply"]',
      '.apply-modal',
      '[class*="application-form"]',
      'form',
    ],
    jobTitle: [
      'h1.styles_jd-header-title',
      'h1.jd-header-title',
      'h1',
    ],
    companyName: [
      'a.styles_comp-name',
      '.comp-name',
      '[class*="company-name"]',
    ],
    location: [
      '.styles_jhc__loc',
      '[class*="location"]',
    ],
    easyApplyButton: [],
    coverLetterField: [
      'textarea[name*="cover" i]',
      'textarea[placeholder*="cover" i]',
    ],
  },
  wellfound: {
    applyButton: [
      'button[data-test="Apply"]',
      'button[data-test="apply-button"]',
      'a[data-test="Apply"]',
      '.component-apply-button button',
    ],
    nextButton: [
      'button[data-test="next"]',
      'button[type="submit"]',
    ],
    submitButton: [
      'button[data-test="submit"]',
      'button[type="submit"]',
    ],
    formContainer: [
      'form[data-test="application-form"]',
      'form.application-form',
      'form',
    ],
    jobTitle: [
      '[data-test="job-title"]',
      'h1',
    ],
    companyName: [
      '[data-test="company-name"]',
      'a[data-test="startup-link"]',
      '[class*="company"]',
    ],
    location: [
      '[data-test="location"]',
      '[class*="location"]',
    ],
    easyApplyButton: [],
    coverLetterField: [
      'textarea[name*="cover" i]',
      'textarea[data-test*="cover" i]',
    ],
  },
  instahyre: {
    applyButton: [
      'button.apply-btn',
      'button.apply-button',
      'a.apply-btn',
      '.apply-button',
    ],
    nextButton: [
      'button.next',
      'button[type="submit"]',
    ],
    submitButton: [
      'button.submit',
      'button[type="submit"]',
    ],
    formContainer: [
      'form.application-form',
      '.application-modal form',
      'form',
    ],
    jobTitle: [
      'h1.job-title',
      '.job-title',
      'h1',
    ],
    companyName: [
      '.company-name',
      '[class*="company-name"]',
    ],
    location: [
      '.job-location',
      '[class*="location"]',
    ],
    easyApplyButton: [],
    coverLetterField: [
      'textarea[name*="cover" i]',
      'textarea.cover-letter',
    ],
  },
  greenhouse: {
    applyButton: [
      '#apply_button',
      'a#apply_button',
      'button#apply_button',
    ],
    nextButton: [
      'button[type="submit"]',
      'input[type="submit"]',
    ],
    submitButton: [
      '#submit_app',
      'button[type="submit"]',
      'input[type="submit"]',
    ],
    formContainer: [
      '#application_form',
      'form#application_form',
    ],
    jobTitle: [
      '.app-title',
      'h1',
    ],
    companyName: [
      '.company-name',
      '#header .company-name',
    ],
    location: [
      '.location',
      '[class*="location"]',
    ],
    easyApplyButton: [],
    coverLetterField: [
      '#cover_letter',
      'textarea[name="cover_letter"]',
    ],
  },
  lever: {
    applyButton: [
      'a.postings-btn',
      'button.postings-btn',
      '.posting-btn-apply',
    ],
    nextButton: [
      'button.template-btn-submit',
      'button[type="submit"]',
    ],
    submitButton: [
      'button.postings-btn-submit',
      'button.template-btn-submit',
    ],
    formContainer: [
      'form.posting-application-form',
      'form.application-form',
    ],
    jobTitle: [
      'h2.posting-headline',
      '.posting-headline',
      'h1',
    ],
    companyName: [
      '.main-header-logo img[alt]',
      '.posting-company',
    ],
    location: [
      '.posting-categories .location',
      '.sort-by-location',
      '[class*="location"]',
    ],
    easyApplyButton: [],
    coverLetterField: [
      '#additional',
      'textarea[name="comments"]',
    ],
  },
  workday: {
    applyButton: [
      'button[data-automation-id="jobPostingApplyButton"]',
      'a[data-automation-id="jobPostingApplyButton"]',
    ],
    nextButton: [
      'button[data-automation-id="bottom-navigation-next-button"]',
      'button[data-automation-id="pageFooterNextButton"]',
    ],
    submitButton: [
      'button[data-automation-id="bottom-navigation-next-button"][aria-label*="Submit"]',
      'button[data-automation-id="submitButton"]',
    ],
    formContainer: [
      'div[data-automation-id="applyFlowPage"]',
      '[data-automation-id="applyFlowPrimaryPage"]',
    ],
    jobTitle: [
      '[data-automation-id="jobTitle"]',
      'h1',
    ],
    companyName: [
      '[data-automation-id="company"]',
      '[data-automation-id="companyName"]',
    ],
    location: [
      '[data-automation-id="location"]',
      '[data-automation-id="locations"]',
    ],
    easyApplyButton: [],
    coverLetterField: [
      'textarea[data-automation-id*="cover" i]',
      'textarea[aria-label*="cover" i]',
    ],
  },
  generic: { ...EMPTY_SELECTORS },
};

function safeQueryAll(selector: string, root: ParentNode): HTMLElement[] {
  try {
    return Array.from(root.querySelectorAll(selector)).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
  } catch {
    return [];
  }
}

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function getElementButtonText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    return getTrimmedText(element.value || element.getAttribute('aria-label'));
  }

  return getTrimmedText(
    element.textContent || element.getAttribute('aria-label'),
  );
}

function matchesButtonPatterns(text: string, patterns: RegExp[]): boolean {
  const normalized = normalizeLabel(text);
  if (!normalized) {
    return false;
  }

  return patterns.some((pattern) => pattern.test(normalized));
}

function isActionable(element: HTMLElement): boolean {
  if (!isElementVisible(element)) {
    return false;
  }

  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement
  ) {
    return !element.disabled;
  }

  return true;
}

function hasTextContent(element: Element): boolean {
  return getTrimmedText(element.textContent).length > 0;
}

function queryFirstVisible(
  selectors: string[],
  root: ParentNode,
  requireText = false,
): Element | null {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    if (
      element instanceof HTMLElement &&
      isElementVisible(element) &&
      (!requireText || hasTextContent(element))
    ) {
      return element;
    }
  }

  return null;
}

function findButtonByPatterns(
  patterns: RegExp[],
  root: ParentNode,
): Element | null {
  const candidates: HTMLElement[] = [];

  for (const selector of BUTTON_SELECTORS) {
    candidates.push(...safeQueryAll(selector, root));
  }

  for (const candidate of candidates) {
    if (!isActionable(candidate)) {
      continue;
    }

    const text = getElementButtonText(candidate);
    if (matchesButtonPatterns(text, patterns)) {
      return candidate;
    }
  }

  return null;
}

function findApplyButton(root: ParentNode): Element | null {
  const candidates: HTMLElement[] = [];

  for (const selector of BUTTON_SELECTORS) {
    candidates.push(...safeQueryAll(selector, root));
  }

  for (const candidate of candidates) {
    if (!isActionable(candidate)) {
      continue;
    }

    const text = getElementButtonText(candidate);
    const normalized = normalizeLabel(text);
    if (!normalized || /easy apply/i.test(normalized)) {
      continue;
    }

    if (/apply/i.test(normalized)) {
      return candidate;
    }
  }

  return null;
}

function findEasyApplyButton(root: ParentNode): Element | null {
  const candidates: HTMLElement[] = [];

  for (const selector of BUTTON_SELECTORS) {
    candidates.push(...safeQueryAll(selector, root));
  }

  for (const candidate of candidates) {
    if (!isActionable(candidate)) {
      continue;
    }

    const text = getElementButtonText(candidate);
    if (/easy apply/i.test(text)) {
      return candidate;
    }
  }

  return null;
}

function findFormContainer(root: ParentNode): Element | null {
  const selectors = ['form', '[role="form"]', 'main form'];
  const match = queryFirstVisible(selectors, root);
  if (match) {
    return match;
  }

  const forms = safeQueryAll('form', root).filter(isElementVisible);
  if (forms.length === 0) {
    return null;
  }

  return forms.reduce((largest, current) => {
    const largestArea = largest.offsetWidth * largest.offsetHeight;
    const currentArea = current.offsetWidth * current.offsetHeight;
    return currentArea > largestArea ? current : largest;
  });
}

function findMetadataElement(
  selectors: string[],
  root: ParentNode,
): Element | null {
  return queryFirstVisible(selectors, root, true);
}

function findCoverLetterField(root: ParentNode): Element | null {
  const textareas = safeQueryAll('textarea', root);

  for (const textarea of textareas) {
    if (!isElementVisible(textarea)) {
      continue;
    }

    const label = normalizeLabel(
      [
        textarea.getAttribute('aria-label'),
        textarea.getAttribute('placeholder'),
        textarea.getAttribute('name'),
        textarea.id,
      ]
        .filter(Boolean)
        .join(' '),
    );

    const matchesCoverLetter = COVER_LETTER_LABEL_PATTERNS.some((pattern) =>
      label.includes(pattern),
    );

    if (matchesCoverLetter) {
      return textarea;
    }
  }

  return null;
}

function getGenericFallback(
  key: keyof PortalSelectors,
  root: ParentNode,
): Element | null {
  switch (key) {
    case 'applyButton':
      return findApplyButton(root);
    case 'nextButton':
      return findButtonByPatterns(NEXT_BUTTON_PATTERNS, root);
    case 'submitButton':
      return findButtonByPatterns(SUBMIT_BUTTON_PATTERNS, root);
    case 'formContainer':
      return findFormContainer(root);
    case 'jobTitle':
      return findMetadataElement(
        ['h1', '[data-testid="job-title"]', '.job-title'],
        root,
      );
    case 'companyName':
      return findMetadataElement(
        ['[class*="company" i]', '[data-testid*="company" i]'],
        root,
      );
    case 'location':
      return findMetadataElement(
        ['[class*="location" i]', '[data-testid*="location" i]'],
        root,
      );
    case 'easyApplyButton':
      return findEasyApplyButton(root);
    case 'coverLetterField':
      return findCoverLetterField(root);
    default:
      return null;
  }
}

export class SelectorRegistry {
  getSelectors(portal: PortalName): PortalSelectors {
    return PORTAL_SELECTORS[portal];
  }

  trySelectors(
    portal: PortalName,
    key: keyof PortalSelectors,
    root: ParentNode = document,
  ): Element | null {
    const selectors = this.getSelectors(portal)[key];
    const portalMatch = queryFirstVisible(selectors, root, isMetadataKey(key));

    if (portalMatch) {
      return portalMatch;
    }

    return getGenericFallback(key, root);
  }
}

function isMetadataKey(key: keyof PortalSelectors): boolean {
  return key === 'jobTitle' || key === 'companyName' || key === 'location';
}

export const selectorRegistry = new SelectorRegistry();

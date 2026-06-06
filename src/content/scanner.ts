import { VERSION } from '@/shared/constants';
import { selectorRegistry } from '@/shared/selectorRegistry';
import type { FormField, FormFieldType } from '@/shared/types';
import { detectPortal, isElementVisible, normalizeLabel } from '@/shared/utils';

export const MAX_SCAN_FIELDS = 50;

export interface ScanPageFieldsResult {
  fields: FormField[];
  excessiveFieldCount: boolean;
  totalCandidates: number;
}

const COVER_LETTER_LABEL_PATTERNS = [
  'cover letter',
  'cover note',
  'message',
  'why are you interested',
  'why do you want to join',
];

const CAPTCHA_SELECTORS = [
  '[class*="captcha" i]',
  '[id*="captcha" i]',
  '[class*="recaptcha" i]',
  '[id*="recaptcha" i]',
  '[class*="hcaptcha" i]',
  '[id*="hcaptcha" i]',
  '.g-recaptcha',
  '.h-captcha',
];

const FIELD_SELECTORS = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
  'textarea',
  'select',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="textbox"]',
];

const BUTTON_SELECTORS = ['button', 'input[type="submit"]', '[role="button"]'];

const NEXT_BUTTON_PATTERNS = [/^next$/i, /^continue$/i, /^proceed$/i];

const SUBMIT_BUTTON_PATTERNS = [
  /^submit$/i,
  /^apply now$/i,
  /^send application$/i,
  /^submit application$/i,
  /^apply$/i,
];

void VERSION;

function safeQueryAll(
  selector: string,
  root: ParentNode = document,
): HTMLElement[] {
  try {
    return Array.from(root.querySelectorAll(selector)).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
  } catch {
    return [];
  }
}

function safeGetElementById(id: string): HTMLElement | null {
  try {
    const element = document.getElementById(id);
    return element instanceof HTMLElement ? element : null;
  } catch {
    return null;
  }
}

function safeClosest(element: HTMLElement, selector: string): Element | null {
  try {
    return element.closest(selector);
  } catch {
    return null;
  }
}

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function escapeCssIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function getLabelTextFromElement(labelElement: HTMLElement): string {
  const clone = labelElement.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('input, textarea, select, button')
    .forEach((node) => node.remove());
  return getTrimmedText(clone.textContent);
}

function getAriaLabelledByText(element: HTMLElement): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (!labelledBy) {
    return '';
  }

  return labelledBy
    .split(/\s+/)
    .map((id) => getTrimmedText(safeGetElementById(id)?.textContent))
    .filter(Boolean)
    .join(' ');
}

function getPreviousSiblingText(element: HTMLElement): string {
  let current: HTMLElement | null = element;

  for (let depth = 0; depth < 2 && current; depth += 1) {
    const sibling = current.previousElementSibling;
    if (sibling) {
      const text = getTrimmedText(sibling.textContent);
      if (text) {
        return text;
      }
    }

    current = current.parentElement;
  }

  return '';
}

function getParentLabelText(element: HTMLElement): string {
  const parent = element.parentElement;
  if (!parent) {
    return '';
  }

  const clone = parent.cloneNode(true) as HTMLElement;
  const target = clone.querySelector(
    `#${escapeCssIdent(element.id)}`,
  ) as HTMLElement | null;

  if (target) {
    target.remove();
  } else if (clone.firstElementChild instanceof HTMLElement) {
    clone.firstElementChild.remove();
  }

  return getTrimmedText(clone.textContent).slice(0, 50);
}

function extractLabel(element: HTMLElement): string {
  if (element.id) {
    const associatedLabels = safeQueryAll(
      `label[for="${escapeCssIdent(element.id)}"]`,
    );
    for (const label of associatedLabels) {
      const text = getLabelTextFromElement(label);
      if (text) {
        return text;
      }
    }
  }

  const ariaLabel = getTrimmedText(element.getAttribute('aria-label'));
  if (ariaLabel) {
    return ariaLabel;
  }

  const labelledByText = getAriaLabelledByText(element);
  if (labelledByText) {
    return labelledByText;
  }

  const placeholder = getTrimmedText(element.getAttribute('placeholder'));
  if (placeholder) {
    return placeholder;
  }

  const ancestorLabel = safeClosest(element, 'label');
  if (ancestorLabel instanceof HTMLElement) {
    const text = getLabelTextFromElement(ancestorLabel);
    if (text) {
      return text;
    }
  }

  const siblingText = getPreviousSiblingText(element);
  if (siblingText) {
    return siblingText;
  }

  const parentText = getParentLabelText(element);
  if (parentText) {
    return parentText;
  }

  return 'unlabeled_field';
}

function detectFieldType(element: HTMLElement): FormFieldType {
  const role = element.getAttribute('role')?.toLowerCase();
  const placeholder = element.getAttribute('placeholder') ?? '';

  if (
    element instanceof HTMLSelectElement ||
    role === 'combobox' ||
    role === 'listbox'
  ) {
    return 'select';
  }

  if (element instanceof HTMLTextAreaElement) {
    return 'textarea';
  }

  if (element instanceof HTMLInputElement) {
    switch (element.type) {
      case 'email':
        return 'email';
      case 'tel':
        return 'tel';
      case 'file':
        return 'file';
      case 'radio':
        return 'radio';
      case 'checkbox':
        return 'checkbox';
      case 'date':
        return 'date';
      case 'url':
      case 'text':
      case 'search':
      case 'number':
      case 'password':
        return 'text';
      default:
        break;
    }
  }

  if (/email/i.test(placeholder)) {
    return 'email';
  }

  if (/phone|mobile|tel/i.test(placeholder)) {
    return 'tel';
  }

  return 'text';
}

function isAriaHidden(element: HTMLElement): boolean {
  if (element.getAttribute('aria-hidden') === 'true') {
    return true;
  }

  return safeClosest(element, '[aria-hidden="true"]') !== null;
}

function isCaptchaField(element: HTMLElement): boolean {
  for (const selector of CAPTCHA_SELECTORS) {
    if (safeClosest(element, selector) !== null) {
      return true;
    }
  }

  return false;
}

function isAlreadyFilled(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') {
      return element.checked;
    }

    return element.value.trim() !== '';
  }

  if (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value.trim() !== '';
  }

  if (element.getAttribute('role') === 'textbox') {
    return getTrimmedText(element.textContent) !== '';
  }

  return false;
}

function shouldIncludeField(element: HTMLElement): boolean {
  return (
    isElementVisible(element) &&
    !isAriaHidden(element) &&
    !isCaptchaField(element) &&
    !isAlreadyFilled(element)
  );
}

function buildFormField(element: HTMLElement): FormField | null {
  if (!shouldIncludeField(element)) {
    return null;
  }

  return {
    element,
    label: extractLabel(element),
    type: detectFieldType(element),
    confidence: 0,
    filled: false,
    unknown: false,
  };
}

function sortByDomOrder(fields: FormField[]): FormField[] {
  return [...fields].sort((left, right) => {
    const position = left.element.compareDocumentPosition(right.element);

    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }

    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }

    return 0;
  });
}

function resolveScanRoot(explicitRoot?: ParentNode): ParentNode {
  if (explicitRoot !== undefined && explicitRoot !== document) {
    return explicitRoot;
  }

  const portal = detectPortal(window.location.href);
  if (portal === 'generic') {
    return document;
  }

  const container = selectorRegistry.trySelectors(portal, 'formContainer');
  return container ?? document;
}

function collectCandidateElements(root: ParentNode = document): HTMLElement[] {
  if (typeof document === 'undefined') {
    return [];
  }

  const elements = new Set<HTMLElement>();

  for (const selector of FIELD_SELECTORS) {
    for (const element of safeQueryAll(selector, root)) {
      elements.add(element);
    }
  }

  return Array.from(elements);
}

function scanPageFieldsInternal(root?: ParentNode): ScanPageFieldsResult {
  const scanRoot = resolveScanRoot(root);
  const candidates = collectCandidateElements(scanRoot);
  const excessiveFieldCount = candidates.length > MAX_SCAN_FIELDS;
  const limitedCandidates = excessiveFieldCount
    ? candidates.slice(0, MAX_SCAN_FIELDS)
    : candidates;

  const fields = limitedCandidates
    .map((element) => buildFormField(element))
    .filter((field): field is FormField => field !== null);

  return {
    fields: sortByDomOrder(fields),
    excessiveFieldCount,
    totalCandidates: candidates.length,
  };
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

function findActionButton(
  patterns: RegExp[],
  root: ParentNode = document,
): HTMLButtonElement | null {
  const candidates: HTMLElement[] = [];

  for (const selector of BUTTON_SELECTORS) {
    candidates.push(...safeQueryAll(selector, root));
  }

  const visibleCandidates = candidates.filter(
    (candidate): candidate is HTMLButtonElement =>
      candidate instanceof HTMLButtonElement && isElementVisible(candidate),
  );

  for (const candidate of visibleCandidates) {
    const text = getElementButtonText(candidate);
    if (matchesButtonPatterns(text, patterns)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Scans the current page for unfilled, visible form fields.
 */
export function scanPageFieldsWithMeta(root?: ParentNode): ScanPageFieldsResult {
  try {
    return scanPageFieldsInternal(root);
  } catch {
    return {
      fields: [],
      excessiveFieldCount: false,
      totalCandidates: 0,
    };
  }
}

/**
 * Scans the current page for unfilled, visible form fields.
 */
export function scanPageFields(root?: ParentNode): FormField[] {
  return scanPageFieldsWithMeta(root).fields;
}

/**
 * Finds a visible multi-page form "next" action button.
 */
export function scanForNextButton(root?: ParentNode): HTMLButtonElement | null {
  try {
    const scanRoot = resolveScanRoot(root);
    return findActionButton(NEXT_BUTTON_PATTERNS, scanRoot);
  } catch {
    return null;
  }
}

/**
 * Finds a visible form submit/apply action button.
 */
export function scanForSubmitButton(): HTMLButtonElement | null {
  try {
    return findActionButton(SUBMIT_BUTTON_PATTERNS);
  } catch {
    return null;
  }
}

/**
 * Finds a visible cover-letter textarea on the page.
 */
export function scanForCoverLetterField(): HTMLElement | null {
  try {
    const textareas = safeQueryAll('textarea');

    for (const textarea of textareas) {
      if (!isElementVisible(textarea)) {
        continue;
      }

      const label = normalizeLabel(extractLabel(textarea));
      const isCoverLetterField = COVER_LETTER_LABEL_PATTERNS.some((pattern) =>
        label.includes(pattern),
      );

      if (isCoverLetterField) {
        return textarea;
      }
    }

    return null;
  } catch {
    return null;
  }
}

import { Logger } from '@/shared/logger';
import type { PortalSelectors } from '@/shared/selectorRegistry';
import {
  getSelectorHealth,
  reportSelectorFailure,
} from '@/shared/selectorHealth';
import type { PortalName } from '@/shared/types';
import { isElementVisible, normalizeLabel } from '@/shared/utils';

export { getSelectorHealth, reportSelectorFailure };

const BUTTON_TAGS = ['button', 'a', 'input[type="submit"]'];

const APPLY_TEXT_PATTERNS = [/apply/i, /submit application/i, /apply now/i];
const NEXT_TEXT_PATTERNS = [/next/i, /continue/i, /proceed/i];
const SUBMIT_TEXT_PATTERNS = [/submit/i, /apply/i];

const COVER_LETTER_LABEL_PATTERNS = [
  'cover letter',
  'cover note',
  'message',
  'why are you interested',
  'why do you want to join',
];

function getSearchRoot(context?: Element): ParentNode {
  if (context instanceof HTMLElement) {
    return context;
  }

  if (typeof document !== 'undefined') {
    return document;
  }

  return context ?? document;
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

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
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

function safeQueryAll(selector: string, root: ParentNode): HTMLElement[] {
  try {
    return Array.from(root.querySelectorAll(selector)).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
  } catch {
    return [];
  }
}

function collectButtonCandidates(root: ParentNode): HTMLElement[] {
  const candidates = new Set<HTMLElement>();

  for (const selector of BUTTON_TAGS) {
    for (const element of safeQueryAll(selector, root)) {
      candidates.add(element);
    }
  }

  for (const element of safeQueryAll('[role="button"]', root)) {
    candidates.add(element);
  }

  return Array.from(candidates);
}

function findByTextPatterns(
  root: ParentNode,
  patterns: RegExp[],
  excludeEasyApply = false,
): HTMLElement | null {
  for (const candidate of collectButtonCandidates(root)) {
    if (!isActionable(candidate)) {
      continue;
    }

    const text = getElementButtonText(candidate);
    if (excludeEasyApply && /easy apply/i.test(text)) {
      continue;
    }

    if (matchesAnyPattern(text, patterns)) {
      return candidate;
    }
  }

  return null;
}

function findByAriaLabelPatterns(
  root: ParentNode,
  patterns: RegExp[],
): HTMLElement | null {
  for (const candidate of collectButtonCandidates(root)) {
    if (!isActionable(candidate)) {
      continue;
    }

    const ariaLabel = candidate.getAttribute('aria-label');
    if (!ariaLabel) {
      continue;
    }

    if (matchesAnyPattern(ariaLabel, patterns)) {
      return candidate;
    }
  }

  for (const candidate of safeQueryAll('[role="button"]', root)) {
    if (!isActionable(candidate)) {
      continue;
    }

    const ariaLabel = candidate.getAttribute('aria-label');
    if (ariaLabel && matchesAnyPattern(ariaLabel, patterns)) {
      return candidate;
    }
  }

  return null;
}

function findLargestForm(root: ParentNode): HTMLFormElement | null {
  const forms = safeQueryAll('form', root).filter(
    (element): element is HTMLFormElement =>
      element instanceof HTMLFormElement && isElementVisible(element),
  );

  if (forms.length === 0) {
    return null;
  }

  return forms.reduce((largest, current) => {
    const largestArea = largest.offsetWidth * largest.offsetHeight;
    const currentArea = current.offsetWidth * current.offsetHeight;
    return currentArea > largestArea ? current : largest;
  });
}

function findFirstHeading(root: ParentNode): HTMLHeadingElement | null {
  const heading = root.querySelector('h1');
  return heading instanceof HTMLHeadingElement && isElementVisible(heading)
    ? heading
    : null;
}

function findMetadataByClassHint(
  root: ParentNode,
  hint: 'company' | 'location',
): Element | null {
  const selectors =
    hint === 'company'
      ? ['[class*="company" i]', '[data-testid*="company" i]']
      : ['[class*="location" i]', '[data-testid*="location" i]'];

  for (const selector of selectors) {
    const element = root.querySelector(selector);
    if (
      element instanceof HTMLElement &&
      isElementVisible(element) &&
      getTrimmedText(element.textContent)
    ) {
      return element;
    }
  }

  return null;
}

function findCoverLetterField(root: ParentNode): HTMLTextAreaElement | null {
  for (const textarea of safeQueryAll('textarea', root)) {
    if (!(textarea instanceof HTMLTextAreaElement) || !isElementVisible(textarea)) {
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

    if (COVER_LETTER_LABEL_PATTERNS.some((pattern) => label.includes(pattern))) {
      return textarea;
    }
  }

  return null;
}

function describeHealedElement(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const tag = element.tagName.toLowerCase();
  const text = getTrimmedText(element.textContent).slice(0, 40);
  const ariaLabel = element.getAttribute('aria-label');

  if (ariaLabel) {
    return `${tag}[aria-label="${ariaLabel.slice(0, 40)}"]`;
  }

  if (text) {
    return `${tag} "${text}"`;
  }

  return tag;
}

function logHealedSelector(
  portal: PortalName,
  selectorKey: keyof PortalSelectors,
  element: Element,
  strategy: string,
): void {
  Logger.debug(
    'SelectorHealer',
    `Healed ${portal}.${selectorKey} via ${strategy}: ${describeHealedElement(element)}`,
  );
}

function healButtonSelector(
  portal: PortalName,
  selectorKey: keyof PortalSelectors,
  root: ParentNode,
  textPatterns: RegExp[],
  ariaPatterns: RegExp[],
  excludeEasyApply = false,
): Element | null {
  const textMatch = findByTextPatterns(root, textPatterns, excludeEasyApply);
  if (textMatch) {
    logHealedSelector(portal, selectorKey, textMatch, 'text-based search');
    return textMatch;
  }

  const roleMatch = findByAriaLabelPatterns(root, ariaPatterns);
  if (roleMatch) {
    logHealedSelector(portal, selectorKey, roleMatch, 'role/aria-label search');
    return roleMatch;
  }

  return null;
}

/**
 * Attempts to locate an element using heuristics when registry selectors fail.
 */
export function healSelector(
  portal: PortalName,
  selectorKey: keyof PortalSelectors,
  context?: Element,
): Element | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const root = getSearchRoot(context);

  switch (selectorKey) {
    case 'applyButton':
      return healButtonSelector(
        portal,
        selectorKey,
        root,
        APPLY_TEXT_PATTERNS,
        APPLY_TEXT_PATTERNS,
        true,
      );
    case 'easyApplyButton': {
      const easyApply = findByTextPatterns(root, [/easy apply/i]);
      if (easyApply) {
        logHealedSelector(portal, selectorKey, easyApply, 'text-based search');
        return easyApply;
      }

      const ariaMatch = findByAriaLabelPatterns(root, [/easy apply/i]);
      if (ariaMatch) {
        logHealedSelector(portal, selectorKey, ariaMatch, 'role/aria-label search');
        return ariaMatch;
      }

      return null;
    }
    case 'nextButton':
      return healButtonSelector(
        portal,
        selectorKey,
        root,
        NEXT_TEXT_PATTERNS,
        NEXT_TEXT_PATTERNS,
      );
    case 'submitButton':
      return healButtonSelector(
        portal,
        selectorKey,
        root,
        SUBMIT_TEXT_PATTERNS,
        SUBMIT_TEXT_PATTERNS,
      );
    case 'formContainer': {
      const form = findLargestForm(root);
      if (form) {
        logHealedSelector(portal, selectorKey, form, 'largest form heuristic');
        return form;
      }
      return null;
    }
    case 'jobTitle': {
      const heading = findFirstHeading(root);
      if (heading) {
        logHealedSelector(portal, selectorKey, heading, 'first h1 heuristic');
        return heading;
      }
      return null;
    }
    case 'companyName': {
      const company = findMetadataByClassHint(root, 'company');
      if (company) {
        logHealedSelector(portal, selectorKey, company, 'company metadata heuristic');
        return company;
      }
      return null;
    }
    case 'location': {
      const location = findMetadataByClassHint(root, 'location');
      if (location) {
        logHealedSelector(portal, selectorKey, location, 'location metadata heuristic');
        return location;
      }
      return null;
    }
    case 'coverLetterField': {
      const field = findCoverLetterField(root);
      if (field) {
        logHealedSelector(portal, selectorKey, field, 'cover letter textarea heuristic');
        return field;
      }
      return null;
    }
    default:
      return null;
  }
}

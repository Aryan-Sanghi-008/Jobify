import { PORTAL_URLS } from './constants';
import type { PortalName } from './types';

const JOB_TITLE_SELECTORS = [
  'h1',
  '[data-testid="job-title"]',
  '.job-title',
  '.jobs-unified-top-card__job-title',
  '.styles_jd-header-title',
];

const PORTAL_DETECTION_ORDER: PortalName[] = [
  'linkedin',
  'naukri',
  'wellfound',
  'instahyre',
  'greenhouse',
  'lever',
  'workday',
];

/**
 * Returns a random UUID v4 string.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Returns a consistent FNV-1a hash of a string, truncated to 8 hex characters.
 */
export function hashString(str: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
}

/**
 * Normalizes a form field label for fuzzy matching.
 * Lowercases, trims, strips special characters, and collapses whitespace.
 */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Replaces cover letter placeholders with provided values.
 * Supports {{company_name}}, {{job_title}}, and {{your_name}} case-insensitively.
 */
export function interpolateCoverLetter(
  template: string,
  vars: { company_name: string; job_title: string; your_name: string },
): string {
  return template
    .replace(/\{\{\s*company_name\s*\}\}/gi, vars.company_name)
    .replace(/\{\{\s*job_title\s*\}\}/gi, vars.job_title)
    .replace(/\{\{\s*your_name\s*\}\}/gi, vars.your_name);
}

/**
 * Reads the current page title and Open Graph meta tags to extract a company name.
 */
export function extractCompanyFromPage(): string {
  const ogSiteName = document
    .querySelector('meta[property="og:site_name"]')
    ?.getAttribute('content')
    ?.trim();
  if (ogSiteName) {
    return ogSiteName;
  }

  const ogTitle = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute('content')
    ?.trim();
  if (ogTitle) {
    const atIndex = ogTitle.lastIndexOf(' at ');
    if (atIndex !== -1) {
      return ogTitle.slice(atIndex + 4).trim();
    }
  }

  const title = document.title.trim();
  if (!title) {
    return '';
  }

  const titleAtIndex = title.lastIndexOf(' at ');
  if (titleAtIndex !== -1) {
    const companyPart = title.slice(titleAtIndex + 4);
    const separatorIndex = companyPart.search(/\s[-|•]\s/);
    return separatorIndex === -1
      ? companyPart.trim()
      : companyPart.slice(0, separatorIndex).trim();
  }

  const titleSeparatorIndex = title.search(/\s[-|•]\s/);
  if (titleSeparatorIndex !== -1) {
    return title.slice(titleSeparatorIndex + 3).trim();
  }

  return '';
}

/**
 * Reads the current page title, heading, and common job-title selectors.
 */
export function extractJobTitleFromPage(): string {
  for (const selector of JOB_TITLE_SELECTORS) {
    const element = document.querySelector(selector);
    const text = element?.textContent?.trim();
    if (text) {
      return text;
    }
  }

  const ogTitle = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute('content')
    ?.trim();
  if (ogTitle) {
    const atIndex = ogTitle.indexOf(' at ');
    return atIndex === -1 ? ogTitle : ogTitle.slice(0, atIndex).trim();
  }

  const title = document.title.trim();
  if (!title) {
    return '';
  }

  const atIndex = title.indexOf(' at ');
  if (atIndex !== -1) {
    return title.slice(0, atIndex).trim();
  }

  const separatorIndex = title.search(/\s[-|•]\s/);
  if (separatorIndex !== -1) {
    return title.slice(0, separatorIndex).trim();
  }

  return title;
}

/**
 * Detects which job portal or ATS a URL belongs to.
 */
export function detectPortal(url: string): PortalName {
  const normalizedUrl = url.toLowerCase();

  for (const portal of PORTAL_DETECTION_ORDER) {
    const patterns = PORTAL_URLS[portal];
    if (patterns.some((pattern) => normalizedUrl.includes(pattern))) {
      return portal;
    }
  }

  return 'generic';
}

/**
 * Returns whether an element is visible and has non-zero dimensions.
 */
export function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) {
    return false;
  }

  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

/**
 * Waits for an element matching the selector to appear in the DOM.
 * Rejects if the element is not found before the timeout elapses.
 */
export function waitForElement(
  selector: string,
  timeout = 5000,
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing instanceof HTMLElement) {
      resolve(existing);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement) {
        observer.disconnect();
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        resolve(element);
      }
    });

    timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element not found: ${selector}`));
    }, timeout);

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

/**
 * Sets an input value and dispatches events so framework-controlled fields update.
 */
export function simulateUserInput(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Selects an option by value or visible text and dispatches change events.
 */
export function simulateSelectChange(
  el: HTMLSelectElement,
  value: string,
): boolean {
  const normalizedValue = value.trim().toLowerCase();
  let matchedOption: HTMLOptionElement | undefined;

  for (const option of Array.from(el.options)) {
    if (option.value === value) {
      matchedOption = option;
      break;
    }
  }

  if (!matchedOption) {
    matchedOption = Array.from(el.options).find(
      (option) => option.textContent?.trim().toLowerCase() === normalizedValue,
    );
  }

  if (!matchedOption) {
    return false;
  }

  el.value = matchedOption.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

/**
 * Formats a rupee amount as an Indian LPA string.
 */
export function formatCTC(value: number): string {
  if (value <= 0) {
    return '0 LPA';
  }

  const lpa = value / 100_000;
  const formatted = Number.isInteger(lpa) ? String(lpa) : lpa.toFixed(1);
  return `${formatted.replace(/\.0$/, '')} LPA`;
}

/**
 * Parses common Indian salary inputs into a rupee amount.
 */
export function parseCTCInput(raw: string): number {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return 0;
  }

  const lpaMatch = trimmed.match(/^([\d.]+)\s*(?:lpa|l)\b/);
  if (lpaMatch) {
    return Math.round(parseFloat(lpaMatch[1]) * 100_000);
  }

  const digitsOnly = trimmed.replace(/,/g, '');
  if (/^\d+(\.\d+)?$/.test(digitsOnly)) {
    const numeric = parseFloat(digitsOnly);
    if (trimmed.includes(',') && numeric < 1000) {
      return Math.round(numeric * 100_000);
    }
    return Math.round(numeric);
  }

  const embeddedNumber = trimmed.match(/([\d,]+(?:\.\d+)?)/);
  if (!embeddedNumber) {
    return 0;
  }

  const parsed = parseFloat(embeddedNumber[1].replace(/,/g, ''));
  if (Number.isNaN(parsed)) {
    return 0;
  }

  if (trimmed.includes('lpa') || /\d\s*l\b/.test(trimmed)) {
    return Math.round(parsed * 100_000);
  }

  return Math.round(parsed);
}

/**
 * Returns a debounced version of the provided function.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): T {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = ((...args: Parameters<T>) => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  }) as T;

  return debounced;
}

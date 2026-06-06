import type { PageInfoResponse } from '@/shared/types';
import { detectPortal } from '@/shared/utils';

const APPLICATION_URL_PATTERNS = [
  /\/apply\b/i,
  /\/application\b/i,
  /myworkdayjobs\.com/i,
  /greenhouse\.io/i,
  /lever\.co/i,
  /\/jobs?\//i,
  /\/careers?\//i,
];

function isRestrictedBrowserUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  );
}

/** Whether a URL likely hosts a job application form. */
export function isLikelyApplicationUrl(url: string): boolean {
  if (!url || isRestrictedBrowserUrl(url)) {
    return false;
  }

  const normalized = url.toLowerCase();
  return APPLICATION_URL_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isValidPageInfoResponse(value: unknown): value is PageInfoResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'portal' in value &&
    typeof (value as PageInfoResponse).portal === 'string' &&
    typeof (value as PageInfoResponse).hasApplicationForm === 'boolean'
  );
}

/** Build page metadata from a tab URL when the content script is unavailable. */
export function buildPageInfoFromTabUrl(url: string): PageInfoResponse | null {
  if (isRestrictedBrowserUrl(url)) {
    return null;
  }

  const portal = detectPortal(url);
  const hasApplicationForm = portal !== 'generic' || isLikelyApplicationUrl(url);

  if (!hasApplicationForm) {
    return null;
  }

  return {
    company: '',
    jobTitle: '',
    portal,
    hasApplicationForm: true,
    formFieldCount: 0,
  };
}

/** Whether the popup should offer autofill on this page. */
export function isAutofillablePage(info: PageInfoResponse): boolean {
  return info.portal !== 'generic' || info.hasApplicationForm;
}

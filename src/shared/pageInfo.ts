import {
  detectPortalFromUrl,
  hasApplicationPageHeuristics,
  isLikelyApplicationUrl,
} from '@/shared/applicationDetection';
import type { PageInfoResponse } from '@/shared/types';

function isRestrictedBrowserUrl(url: string): boolean {
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  );
}

export { isLikelyApplicationUrl } from '@/shared/applicationDetection';

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

  const portal = detectPortalFromUrl(url);
  const urlLooksLikeApplication = isLikelyApplicationUrl(url);
  const hasApplicationForm =
    portal !== 'generic' || urlLooksLikeApplication;

  if (!hasApplicationForm) {
    return null;
  }

  return {
    company: '',
    jobTitle: '',
    portal,
    hasApplicationForm: true,
    formFieldCount: 0,
    formFrameId: 0,
  };
}

/** Whether the popup should offer autofill on this page. */
export function isAutofillablePage(info: PageInfoResponse): boolean {
  if (info.portal !== 'generic') {
    return true;
  }

  return info.hasApplicationForm;
}

export { hasApplicationPageHeuristics };

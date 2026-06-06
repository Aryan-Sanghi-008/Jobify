import type { PageInfoResponse } from '@/shared/types';

/** Whether the popup should offer autofill on this page. */
export function isAutofillablePage(info: PageInfoResponse): boolean {
  return info.portal !== 'generic' || info.hasApplicationForm;
}

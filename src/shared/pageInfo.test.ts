import { describe, expect, it } from 'vitest';
import { isAutofillablePage } from '@/shared/pageInfo';
import type { PageInfoResponse } from '@/shared/types';

function makePageInfo(
  overrides: Partial<PageInfoResponse> = {},
): PageInfoResponse {
  return {
    company: '',
    jobTitle: '',
    portal: 'generic',
    hasApplicationForm: false,
    formFieldCount: 0,
    ...overrides,
  };
}

describe('isAutofillablePage', () => {
  it('allows known job portals without requiring visible fields', () => {
    expect(isAutofillablePage(makePageInfo({ portal: 'workday' }))).toBe(true);
    expect(isAutofillablePage(makePageInfo({ portal: 'linkedin' }))).toBe(true);
  });

  it('allows generic pages when an application form is detected', () => {
    expect(
      isAutofillablePage(
        makePageInfo({
          portal: 'generic',
          hasApplicationForm: true,
          formFieldCount: 3,
        }),
      ),
    ).toBe(true);
  });

  it('blocks generic pages without application fields', () => {
    expect(isAutofillablePage(makePageInfo({ portal: 'generic' }))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildPageInfoFromTabUrl,
  isAutofillablePage,
  isLikelyApplicationUrl,
} from '@/shared/pageInfo';
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

describe('isLikelyApplicationUrl', () => {
  it('detects Workday apply URLs', () => {
    expect(
      isLikelyApplicationUrl(
        'https://qualys.wd5.myworkdayjobs.com/en-US/Careers/job/Pune/Sr-Software-Engineer_R0002473/apply?source=LinkedIn',
      ),
    ).toBe(true);
  });

  it('ignores restricted browser URLs', () => {
    expect(isLikelyApplicationUrl('chrome://extensions')).toBe(false);
  });
});

describe('buildPageInfoFromTabUrl', () => {
  it('returns Workday metadata for Qualys apply pages', () => {
    const info = buildPageInfoFromTabUrl(
      'https://qualys.wd5.myworkdayjobs.com/en-US/Careers/job/Pune/Sr-Software-Engineer_R0002473/apply?source=LinkedIn',
    );

    expect(info).toEqual({
      company: '',
      jobTitle: '',
      portal: 'workday',
      hasApplicationForm: true,
      formFieldCount: 0,
      formFrameId: 0,
    });
  });

  it('returns metadata for AlgoSec position URLs', () => {
    const info = buildPageInfoFromTabUrl(
      'https://www.algosec.com/position/software-developer%2C-india/0b-64e',
    );

    expect(info).toEqual({
      company: '',
      jobTitle: '',
      portal: 'generic',
      hasApplicationForm: true,
      formFieldCount: 0,
      formFrameId: 0,
    });
  });

  it('returns null for unrelated pages', () => {
    expect(buildPageInfoFromTabUrl('https://example.com/blog/post')).toBeNull();
  });
});

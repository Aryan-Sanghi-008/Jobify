import { describe, expect, it, vi } from 'vitest';
import {
  detectPortalFromEmbedUrl,
  detectPortalFromUrl,
  getEmbedHostPriority,
  hasApplicationPageHeuristics,
  isKnownApplicationEmbedUrl,
  isLikelyApplicationUrl,
} from '@/shared/applicationDetection';

describe('isLikelyApplicationUrl', () => {
  it('detects AlgoSec position URLs', () => {
    expect(
      isLikelyApplicationUrl(
        'https://www.algosec.com/position/software-developer%2C-india/0b-64e',
      ),
    ).toBe(true);
  });

  it('detects Comeet apply URLs', () => {
    expect(
      isLikelyApplicationUrl(
        'https://www.comeet.co/jobs/71.006/0B.64E/apply?token=abc',
      ),
    ).toBe(true);
  });

  it('detects SmartRecruiters and Ashby hosts', () => {
    expect(
      isLikelyApplicationUrl('https://jobs.smartrecruiters.com/acme/123'),
    ).toBe(true);
    expect(isLikelyApplicationUrl('https://jobs.ashbyhq.com/acme/123')).toBe(
      true,
    );
  });

  it('ignores unrelated blog URLs', () => {
    expect(isLikelyApplicationUrl('https://example.com/blog/post')).toBe(false);
  });
});

describe('embed detection', () => {
  it('recognizes Comeet iframe apply URLs', () => {
    const url =
      'https://www.comeet.co/jobs/71.006/0B.64E/apply?token=abc';
    expect(isKnownApplicationEmbedUrl(url)).toBe(true);
    expect(detectPortalFromEmbedUrl(url)).toBe('comeet');
    expect(getEmbedHostPriority(url)).toBeGreaterThan(0);
  });

  it('maps Comeet top-level URLs to the comeet portal', () => {
    expect(detectPortalFromUrl('https://www.comeet.co/jobs/123/apply')).toBe(
      'comeet',
    );
  });
});

/**
 * @vitest-environment jsdom
 */
describe('hasApplicationPageHeuristics', () => {
  it('detects mandatory-field copy and application iframes', () => {
    document.body.innerHTML = `
      <p>Fields marked with * are mandatory</p>
      <iframe src="https://www.comeet.co/jobs/1/2/apply"></iframe>
    `;

    vi.spyOn(HTMLIFrameElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 400,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    expect(hasApplicationPageHeuristics(document)).toBe(true);
  });
});

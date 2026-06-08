/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetFormContextWatcherForTests,
  scanLocalFormContext,
} from '@/content/frameContext';

function mockRenderedLayout(): void {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        display: 'block',
        visibility: 'visible',
        opacity: '1',
        getPropertyValue: () => '',
      }) as unknown as CSSStyleDeclaration,
  );

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 24,
    top: 0,
    left: 0,
    bottom: 24,
    right: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('frameContext', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal('location', {
      href: 'https://www.comeet.co/jobs/1/2/apply',
    });
    mockRenderedLayout();
    resetFormContextWatcherForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetFormContextWatcherForTests();
  });

  it('scans local form fields in the active frame', () => {
    document.body.innerHTML = `
      <input aria-label="First name" />
      <input aria-label="Email" type="email" />
      <input aria-label="Phone" type="tel" />
    `;

    const context = scanLocalFormContext();

    expect(context.fieldCount).toBe(3);
    expect(context.portal).toBe('comeet');
    expect(context.isTopFrame).toBe(true);
  });
});

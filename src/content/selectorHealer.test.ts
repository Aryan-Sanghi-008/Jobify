/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { healSelector } from '@/content/selectorHealer';

function mockVisibleLayout(): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1280,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 800,
  });

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

describe('healSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockVisibleLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds apply buttons via text-based search', () => {
    document.body.innerHTML = '<button type="button">Apply Now</button>';

    const healed = healSelector('wellfound', 'applyButton');

    expect(healed?.textContent).toContain('Apply Now');
  });

  it('finds next buttons via text-based search', () => {
    document.body.innerHTML = '<button type="button">Continue</button>';

    const healed = healSelector('instahyre', 'nextButton');

    expect(healed?.textContent).toBe('Continue');
  });

  it('finds a visible form for formContainer', () => {
    document.body.innerHTML = `
      <form id="application-form"><input aria-label="Email" /></form>
    `;

    const healed = healSelector('wellfound', 'formContainer');

    expect(healed).toBeInstanceOf(HTMLFormElement);
    expect(healed?.id).toBe('application-form');
  });

  it('finds the first h1 for jobTitle', () => {
    document.body.innerHTML = '<h1>Senior Engineer</h1>';

    const healed = healSelector('wellfound', 'jobTitle');

    expect(healed?.textContent).toBe('Senior Engineer');
  });

  it('scopes healing to the provided context element', () => {
    document.body.innerHTML = `
      <div id="outside"><button>Apply</button></div>
      <form id="inside"><button>Submit Application</button></form>
    `;

    const form = document.getElementById('inside');
    const healed = healSelector('wellfound', 'submitButton', form ?? undefined);

    expect(healed?.textContent).toBe('Submit Application');
  });
});

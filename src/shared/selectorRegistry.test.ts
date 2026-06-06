/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SelectorRegistry,
  selectorRegistry,
  type PortalSelectors,
} from '@/shared/selectorRegistry';

const METADATA_KEYS: Array<keyof PortalSelectors> = [
  'applyButton',
  'nextButton',
  'submitButton',
  'formContainer',
  'jobTitle',
  'companyName',
  'location',
  'easyApplyButton',
  'coverLetterField',
];

describe('SelectorRegistry', () => {
  const registry = new SelectorRegistry();

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 120,
      height: 32,
      top: 10,
      left: 10,
      bottom: 42,
      right: 130,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    });
  });

  it('returns non-empty selector arrays for linkedin', () => {
    const selectors = registry.getSelectors('linkedin');

    for (const key of METADATA_KEYS) {
      expect(selectors[key].length).toBeGreaterThan(0);
    }
  });

  it('returns empty arrays for generic portal', () => {
    const selectors = registry.getSelectors('generic');

    for (const key of METADATA_KEYS) {
      expect(selectors[key]).toEqual([]);
    }
  });

  it('returns the first visible portal-specific match', () => {
    document.body.innerHTML = `
      <button id="primary-next" aria-label="Continue to next step">Next</button>
      <button class="artdeco-button--primary">Fallback</button>
    `;

    const match = registry.trySelectors('linkedin', 'nextButton');
    expect(match?.id).toBe('primary-next');
  });

  it('falls through to the second selector when the first is absent', () => {
    document.body.innerHTML = `
      <button class="artdeco-button--primary" id="fallback-next">Next</button>
    `;

    const match = registry.trySelectors('linkedin', 'nextButton');
    expect(match?.id).toBe('fallback-next');
  });

  it('uses generic button-text fallback when portal selectors miss', () => {
    document.body.innerHTML = `
      <button id="generic-next">Continue</button>
    `;

    const match = registry.trySelectors('generic', 'nextButton');
    expect(match?.id).toBe('generic-next');
  });

  it('limits search to the provided root subtree', () => {
    document.body.innerHTML = `
      <div id="outside">
        <button aria-label="Continue to next step" id="outside-btn">Next</button>
      </div>
      <div id="modal">
        <button aria-label="Continue to next step" id="inside-btn">Next</button>
      </div>
    `;

    const modal = document.getElementById('modal');
    const match = registry.trySelectors('linkedin', 'nextButton', modal!);
    expect(match?.id).toBe('inside-btn');
  });

  it('returns empty easyApplyButton selectors for non-LinkedIn portals', () => {
    expect(registry.getSelectors('naukri').easyApplyButton).toEqual([]);
    expect(registry.getSelectors('greenhouse').easyApplyButton).toEqual([]);
  });

  it('finds easy apply via generic fallback on generic portal', () => {
    document.body.innerHTML = `
      <button id="easy-apply">Easy Apply</button>
    `;

    const match = registry.trySelectors('generic', 'easyApplyButton');
    expect(match?.id).toBe('easy-apply');
  });

  it('exposes a shared singleton instance', () => {
    expect(selectorRegistry).toBeInstanceOf(SelectorRegistry);
    expect(selectorRegistry.getSelectors('workday').formContainer.length).toBeGreaterThan(0);
  });
});

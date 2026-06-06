/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractCompanyFromPage,
  extractJobDescriptionFromPage,
  extractJobTitleFromPage,
  isElementVisible,
  simulateSelectChange,
  simulateUserInput,
} from '@/shared/utils';

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

describe('extractCompanyFromPage', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.title = '';
  });

  it('reads og:site_name when available', () => {
    document.head.innerHTML =
      '<meta property="og:site_name" content="Acme Corp" />';

    expect(extractCompanyFromPage()).toBe('Acme Corp');
  });

  it('parses company from document title with "at" separator', () => {
    document.title = 'Software Engineer at Acme Corp | Careers';

    expect(extractCompanyFromPage()).toBe('Acme Corp');
  });
});

describe('extractJobTitleFromPage', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.title = '';
  });

  it('reads the first matching job title selector', () => {
    document.body.innerHTML = '<h1>Senior Engineer</h1>';

    expect(extractJobTitleFromPage()).toBe('Senior Engineer');
  });

  it('parses job title from document title with "at" separator', () => {
    document.title = 'Senior Engineer at Acme Corp';

    expect(extractJobTitleFromPage()).toBe('Senior Engineer');
  });
});

describe('extractJobDescriptionFromPage', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    mockVisibleLayout();
  });

  it('reads job description from a class selector', () => {
    document.body.innerHTML = `
      <div class="job-description">
        We are looking for a talented engineer to join our team and build great products.
      </div>
    `;

    expect(extractJobDescriptionFromPage()).toContain('talented engineer');
  });

  it('reads meta description when no dedicated block exists', () => {
    document.head.innerHTML =
      '<meta name="description" content="Join our team as a senior software engineer working on distributed systems and cloud infrastructure." />';

    expect(extractJobDescriptionFromPage()).toContain('senior software engineer');
  });
});

describe('isElementVisible', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockVisibleLayout();
  });

  it('returns true for connected visible elements', () => {
    const button = document.createElement('button');
    button.textContent = 'Apply';
    document.body.appendChild(button);

    expect(isElementVisible(button)).toBe(true);
  });

  it('returns false for disconnected elements', () => {
    const input = document.createElement('input');
    expect(isElementVisible(input)).toBe(false);
  });
});

describe('simulateUserInput', () => {
  it('sets the value and dispatches input, change, and blur events', () => {
    const input = document.createElement('input');
    const events: string[] = [];

    for (const type of ['input', 'change', 'blur']) {
      input.addEventListener(type, () => events.push(type));
    }

    simulateUserInput(input, 'jane@example.com');

    expect(input.value).toBe('jane@example.com');
    expect(events).toEqual(['input', 'change', 'blur']);
  });
});

describe('simulateSelectChange', () => {
  it('selects an option by visible text', () => {
    const select = document.createElement('select');
    select.innerHTML = `
      <option value="">Choose</option>
      <option value="in">India</option>
      <option value="us">United States</option>
    `;
    document.body.appendChild(select);

    const changed = simulateSelectChange(select, 'India');

    expect(changed).toBe(true);
    expect(select.value).toBe('in');
  });

  it('returns false when no option matches', () => {
    const select = document.createElement('select');
    select.innerHTML = '<option value="in">India</option>';

    expect(simulateSelectChange(select, 'Canada')).toBe(false);
  });
});

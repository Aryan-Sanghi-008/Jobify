/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WorkdayATS,
  detectWorkdaySection,
  fillWorkdayDropdown,
  filterWorkdayFields,
  parseDateParts,
  runWorkdayMatchAndFill,
} from '@/content/ats/workday';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, flattenProfile } from '@/shared/storage';
import type { FormField } from '@/shared/types';

function mockVisibleLayout(): void {
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

function makeField(element: HTMLElement, label: string): FormField {
  return {
    element,
    label,
    type: 'text',
    confidence: 1,
    filled: false,
    unknown: false,
  };
}

describe('WorkdayATS', () => {
  const ats = new WorkdayATS();

  it('is applicable on Workday hosts', () => {
    vi.stubGlobal('location', {
      href: 'https://acme.wd5.myworkdayjobs.com/en-US/careers/job/123',
    });
    expect(ats.isApplicable()).toBe(true);

    vi.stubGlobal('location', {
      href: 'https://www.workday.com/en-us/products.html',
    });
    expect(ats.isApplicable()).toBe(true);

    vi.stubGlobal('location', {
      href: 'https://boards.greenhouse.io/acme/jobs/123',
    });
    expect(ats.isApplicable()).toBe(false);
  });
});

describe('parseDateParts', () => {
  it('parses YYYY-MM into month, day, and year strings', () => {
    expect(parseDateParts('2022-06')).toEqual({
      month: 'June',
      day: '1',
      year: '2022',
    });
  });

  it('parses YYYY-MM-DD values', () => {
    expect(parseDateParts('2020-03-15')).toEqual({
      month: 'March',
      day: '15',
      year: '2020',
    });
  });
});

describe('fillWorkdayDropdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockVisibleLayout();
    document.body.innerHTML = `
      <div id="dropdown">
        <button role="combobox" aria-expanded="false">Select</button>
        <ul>
          <li role="option">California</li>
          <li role="option">Texas</li>
        </ul>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens the combobox and selects a matching option', async () => {
    const container = document.getElementById('dropdown');
    expect(container).not.toBeNull();

    const promise = fillWorkdayDropdown(container!, 'California');
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toBe(true);
  });

  it('returns false when no option matches', async () => {
    const container = document.getElementById('dropdown');
    const promise = fillWorkdayDropdown(container!, 'Florida');
    await vi.advanceTimersByTimeAsync(200);
    await expect(promise).resolves.toBe(false);
  });

  it('returns false for empty values', async () => {
    const container = document.getElementById('dropdown');
    await expect(fillWorkdayDropdown(container!, '   ')).resolves.toBe(false);
  });
});

describe('detectWorkdaySection and EEO filter', () => {
  beforeEach(() => {
    mockVisibleLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects the self-identify section', () => {
    document.body.innerHTML = `
      <section>
        <h2>Voluntary Disclosures</h2>
        <input id="gender" />
      </section>
    `;

    expect(detectWorkdaySection(document.body)).toBe('self_identify');
  });

  it('filters out fields inside the self-identify section', () => {
    document.body.innerHTML = `
      <section>
        <h2>Self Identify</h2>
        <input id="gender" />
      </section>
      <section>
        <h2>My Information</h2>
        <input id="email" />
      </section>
    `;

    const genderInput = document.getElementById('gender') as HTMLElement;
    const emailInput = document.getElementById('email') as HTMLElement;
    const filtered = filterWorkdayFields([
      makeField(genderInput, 'Gender'),
      makeField(emailInput, 'Email'),
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.label).toBe('Email');
  });
});

describe('runWorkdayMatchAndFill', () => {
  beforeEach(() => {
    mockVisibleLayout();
    document.body.innerHTML = `
      <div data-automation-id="applyFlowPage">
        <h2>My Experience</h2>
        <section>
          <h3>Work Experience 1</h3>
          <input data-automation-id="workExperience-1-jobTitle" aria-label="Job Title" />
          <input data-automation-id="workExperience-1-company" aria-label="Company" />
        </section>
        <section>
          <h3>Work Experience 2</h3>
          <input data-automation-id="workExperience-2-jobTitle" aria-label="Job Title" />
          <input data-automation-id="workExperience-2-company" aria-label="Company" />
        </section>
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fills all experience entries on the my experience step', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Senior Engineer',
          company: 'Acme',
          startDate: '2020-01',
          endDate: '2023-01',
          current: false,
          description: 'Built APIs',
        },
        {
          title: 'Engineer',
          company: 'Beta',
          startDate: '2018-01',
          endDate: '2020-01',
          current: false,
          description: 'Shipped features',
        },
      ],
    };

    const result = runWorkdayMatchAndFill(
      [],
      profile,
      DEFAULT_SETTINGS,
      {},
      {},
      flattenProfile(profile),
    );

    expect(result.filled).toBeGreaterThanOrEqual(2);
    expect(
      (document.querySelector(
        '[data-automation-id="workExperience-2-jobTitle"]',
      ) as HTMLInputElement).value,
    ).toBe('Engineer');
  });
});

describe('handleApplication', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockVisibleLayout();

    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        storage: {
          local: {
            get: vi.fn(async () => ({})),
            set: vi.fn(async () => undefined),
          },
        },
      },
    });

    document.body.innerHTML = `
      <div data-automation-id="applyFlowPage">
        <h2>My Information</h2>
        <input data-automation-id="legalNameSection_firstName" />
        <input data-automation-id="legalNameSection_lastName" />
        <input data-automation-id="email" />
      </div>
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('fills My Information fields and returns a positive fill count', async () => {
    const ats = new WorkdayATS();
    const profile = {
      ...DEFAULT_PROFILE,
      personal: {
        ...DEFAULT_PROFILE.personal,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      },
    };

    const promise = ats.handleApplication(profile, {
      ...DEFAULT_SETTINGS,
      pauseBeforeSubmit: true,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result.filled).toBeGreaterThanOrEqual(1);
    expect(
      (
        document.querySelector(
          '[data-automation-id="legalNameSection_firstName"]',
        ) as HTMLInputElement
      ).value,
    ).toBe('Jane');
  });
});

/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WorkdayATS,
  detectWorkdaySection,
  fillWorkdayDropdown,
  filterWorkdayFields,
  isMyExperiencePrepared,
  parseDateParts,
  prepareWorkdayPage,
  resetMyExperiencePreparedForTests,
  runWorkdayMatchAndFill,
  shouldDeferToDedicatedWorkdayFill,
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
      day: '01',
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

describe('shouldDeferToDedicatedWorkdayFill', () => {
  it('defers composite work experience labels including dates', () => {
    const field = makeField(document.createElement('input'), 'Work Experience 1 > From');
    expect(shouldDeferToDedicatedWorkdayFill(field)).toBe(true);
  });
});

describe('prepareWorkdayPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockVisibleLayout();
    resetMyExperiencePreparedForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetMyExperiencePreparedForTests();
  });

  it('fills entries sequentially and unlocks gated Add Another buttons', async () => {
    document.body.innerHTML = `
      <div data-automation-id="applyFlowPage">
        <h2>My Experience</h2>
        <section>
          <h2>Work Experience</h2>
          <div id="experience-entries">
            <section>
              <h3>Work Experience 1</h3>
              <input id="job1" aria-label="Job Title" />
              <input id="company1" aria-label="Company" />
            </section>
          </div>
          <button type="button" id="add-experience" disabled>Add Another</button>
        </section>
      </div>
    `;

    const entries = document.getElementById('experience-entries') as HTMLElement;
    const addButton = document.getElementById('add-experience') as HTMLButtonElement;
    const job1 = document.getElementById('job1') as HTMLInputElement;

    job1.addEventListener('input', () => {
      addButton.disabled = job1.value.trim().length === 0;
    });

    addButton.addEventListener('click', () => {
      const index = entries.querySelectorAll('section').length + 1;
      const block = document.createElement('section');
      block.innerHTML = `
        <h3>Work Experience ${index}</h3>
        <input aria-label="Job Title" />
        <input aria-label="Company" />
      `;
      entries.appendChild(block);
    });

    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Senior Engineer',
          company: 'Acme',
          startDate: '2020-01',
          endDate: '2023-01',
          current: false,
          description: '',
        },
        {
          title: 'Engineer',
          company: 'Beta',
          startDate: '2018-01',
          endDate: '2020-01',
          current: false,
          description: '',
        },
      ],
      education: [],
      skills: [],
    };

    const promise = prepareWorkdayPage(profile);
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();
    await promise;

    expect(isMyExperiencePrepared()).toBe(true);
    const titles = Array.from(
      document.querySelectorAll('input[aria-label="Job Title"]'),
    ).map((input) => (input as HTMLInputElement).value);
    expect(titles).toContain('Senior Engineer');
    expect(titles).toContain('Engineer');
  });

  it('fills Workday UXI experience entries via instance id suffixes', async () => {
    document.body.innerHTML = `
      <div data-automation-id="applyFlowPage">
        <h2>My Experience</h2>
      </div>
      <div data-automation-id="applyFlowMyExpPage">
        <input id="workExperience-24--jobTitle" name="jobTitle" />
        <input id="workExperience-24--companyName" name="companyName" />
        <input role="spinbutton" aria-label="Month" id="workExperience-24--startDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-24--startDate-dateSectionYear-input" />
        <input role="spinbutton" aria-label="Month" id="workExperience-24--endDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-24--endDate-dateSectionYear-input" />
        <button data-automation-id="add-button">Add Another</button>
      </div>
    `;

    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Software Engineer',
          company: 'Veersa Technologies',
          startDate: '2002-12',
          endDate: '2004-06',
          current: false,
          description: '',
        },
      ],
      education: [],
      skills: [],
    };

    const promise = prepareWorkdayPage(profile);
    await vi.runAllTimersAsync();
    await promise;

    expect(isMyExperiencePrepared()).toBe(true);
    expect(
      (document.getElementById('workExperience-24--jobTitle') as HTMLInputElement).value,
    ).toBe('Software Engineer');
    expect(
      (
        document.getElementById(
          'workExperience-24--startDate-dateSectionMonth-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('12');
    expect(
      (
        document.getElementById(
          'workExperience-24--startDate-dateSectionYear-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('2002');
  });

  it('fills two Workday UXI experience entries with scoped dates', async () => {
    document.body.innerHTML = `
      <div data-automation-id="applyFlowPage">
        <h2>My Experience</h2>
      </div>
      <div data-automation-id="applyFlowMyExpPage">
        <input id="workExperience-24--jobTitle" />
        <input id="workExperience-24--companyName" />
        <input role="spinbutton" aria-label="Month" id="workExperience-24--startDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-24--startDate-dateSectionYear-input" />
        <button data-automation-id="add-button" id="add">Add Another</button>
      </div>
    `;

    const addButton = document.getElementById('add') as HTMLButtonElement;
    addButton.addEventListener('click', () => {
      const root = document.querySelector('[data-automation-id="applyFlowMyExpPage"]');
      if (!root) {
        return;
      }
      root.insertAdjacentHTML(
        'beforeend',
        `
          <input id="workExperience-88--jobTitle" />
          <input id="workExperience-88--companyName" />
          <input role="spinbutton" aria-label="Month" id="workExperience-88--startDate-dateSectionMonth-input" />
          <input role="spinbutton" aria-label="Year" id="workExperience-88--startDate-dateSectionYear-input" />
        `,
      );
    });

    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Software Engineer',
          company: 'Veersa Technologies',
          startDate: '2002-12',
          endDate: '2004-06',
          current: false,
          description: '',
        },
        {
          title: 'Senior Engineer',
          company: 'Acme Corp',
          startDate: '2018-01',
          endDate: '2020-03',
          current: false,
          description: '',
        },
      ],
      education: [],
      skills: [],
    };

    const promise = prepareWorkdayPage(profile);
    await vi.runAllTimersAsync();
    await vi.runAllTimersAsync();
    await promise;

    expect(isMyExperiencePrepared()).toBe(true);
    expect(
      (
        document.getElementById(
          'workExperience-24--startDate-dateSectionYear-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('2002');
    expect(
      (
        document.getElementById(
          'workExperience-88--startDate-dateSectionYear-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('2018');
    expect(
      (document.getElementById('workExperience-88--jobTitle') as HTMLInputElement).value,
    ).toBe('Senior Engineer');
  });
});

describe('runWorkdayMatchAndFill', () => {
  beforeEach(() => {
    mockVisibleLayout();
    resetMyExperiencePreparedForTests();
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
    resetMyExperiencePreparedForTests();
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

  it('fills MM/YYYY date inputs from stored YYYY-MM values', () => {
    document.body.innerHTML = `
      <div data-automation-id="applyFlowPage">
        <h2>My Experience</h2>
        <section>
          <h3>Work Experience 1</h3>
          <input aria-label="From" placeholder="MM/YYYY" />
          <input aria-label="To" placeholder="MM/YYYY" />
        </section>
      </div>
    `;

    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Engineer',
          company: 'Veersa Technologies',
          startDate: '2002-12',
          endDate: '2004-06',
          current: false,
          description: '',
        },
      ],
    };

    runWorkdayMatchAndFill(
      [],
      profile,
      DEFAULT_SETTINGS,
      {},
      {},
      flattenProfile(profile),
    );

    const fromInput = document.querySelector(
      'input[aria-label="From"]',
    ) as HTMLInputElement;
    const toInput = document.querySelector('input[aria-label="To"]') as HTMLInputElement;

    expect(fromInput.value).toBe('12/2002');
    expect(toInput.value).toBe('06/2004');
  });

  it('skips dedicated experience fill when prepareWorkdayPage already ran', async () => {
    vi.useFakeTimers();

    document.body.innerHTML = `
      <div data-automation-id="applyFlowPage">
        <h2>My Experience</h2>
        <section>
          <h3>Work Experience 1</h3>
          <input aria-label="Job Title" />
        </section>
      </div>
    `;

    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Prepared Title',
          company: 'Acme',
          startDate: '2020-01',
          endDate: '2023-01',
          current: false,
          description: '',
        },
      ],
      education: [],
      skills: [],
    };

    const preparePromise = prepareWorkdayPage(profile);
    await vi.runAllTimersAsync();
    await preparePromise;

    const titleInput = document.querySelector(
      'input[aria-label="Job Title"]',
    ) as HTMLInputElement;
    expect(titleInput.value).toBe('Prepared Title');

    titleInput.value = 'Prepared Title';
    runWorkdayMatchAndFill(
      [],
      profile,
      DEFAULT_SETTINGS,
      {},
      {},
      flattenProfile(profile),
    );

    expect(isMyExperiencePrepared()).toBe(true);
    expect(titleInput.value).toBe('Prepared Title');

    vi.useRealTimers();
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

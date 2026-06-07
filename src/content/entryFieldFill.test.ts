/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectUxiIdPattern,
  fillEducationEntryFields,
  fillExperienceEntryFields,
} from '@/content/entryFieldFill';

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

describe('entryFieldFill', () => {
  beforeEach(() => {
    mockVisibleLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects Workday UXI id patterns', () => {
    document.body.innerHTML =
      '<input id="workExperience-24--jobTitle" /><input id="education-105--schoolName" />';
    expect(detectUxiIdPattern(document)).toBe(true);
  });

  it('fills experience fields by instance id suffixes and spinbutton dates', () => {
    document.body.innerHTML = `
      <div data-automation-id="applyFlowMyExpPage">
        <input id="workExperience-24--jobTitle" name="jobTitle" />
        <input id="workExperience-24--companyName" name="companyName" />
        <input id="workExperience-24--location" name="location" />
        <input role="spinbutton" aria-label="Month" id="workExperience-24--startDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-24--startDate-dateSectionYear-input" />
        <input role="spinbutton" aria-label="Month" id="workExperience-24--endDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-24--endDate-dateSectionYear-input" />
        <textarea id="workExperience-24--roleDescription"></textarea>
      </div>
    `;

    const container = document.body;
    const filled = fillExperienceEntryFields(
      container,
      {
        title: 'Software Engineer',
        company: 'Veersa Technologies',
        startDate: '2002-12',
        endDate: '2004-06',
        current: false,
        description: 'Frontend dev',
      },
      'Narnaul',
      0,
    );

    expect(filled).toBeGreaterThan(0);
    expect(
      (document.getElementById('workExperience-24--jobTitle') as HTMLInputElement).value,
    ).toBe('Software Engineer');
    expect(
      (document.getElementById('workExperience-24--companyName') as HTMLInputElement)
        .value,
    ).toBe('Veersa Technologies');
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
    expect(
      (
        document.getElementById(
          'workExperience-24--endDate-dateSectionMonth-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('6');
    expect(
      (
        document.getElementById(
          'workExperience-24--endDate-dateSectionYear-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('2004');
  });

  it('fills dates on the correct instance when two entries exist', () => {
    document.body.innerHTML = `
      <div data-automation-id="applyFlowMyExpPage">
        <input id="workExperience-24--jobTitle" />
        <input role="spinbutton" aria-label="Month" id="workExperience-24--startDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-24--startDate-dateSectionYear-input" />
        <input id="workExperience-88--jobTitle" />
        <input role="spinbutton" aria-label="Month" id="workExperience-88--startDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-88--startDate-dateSectionYear-input" />
      </div>
    `;

    const containers = Array.from(
      document.querySelectorAll('[id^="workExperience-"][id$="--jobTitle"]'),
    ).map((input) => input.closest('div') ?? document.body) as HTMLElement[];

    fillExperienceEntryFields(
      containers[0],
      {
        title: 'First Role',
        company: 'Acme',
        startDate: '2002-12',
        endDate: '2004-06',
        current: false,
        description: '',
      },
      '',
      0,
    );
    fillExperienceEntryFields(
      containers[1],
      {
        title: 'Second Role',
        company: 'Beta',
        startDate: '2018-01',
        endDate: '2020-03',
        current: false,
        description: '',
      },
      '',
      1,
    );

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
      (
        document.getElementById(
          'workExperience-24--startDate-dateSectionMonth-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('12');
    expect(
      (
        document.getElementById(
          'workExperience-88--startDate-dateSectionMonth-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('1');
  });

  it('fills education fields by instance id suffixes', () => {
    document.body.innerHTML = `
      <div>
        <input id="education-105--schoolName" name="schoolName" />
        <input id="education-105--gradeAverage" name="gradeAverage" />
      </div>
    `;

    const filled = fillEducationEntryFields(
      document.body,
      {
        institution: 'State University',
        degree: 'BS',
        field: 'CS',
        graduationYear: 2018,
        percentage: '85',
      },
      0,
    );

    expect(filled).toBeGreaterThan(0);
    expect(
      (document.getElementById('education-105--schoolName') as HTMLInputElement).value,
    ).toBe('State University');
    expect(
      (document.getElementById('education-105--gradeAverage') as HTMLInputElement)
        .value,
    ).toBe('85');
  });
});

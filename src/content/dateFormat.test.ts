/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectDateInputFormat,
  fillDateInput,
  fillProfileDateInContainer,
  fillSpinbuttonDatePart,
  formatProfileDateForInput,
  isSpinbuttonDateInput,
  parseProfileDate,
} from '@/content/dateFormat';

describe('parseProfileDate', () => {
  it('parses YYYY-MM profile dates', () => {
    expect(parseProfileDate('2002-12')).toEqual({
      year: '2002',
      month: '12',
      day: '01',
    });
  });

  it('parses MM/YYYY display dates', () => {
    expect(parseProfileDate('06/2004')).toEqual({
      year: '2004',
      month: '06',
      day: '01',
    });
  });
});

describe('formatProfileDateForInput', () => {
  it('formats profile dates as MM/YYYY', () => {
    expect(formatProfileDateForInput('2002-12', 'mm/yyyy')).toBe('12/2002');
  });

  it('formats profile dates as MM/DD/YYYY', () => {
    expect(formatProfileDateForInput('2020-03-15', 'mm/dd/yyyy')).toBe('03/15/2020');
  });
});

describe('fillDateInput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fills MM/YYYY inputs from stored YYYY-MM values', () => {
    document.body.innerHTML =
      '<input id="from" placeholder="MM/YYYY" aria-label="From" />';
    const input = document.getElementById('from') as HTMLInputElement;

    expect(detectDateInputFormat(input)).toBe('mm/yyyy');
    expect(fillDateInput(input, '2002-12')).toBe(true);
    expect(input.value).toBe('12/2002');
  });
});

describe('fillSpinbuttonDatePart', () => {
  it('fills month and year spinbuttons from YYYY-MM profile dates', () => {
    document.body.innerHTML = `
      <input role="spinbutton" aria-label="Month" id="month" />
      <input role="spinbutton" aria-label="Year" id="year" />
    `;
    const month = document.getElementById('month') as HTMLInputElement;
    const year = document.getElementById('year') as HTMLInputElement;

    expect(isSpinbuttonDateInput(month)).toBe(true);
    expect(fillSpinbuttonDatePart(month, '2002-12', 'month')).toBe(true);
    expect(fillSpinbuttonDatePart(year, '2002-12', 'year')).toBe(true);
    expect(month.value).toBe('12');
    expect(year.value).toBe('2002');
  });
});

describe('fillProfileDateInContainer', () => {
  it('fills Workday UXI id-suffix spinbutton date groups', () => {
    document.body.innerHTML = `
      <div id="entry">
        <input role="spinbutton" aria-label="Month" id="workExperience-24--startDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-24--startDate-dateSectionYear-input" />
      </div>
    `;
    const container = document.getElementById('entry') as HTMLElement;

    expect(
      fillProfileDateInContainer(container, /\b(from|start)\b/i, '2002-12'),
    ).toBe(true);

    const month = document.getElementById(
      'workExperience-24--startDate-dateSectionMonth-input',
    ) as HTMLInputElement;
    const year = document.getElementById(
      'workExperience-24--startDate-dateSectionYear-input',
    ) as HTMLInputElement;

    expect(month.value).toBe('12');
    expect(year.value).toBe('2002');
  });

  it('fills instance-scoped spinbutton dates for two entries without cross-fill', () => {
    document.body.innerHTML = `
      <div id="entry-24">
        <input role="spinbutton" aria-label="Month" id="workExperience-24--startDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-24--startDate-dateSectionYear-input" />
      </div>
      <div id="entry-88">
        <input role="spinbutton" aria-label="Month" id="workExperience-88--startDate-dateSectionMonth-input" />
        <input role="spinbutton" aria-label="Year" id="workExperience-88--startDate-dateSectionYear-input" />
      </div>
    `;

    const entry24 = document.getElementById('entry-24') as HTMLElement;
    const entry88 = document.getElementById('entry-88') as HTMLElement;

    expect(
      fillProfileDateInContainer(entry24, /\b(from|start)\b/i, '2002-12', {
        prefix: 'workExperience',
        instanceId: '24',
      }),
    ).toBe(true);
    expect(
      fillProfileDateInContainer(entry88, /\b(from|start)\b/i, '2018-01', {
        prefix: 'workExperience',
        instanceId: '88',
      }),
    ).toBe(true);

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
          'workExperience-88--startDate-dateSectionMonth-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('1');
    expect(
      (
        document.getElementById(
          'workExperience-88--startDate-dateSectionYear-input',
        ) as HTMLInputElement
      ).value,
    ).toBe('2018');
  });

  it('verifies year spinbutton via aria-valuenow when value is empty', () => {
    document.body.innerHTML = `
      <input role="spinbutton" aria-label="Year" id="year" aria-valuenow="2002" />
    `;
    const year = document.getElementById('year') as HTMLInputElement;

    expect(fillSpinbuttonDatePart(year, '2002-12', 'year')).toBe(true);
    expect(year.value || year.getAttribute('aria-valuenow')).toBe('2002');
  });

  it('fills label-scoped MM/YYYY text inputs', () => {
    document.body.innerHTML = `
      <div>
        <span>From</span>
        <input aria-label="From" placeholder="MM/YYYY" />
      </div>
    `;
    const container = document.body;

    expect(fillProfileDateInContainer(container, /\bfrom\b/i, '2004-06')).toBe(
      true,
    );
    expect((document.querySelector('input') as HTMLInputElement).value).toBe(
      '06/2004',
    );
  });
});

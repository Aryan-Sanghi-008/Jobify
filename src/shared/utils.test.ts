import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  debounce,
  detectPortal,
  exportApplicationsToCSV,
  formatByteSize,
  formatCTC,
  generateId,
  hashString,
  interpolateCoverLetter,
  normalizeLabel,
  parseCTCInput,
} from '@/shared/utils';
import type { JobApplication } from '@/shared/types';

describe('normalizeLabel', () => {
  it.each([
    ['Full Name', 'full name'],
    ['  Email Address  ', 'email address'],
    ['Phone # (Mobile)', 'phone mobile'],
    ['Current CTC (in LPA)', 'current ctc in lpa'],
    ['UPPERCASE LABEL', 'uppercase label'],
    ['', ''],
    ['   ', ''],
    ['!!!@@@###', ''],
    ['a-b_c.d@e', 'a b c d e'],
    [
      'a'.repeat(500),
      'a'.repeat(500),
    ],
  ])('normalizes "%s"', (input, expected) => {
    expect(normalizeLabel(input)).toBe(expected);
  });
});

describe('interpolateCoverLetter', () => {
  const vars = {
    company_name: 'Acme Corp',
    job_title: 'Staff Engineer',
    your_name: 'Jane Doe',
  };

  it('replaces all three supported variables', () => {
    const template =
      'Dear {{company_name}}, I am applying for {{job_title}}. Sincerely, {{your_name}}.';

    expect(interpolateCoverLetter(template, vars)).toBe(
      'Dear Acme Corp, I am applying for Staff Engineer. Sincerely, Jane Doe.',
    );
  });

  it('supports case-insensitive and spaced variable syntax', () => {
    const template = 'Hi {{ COMPANY_NAME }}, role: {{ Job_Title }}, from {{ your_name }}';

    expect(interpolateCoverLetter(template, vars)).toBe(
      'Hi Acme Corp, role: Staff Engineer, from Jane Doe',
    );
  });

  it('leaves missing variables unchanged when not present in vars map', () => {
    const template = 'Company: {{company_name}}, Location: {{location}}';

    expect(interpolateCoverLetter(template, vars)).toBe(
      'Company: Acme Corp, Location: {{location}}',
    );
  });

  it('leaves unknown variables unchanged', () => {
    const template = 'Hello {{foo}} and {{bar_baz}}';

    expect(interpolateCoverLetter(template, vars)).toBe(
      'Hello {{foo}} and {{bar_baz}}',
    );
  });

  it('replaces variables with empty strings when values are empty', () => {
    const template = '{{company_name}} / {{job_title}} / {{your_name}}';

    expect(
      interpolateCoverLetter(template, {
        company_name: '',
        job_title: '',
        your_name: '',
      }),
    ).toBe(' /  / ');
  });
});

describe('detectPortal', () => {
  it.each([
    ['https://www.linkedin.com/jobs/view/123', 'linkedin'],
    ['https://www.linkedin.com/in/janedoe', 'linkedin'],
    ['https://www.naukri.com/job-listings-123', 'naukri'],
    ['https://wellfound.com/company/acme/jobs/1', 'wellfound'],
    ['https://angel.co/company/acme/jobs/1', 'wellfound'],
    ['https://www.instahyre.com/jobs/123', 'instahyre'],
    ['https://boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
    ['https://jobs.lever.co/acme/123', 'lever'],
    ['https://acme.wd5.myworkdayjobs.com/en-US/job/123', 'workday'],
    [
      'https://qualys.wd5.myworkdayjobs.com/en-US/Careers/job/Pune/Sr-Software-Engineer_R0002473/apply?source=LinkedIn',
      'workday',
    ],
    ['https://www.workday.com/en-us/products.html', 'workday'],
  ])('detects %s as expected portal', (url, expected) => {
    expect(detectPortal(url)).toBe(expected);
  });

  it('falls back to generic for unrecognized URLs', () => {
    expect(detectPortal('https://example.com/careers/123')).toBe('generic');
    expect(detectPortal('')).toBe('generic');
  });

  it('is case-insensitive', () => {
    expect(detectPortal('HTTPS://BOARDS.GREENHOUSE.IO/ACME')).toBe('greenhouse');
  });
});

describe('parseCTCInput', () => {
  it.each([
    ['12 LPA', 1_200_000],
    ['12L', 1_200_000],
    ['12,00,000', 1_200_000],
    ['0', 0],
    ['', 0],
    ['   ', 0],
  ])('parses "%s" to %d', (input, expected) => {
    expect(parseCTCInput(input)).toBe(expected);
  });

  it('parses decimal LPA values', () => {
    expect(parseCTCInput('8.5 lpa')).toBe(850_000);
  });

  it('parses salary text with embedded LPA value', () => {
    expect(parseCTCInput('Rs. 15 LPA')).toBe(1_500_000);
  });

  it('treats negative-looking input as the embedded positive number', () => {
    expect(parseCTCInput('-12 LPA')).toBe(1_200_000);
  });
});

describe('formatCTC', () => {
  it.each([
    [1_200_000, '12 LPA'],
    [850_000, '8.5 LPA'],
    [0, '0 LPA'],
    [-100, '0 LPA'],
  ])('formats %d as "%s"', (value, expected) => {
    expect(formatCTC(value)).toBe(expected);
  });

  it('drops trailing .0 from whole LPA values', () => {
    expect(formatCTC(1_000_000)).toBe('10 LPA');
  });
});

describe('hashString', () => {
  it('returns a stable 8-character hex hash', () => {
    expect(hashString('test label')).toBe(hashString('test label'));
    expect(hashString('test label')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns different hashes for different inputs', () => {
    expect(hashString('alpha')).not.toBe(hashString('beta'));
  });
});

describe('generateId', () => {
  it('returns a UUID-shaped string', () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe('exportApplicationsToCSV', () => {
  it('exports spreadsheet columns with escaped values', () => {
    const applications: JobApplication[] = [
      {
        id: 'app-1',
        company: 'Acme, Inc.',
        role: 'Engineer',
        portal: 'linkedin',
        url: 'https://example.com/jobs/1',
        appliedAt: Date.parse('2024-06-15T12:00:00.000Z'),
        status: 'applied',
        notes: 'Followed up\nby email',
      },
    ];

    const csv = exportApplicationsToCSV(applications);

    expect(csv).toBe(
      'Company,Role,Portal,Status,Applied Date,Notes\n' +
        '"Acme, Inc.",Engineer,linkedin,applied,2024-06-15,"Followed up\nby email"',
    );
  });
});

describe('formatByteSize', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('formats %i bytes as %s', (bytes, expected) => {
    expect(formatByteSize(bytes)).toBe(expected);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution until the wait period elapses', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUPPORTED_VARIABLES,
  expandCoverLetter,
  getPreviewValues,
  validateTemplate,
} from '@/shared/coverLetterEngine';
import { DEFAULT_PROFILE } from '@/shared/storage';
import type { CoverLetterTemplate, UserProfile } from '@/shared/types';

function makeTemplate(body: string): CoverLetterTemplate {
  return {
    id: 'test-template',
    name: 'Test',
    body,
    createdAt: 0,
    updatedAt: 0,
  };
}

const fullProfile: UserProfile = {
  ...DEFAULT_PROFILE,
  personal: {
    ...DEFAULT_PROFILE.personal,
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+91 98765 43210',
    linkedinUrl: 'https://linkedin.com/in/janedoe',
  },
  professional: {
    ...DEFAULT_PROFILE.professional,
    currentTitle: 'Senior Engineer',
    totalYearsExp: 7,
    noticePeriod: 30,
  },
  skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
};

const pageContext = {
  company: 'Acme Corp',
  jobTitle: 'Staff Engineer',
};

describe('expandCoverLetter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expands all 10 supported variables correctly', () => {
    const template = makeTemplate(
      [
        'company={{company_name}}',
        'role={{job_title}}',
        'name={{your_name}}',
        'email={{your_email}}',
        'phone={{your_phone}}',
        'title={{current_role}}',
        'exp={{years_exp}}',
        'skills={{top_skills}}',
        'notice={{notice_period}}',
        'linkedin={{linkedin}}',
        'date={{today_date}}',
      ].join('\n'),
    );

    const result = expandCoverLetter(template, fullProfile, pageContext);

    expect(result).toContain('company=Acme Corp');
    expect(result).toContain('role=Staff Engineer');
    expect(result).toContain('name=Jane Doe');
    expect(result).toContain('email=jane@example.com');
    expect(result).toContain('phone=+91 98765 43210');
    expect(result).toContain('title=Senior Engineer');
    expect(result).toContain('exp=7');
    expect(result).toContain('skills=TypeScript, React, Node.js');
    expect(result).toContain('notice=30 days');
    expect(result).toContain('linkedin=https://linkedin.com/in/janedoe');
    expect(result).toContain('date=June 5, 2026');
  });

  it.each(SUPPORTED_VARIABLES)('supports variable {{%s}}', (variable) => {
    const template = makeTemplate(`Value: {{${variable}}}`);
    const result = expandCoverLetter(template, fullProfile, pageContext);

    expect(result).not.toContain(`{{${variable}}}`);
    expect(result.startsWith('Value: ')).toBe(true);
    expect(result.length).toBeGreaterThan('Value: '.length);
  });

  it('replaces missing profile values with bracket placeholders', () => {
    const template = makeTemplate(
      'Email: {{your_email}}, Skills: {{top_skills}}, LinkedIn: {{linkedin}}',
    );
    const profile: UserProfile = {
      ...fullProfile,
      personal: {
        ...fullProfile.personal,
        email: '',
        linkedinUrl: '   ',
      },
      skills: [],
    };

    const result = expandCoverLetter(template, profile, pageContext);

    expect(result).toBe(
      'Email: [YOUR_EMAIL], Skills: [TOP_SKILLS], LinkedIn: [LINKEDIN]',
    );
  });

  it('handles case-insensitive and spaced variable syntax', () => {
    const template = makeTemplate('Hi {{ YOUR_NAME }}, reach me at {{Your_Email}}');
    const result = expandCoverLetter(template, fullProfile, pageContext);

    expect(result).toBe('Hi Jane Doe, reach me at jane@example.com');
  });

  it('leaves unknown variables unchanged', () => {
    const template = makeTemplate('Hello {{foo}} and {{custom_var}}');
    const result = expandCoverLetter(template, fullProfile, pageContext);

    expect(result).toBe('Hello {{foo}} and {{custom_var}}');
  });
});

describe('validateTemplate', () => {
  it('flags unknown variables as invalid', () => {
    const result = validateTemplate('Dear {{comapny_name}}', fullProfile);

    expect(result.valid).toBe(false);
    expect(result.unknownVariables).toEqual(['comapny_name']);
    expect(result.missingVariables).toEqual([]);
  });

  it('catches common typos in variable names', () => {
    const result = validateTemplate(
      'Role: {{job_titel}}, Company: {{compnay_name}}',
      fullProfile,
    );

    expect(result.valid).toBe(false);
    expect(result.unknownVariables).toEqual(['job_titel', 'compnay_name']);
  });

  it('reports missing profile-backed variables', () => {
    const profile: UserProfile = {
      ...fullProfile,
      personal: { ...fullProfile.personal, email: '', phone: '   ' },
      skills: [],
    };

    const result = validateTemplate(
      'Email {{your_email}}, phone {{your_phone}}, skills {{top_skills}}',
      profile,
    );

    expect(result.valid).toBe(true);
    expect(result.unknownVariables).toEqual([]);
    expect(result.missingVariables).toEqual([
      'your_email',
      'your_phone',
      'top_skills',
    ]);
  });

  it('reports missing page context variables when validating', () => {
    const result = validateTemplate(
      'Company {{company_name}}, role {{job_title}}',
      fullProfile,
    );

    expect(result.valid).toBe(true);
    expect(result.missingVariables).toEqual(['company_name', 'job_title']);
  });

  it('accepts a template that only uses known variables with available data', () => {
    const result = validateTemplate(
      'Dear {{your_name}}, applying for {{current_role}}.',
      fullProfile,
    );

    expect(result.valid).toBe(true);
    expect(result.unknownVariables).toEqual([]);
    expect(result.missingVariables).toEqual([]);
  });
});

describe('getPreviewValues', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns preview mappings with placeholder company and job title', () => {
    const values = getPreviewValues(fullProfile);

    expect(values.company_name).toBe('Acme Corp');
    expect(values.job_title).toBe('Software Engineer');
    expect(values.your_name).toBe('Jane Doe');
    expect(values.your_email).toBe('jane@example.com');
    expect(values.top_skills).toBe('TypeScript, React, Node.js');
    expect(values.notice_period).toBe('30 days');
    expect(values.today_date).toBe('June 5, 2026');
  });

  it('omits missing profile values from preview map', () => {
    const profile: UserProfile = {
      ...fullProfile,
      personal: { ...fullProfile.personal, email: '' },
      skills: [],
    };

    const values = getPreviewValues(profile);

    expect(values.your_email).toBeUndefined();
    expect(values.top_skills).toBeUndefined();
    expect(values.your_name).toBe('Jane Doe');
  });
});

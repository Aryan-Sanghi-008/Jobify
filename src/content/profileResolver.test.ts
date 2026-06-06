/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { resolveFieldValue, resolveSectionProfileKey } from '@/content/profileResolver';
import { DEFAULT_PROFILE } from '@/shared/storage';
import type { FormField } from '@/shared/types';

function makeField(overrides: Partial<FormField> & Pick<FormField, 'label'>): FormField {
  const { label, type = 'text', ...rest } = overrides;

  return {
    element: document.createElement('input'),
    label,
    type,
    confidence: 1,
    filled: false,
    unknown: false,
    ...rest,
  };
}

describe('profileResolver', () => {
  const profile = {
    ...DEFAULT_PROFILE,
    personal: {
      ...DEFAULT_PROFILE.personal,
      city: 'San Francisco',
    },
    experience: [
      {
        title: 'Senior Engineer',
        company: 'Acme Corp',
        startDate: '2020-01',
        endDate: '2023-06',
        current: false,
        description: 'Built APIs',
      },
      {
        title: 'Engineer',
        company: 'Beta Inc',
        startDate: '2018-03',
        endDate: '2020-01',
        current: false,
        description: 'Shipped features',
      },
    ],
    education: [
      {
        degree: 'B.S. Computer Science',
        field: 'Computer Science',
        institution: 'State University',
        graduationYear: 2018,
        percentage: '3.8 GPA',
      },
    ],
  };

  it('resolves indexed experience fields', () => {
    const field = makeField({
      label: 'Work Experience 2 > Job Title',
      sectionType: 'experience',
      sectionIndex: 1,
    });

    expect(resolveFieldValue(profile, field)).toBe('Engineer');
    expect(resolveSectionProfileKey(field)).toBe('title');
  });

  it('resolves location from personal city inside experience section', () => {
    const field = makeField({
      label: 'Work Experience 1 > Location',
      sectionType: 'experience',
      sectionIndex: 0,
    });

    expect(resolveFieldValue(profile, field)).toBe('San Francisco');
    expect(resolveSectionProfileKey(field)).toBe('city');
  });

  it('resolves indexed education degree fields', () => {
    const field = makeField({
      label: 'Education 1 > Degree',
      sectionType: 'education',
      sectionIndex: 0,
    });

    expect(resolveFieldValue(profile, field)).toBe('B.S. Computer Science');
    expect(resolveSectionProfileKey(field)).toBe('degree');
  });
});

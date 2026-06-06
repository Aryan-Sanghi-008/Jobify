import { describe, expect, it } from 'vitest';
import { getProfileCompletionScore } from '@/shared/profileScore';
import { DEFAULT_PROFILE } from '@/shared/storage';

describe('getProfileCompletionScore', () => {
  it('returns 0 for null profile', () => {
    expect(getProfileCompletionScore(null)).toEqual({ score: 0 });
  });

  it('returns 0 for empty profile', () => {
    expect(getProfileCompletionScore(DEFAULT_PROFILE)).toEqual({ score: 0 });
  });

  it('scores onboarding core fields at 65 points', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      personal: {
        ...DEFAULT_PROFILE.personal,
        email: 'jane@example.com',
        fullName: 'Jane Doe',
        phone: '+91 98765 43210',
      },
      professional: {
        ...DEFAULT_PROFILE.professional,
        currentCTC: 12,
        expectedCTC: 18,
        noticePeriod: 30,
      },
    };

    expect(getProfileCompletionScore(profile)).toEqual({ score: 65 });
  });

  it('returns 100 for a fully weighted profile', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      personal: {
        ...DEFAULT_PROFILE.personal,
        email: 'jane@example.com',
        fullName: 'Jane Doe',
        phone: '+91 98765 43210',
        city: 'Bangalore',
        linkedinUrl: 'https://linkedin.com/in/janedoe',
      },
      professional: {
        ...DEFAULT_PROFILE.professional,
        currentTitle: 'Software Engineer',
        currentCTC: 12,
        expectedCTC: 18,
        noticePeriod: 30,
      },
      education: [
        {
          degree: 'B.Tech',
          field: 'CS',
          institution: 'IIT',
          graduationYear: 2020,
          percentage: '8.5',
        },
      ],
      experience: [
        {
          title: 'Engineer',
          company: 'Acme Corp',
          startDate: '2020-01',
          endDate: '',
          current: true,
          description: 'Built things',
        },
      ],
      skills: ['TypeScript', 'React'],
    };

    expect(getProfileCompletionScore(profile)).toEqual({ score: 100 });
  });
});

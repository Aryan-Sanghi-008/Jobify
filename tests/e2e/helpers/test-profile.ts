import type { AppSettings, UserProfile } from '../../../src/shared/types';

export const E2E_TEST_PROFILE: UserProfile = {
  personal: {
    fullName: 'E2E User',
    firstName: 'E2E',
    lastName: 'User',
    email: 'e2e@test.com',
    phone: '+91 99999 00000',
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    linkedinUrl: 'https://linkedin.com/in/e2euser',
    githubUrl: '',
    portfolioUrl: '',
    twitterUrl: '',
  },
  professional: {
    currentTitle: 'Software Engineer',
    currentCompany: 'Acme Corp',
    totalYearsExp: 5,
    noticePeriod: 30,
    currentCTC: 12,
    expectedCTC: 18,
    workAuthorization: 'Authorized to work in India',
    willingToRelocate: true,
    preferredLocations: ['Bangalore', 'Remote'],
  },
  education: [],
  experience: [],
  skills: ['TypeScript', 'React'],
  languages: ['English'],
};

export const E2E_DEFAULT_SETTINGS: AppSettings = {
  autoFillOnLoad: false,
  pauseBeforeSubmit: false,
  highlightUnknownFields: true,
  defaultCoverLetterId: null,
  theme: 'system',
  debugMode: false,
  onboardingComplete: true,
};

import type {
  AppSettings,
  CoverLetterTemplate,
  FlatProfile,
  JobApplication,
  StorageSchema,
  UserProfile,
} from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  autoFillOnLoad: false,
  pauseBeforeSubmit: true,
  highlightUnknownFields: true,
  defaultCoverLetterId: null,
  theme: 'system',
};

export const DEFAULT_PROFILE: UserProfile = {
  personal: {
    fullName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    country: '',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    twitterUrl: '',
  },
  professional: {
    currentTitle: '',
    currentCompany: '',
    totalYearsExp: 0,
    noticePeriod: 0,
    currentCTC: 0,
    expectedCTC: 0,
    workAuthorization: '',
    willingToRelocate: false,
    preferredLocations: [],
  },
  education: [],
  experience: [],
  skills: [],
  languages: [],
};

function logStorageError(operation: string, error: unknown): void {
  console.error('[JobAutofill Storage]', operation, error);
}

async function storageGet<K extends keyof StorageSchema>(
  key: K,
): Promise<StorageSchema[K] | undefined> {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] as StorageSchema[K] | undefined;
  } catch (error) {
    logStorageError(`storageGet(${key})`, error);
    throw error;
  }
}

async function storageSet(partial: Partial<StorageSchema>): Promise<void> {
  try {
    await chrome.storage.local.set(partial);
  } catch (error) {
    logStorageError('storageSet', error);
    throw error;
  }
}

export function flattenProfile(profile: UserProfile): FlatProfile {
  const { personal, professional, education, experience, skills, languages } =
    profile;
  const edu = education[0];
  const exp = experience[0];

  return {
    fullName: personal.fullName,
    firstName: personal.firstName,
    lastName: personal.lastName,
    email: personal.email,
    phone: personal.phone,
    city: personal.city,
    state: personal.state,
    country: personal.country,
    linkedinUrl: personal.linkedinUrl,
    githubUrl: personal.githubUrl,
    portfolioUrl: personal.portfolioUrl,
    twitterUrl: personal.twitterUrl,
    currentTitle: professional.currentTitle,
    currentCompany: professional.currentCompany,
    totalYearsExp: professional.totalYearsExp,
    noticePeriod: professional.noticePeriod,
    currentCTC: professional.currentCTC,
    expectedCTC: professional.expectedCTC,
    workAuthorization: professional.workAuthorization,
    willingToRelocate: professional.willingToRelocate,
    preferredLocations: professional.preferredLocations.join(', '),
    skills: skills.join(', '),
    languages: languages.join(', '),
    degree: edu?.degree ?? '',
    field: edu?.field ?? '',
    institution: edu?.institution ?? '',
    graduationYear: edu?.graduationYear ?? 0,
    percentage: edu?.percentage ?? '',
    title: exp?.title ?? '',
    company: exp?.company ?? '',
    startDate: exp?.startDate ?? '',
    endDate: exp?.endDate ?? '',
    current: exp?.current ?? false,
    description: exp?.description ?? '',
  };
}

export async function getProfile(): Promise<UserProfile | null> {
  try {
    const profile = await storageGet('profile');
    return profile ?? null;
  } catch (error) {
    logStorageError('getProfile', error);
    throw error;
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  try {
    await storageSet({ profile });
  } catch (error) {
    logStorageError('saveProfile', error);
    throw error;
  }
}

export async function getCoverLetters(): Promise<CoverLetterTemplate[]> {
  try {
    const coverLetters = await storageGet('coverLetters');
    return coverLetters ?? [];
  } catch (error) {
    logStorageError('getCoverLetters', error);
    throw error;
  }
}

export async function saveCoverLetter(
  template: CoverLetterTemplate,
): Promise<void> {
  try {
    const existing = await getCoverLetters();
    const index = existing.findIndex((item) => item.id === template.id);
    const updated =
      index >= 0
        ? existing.map((item, i) => (i === index ? template : item))
        : [...existing, template];
    await storageSet({ coverLetters: updated });
  } catch (error) {
    logStorageError('saveCoverLetter', error);
    throw error;
  }
}

export async function deleteCoverLetter(id: string): Promise<void> {
  try {
    const existing = await getCoverLetters();
    await storageSet({
      coverLetters: existing.filter((item) => item.id !== id),
    });
  } catch (error) {
    logStorageError('deleteCoverLetter', error);
    throw error;
  }
}

export async function getApplications(): Promise<JobApplication[]> {
  try {
    const applications = await storageGet('applications');
    return applications ?? [];
  } catch (error) {
    logStorageError('getApplications', error);
    throw error;
  }
}

export async function logApplication(app: JobApplication): Promise<void> {
  try {
    const existing = await getApplications();
    await storageSet({ applications: [...existing, app] });
  } catch (error) {
    logStorageError('logApplication', error);
    throw error;
  }
}

export async function updateApplicationStatus(
  id: string,
  status: JobApplication['status'],
): Promise<void> {
  try {
    const existing = await getApplications();
    const updated = existing.map((app) =>
      app.id === id ? { ...app, status } : app,
    );
    await storageSet({ applications: updated });
  } catch (error) {
    logStorageError('updateApplicationStatus', error);
    throw error;
  }
}

export async function getLearnedFields(): Promise<Record<string, string>> {
  try {
    const learnedFields = await storageGet('learnedFields');
    return learnedFields ?? {};
  } catch (error) {
    logStorageError('getLearnedFields', error);
    throw error;
  }
}

export async function learnField(
  labelHash: string,
  profileKey: string,
): Promise<void> {
  try {
    const existing = await getLearnedFields();
    await storageSet({
      learnedFields: { ...existing, [labelHash]: profileKey },
    });
  } catch (error) {
    logStorageError('learnField', error);
    throw error;
  }
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const settings = await storageGet('settings');
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    logStorageError('getSettings', error);
    throw error;
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  try {
    const current = await getSettings();
    await storageSet({ settings: { ...current, ...settings } });
  } catch (error) {
    logStorageError('saveSettings', error);
    throw error;
  }
}

export async function clearAllData(): Promise<void> {
  try {
    await chrome.storage.local.clear();
  } catch (error) {
    logStorageError('clearAllData', error);
    throw error;
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobApplication, UserProfile } from '@/shared/types';
import {
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  clearAllData,
  getApplications,
  getAutofillData,
  getCoverLetters,
  getLearnedFields,
  getProfile,
  getSettings,
  hasRecentApplication,
  learnField,
  logApplication,
  normalizeApplicationKey,
  saveCoverLetter,
  saveProfile,
  saveSettings,
  updateApplicationStatus,
} from '@/shared/storage';
import type { CoverLetterTemplate } from '@/shared/types';

type StorageRecord = Record<string, unknown>;

function createChromeStorageMock(initial: StorageRecord = {}) {
  const store: StorageRecord = { ...initial };

  return {
    store,
    chrome: {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[] | null) => {
            if (keys === null) {
              return { ...store };
            }

            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            const result: StorageRecord = {};

            for (const key of requestedKeys) {
              if (key in store) {
                result[key] = store[key];
              }
            }

            return result;
          }),
          set: vi.fn(async (data: StorageRecord) => {
            Object.assign(store, data);
          }),
          clear: vi.fn(async () => {
            for (const key of Object.keys(store)) {
              delete store[key];
            }
          }),
          getBytesInUse: vi.fn(async () => 0),
        },
      },
    },
  };
}

function makeValidProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    ...DEFAULT_PROFILE,
    personal: {
      ...DEFAULT_PROFILE.personal,
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+91 98765 43210',
      linkedinUrl: 'https://linkedin.com/in/janedoe',
      ...overrides.personal,
    },
    professional: {
      ...DEFAULT_PROFILE.professional,
      currentTitle: 'Engineer',
      noticePeriod: 30,
      ...overrides.professional,
    },
    ...overrides,
  };
}

function makeApplication(
  overrides: Partial<JobApplication> = {},
): JobApplication {
  return {
    id: 'app-1',
    company: 'Acme Corp',
    role: 'Software Engineer',
    portal: 'greenhouse',
    url: 'https://example.com/jobs/1',
    appliedAt: Date.now(),
    status: 'applied',
    ...overrides,
  };
}

let storageMock = createChromeStorageMock();

describe('storage API', () => {
  beforeEach(() => {
    storageMock = createChromeStorageMock();
    vi.stubGlobal('chrome', storageMock.chrome);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getProfile returns null when not set', async () => {
    await expect(getProfile()).resolves.toBeNull();
  });

  it('saveProfile then getProfile returns the same data', async () => {
    const profile = makeValidProfile({
      personal: {
        ...DEFAULT_PROFILE.personal,
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        city: 'Bengaluru',
      },
    });

    await saveProfile(profile);
    const loaded = await getProfile();

    expect(loaded).toEqual(profile);
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it('logApplication adds to the applications array', async () => {
    const first = makeApplication({ id: 'app-1' });
    const second = makeApplication({
      id: 'app-2',
      role: 'Product Manager',
    });

    await logApplication(first);
    await logApplication(second);

    const applications = await getApplications();

    expect(applications).toHaveLength(2);
    expect(applications[0]).toMatchObject({
      id: 'app-1',
      company: 'Acme Corp',
      status: 'applied',
    });
    expect(applications[1]?.id).toBe('app-2');
  });

  it('updateApplicationStatus changes only the status field', async () => {
    const application = makeApplication({
      id: 'app-42',
      notes: 'Follow up next week',
    });

    await logApplication(application);
    await updateApplicationStatus('app-42', 'interview');

    const [updated] = await getApplications();

    expect(updated?.status).toBe('interview');
    expect(updated?.company).toBe('Acme Corp');
    expect(updated?.role).toBe('Software Engineer');
    expect(updated?.notes).toBe('Follow up next week');
    expect(updated?.appliedAt).toBe(application.appliedAt);
  });

  it('getSettings returns defaults when unset', async () => {
    await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('saveSettings merges with existing settings', async () => {
    await saveSettings({ debugMode: true, theme: 'dark' });
    const settings = await getSettings();

    expect(settings.debugMode).toBe(true);
    expect(settings.theme).toBe('dark');
    expect(settings.pauseBeforeSubmit).toBe(DEFAULT_SETTINGS.pauseBeforeSubmit);
  });

  it('learnField persists and getLearnedFields retrieves mappings', async () => {
    await learnField('abc123', 'fullName', 'legal name', 'https://jobs.example.com/');

    const learned = await getLearnedFields();

    expect(learned.abc123?.value).toBe('fullName');
    expect(learned.abc123?.normalizedLabel).toBe('legal name');
    expect(learned.abc123?.sites).toContain('jobs.example.com');
  });

  it('saveCoverLetter stores templates and getCoverLetters reads them', async () => {
    const template: CoverLetterTemplate = {
      id: 'letter-1',
      name: 'Default',
      body: 'Hello {{your_name}}',
      createdAt: 1,
      updatedAt: 1,
    };

    await saveCoverLetter(template);

    await expect(getCoverLetters()).resolves.toEqual([template]);
  });

  it('clearAllData resets everything', async () => {
    await saveProfile(makeValidProfile());
    await logApplication(makeApplication());
    storageMock.store.settings = { debugMode: true };
    storageMock.store.learnedFields = { abc: { value: 'email' } };

    await clearAllData();

    expect(chrome.storage.local.clear).toHaveBeenCalled();
    expect(storageMock.store).toEqual({});
    await expect(getProfile()).resolves.toBeNull();
    await expect(getApplications()).resolves.toEqual([]);
  });
});

describe('getAutofillData', () => {
  beforeEach(() => {
    storageMock = createChromeStorageMock({
      profile: DEFAULT_PROFILE,
      settings: { debugMode: true },
      learnedFields: {
        abc123: {
          value: 'fullName',
          normalizedLabel: 'legal name',
          learnedAt: 1,
          timesUsed: 0,
          sites: [],
        },
      },
    });
    vi.stubGlobal('chrome', storageMock.chrome);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads profile, settings, and learnedFields in one storage call', async () => {
    const data = await getAutofillData();

    expect(chrome.storage.local.get).toHaveBeenCalledWith([
      'profile',
      'settings',
      'learnedFields',
      'communityFields',
    ]);
    expect(data.profile).toEqual(DEFAULT_PROFILE);
    expect(data.settings).toEqual({ ...DEFAULT_SETTINGS, debugMode: true });
    expect(data.learnedFields.abc123?.value).toBe('fullName');
  });
});

describe('normalizeApplicationKey', () => {
  it('normalizes company and role for deduplication', () => {
    expect(normalizeApplicationKey('  Acme Corp ', ' Software Engineer ')).toBe(
      'acme corp::software engineer',
    );
  });
});

describe('hasRecentApplication', () => {
  beforeEach(() => {
    storageMock = createChromeStorageMock();
    vi.stubGlobal('chrome', storageMock.chrome);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true for the same company and role within 24 hours', async () => {
    await logApplication(
      makeApplication({
        company: 'Acme Corp',
        role: 'Software Engineer',
        appliedAt: Date.now() - 60_000,
      }),
    );

    await expect(
      hasRecentApplication('acme corp', 'software engineer'),
    ).resolves.toBe(true);
  });

  it('returns false for a different role', async () => {
    await logApplication(
      makeApplication({
        company: 'Acme Corp',
        role: 'Software Engineer',
        appliedAt: Date.now() - 60_000,
      }),
    );

    await expect(
      hasRecentApplication('Acme Corp', 'Product Manager'),
    ).resolves.toBe(false);
  });

  it('returns false for an expired entry', async () => {
    await logApplication(
      makeApplication({
        company: 'Acme Corp',
        role: 'Software Engineer',
        appliedAt: Date.now() - 25 * 60 * 60 * 1000,
      }),
    );

    await expect(
      hasRecentApplication('Acme Corp', 'Software Engineer'),
    ).resolves.toBe(false);
  });
});

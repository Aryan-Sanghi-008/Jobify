import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_VERSION } from '@/shared/backup';
import {
  applySavedProfile,
  createProfileFromImport,
  deleteSavedProfile,
  ensureProfileLibrary,
  inferProfileName,
  parseFlexibleProfileImport,
  replaceActiveProfileFromImport,
  snapshotActiveToLibrary,
} from '@/shared/profileLibrary';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '@/shared/storage';
import type {
  CoverLetterTemplate,
  LearnedField,
  SavedProfile,
  UserProfile,
} from '@/shared/types';

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

function makeProfile(overrides: {
  email?: string;
  fullName?: string;
} = {}): UserProfile {
  return {
    ...DEFAULT_PROFILE,
    personal: {
      ...DEFAULT_PROFILE.personal,
      fullName: overrides.fullName ?? 'Jane Doe',
      email: overrides.email ?? 'jane@example.com',
    },
  };
}

function makeCoverLetter(
  overrides: Partial<CoverLetterTemplate> = {},
): CoverLetterTemplate {
  return {
    id: 'letter-1',
    name: 'Default',
    body: 'Hello',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeSavedProfile(
  overrides: Partial<SavedProfile> = {},
): SavedProfile {
  const now = Date.now();

  return {
    id: overrides.id ?? 'profile-a',
    name: overrides.name ?? 'Profile A',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    profile: overrides.profile ?? makeProfile({ email: 'a@example.com', fullName: 'Alice' }),
    coverLetters: overrides.coverLetters ?? [],
    applications: overrides.applications ?? [],
    learnedFields: overrides.learnedFields ?? {},
    jobPreferences: overrides.jobPreferences ?? {
      desiredRole: '',
      preferredLocations: [],
      minSalary: null,
      adzunaAppId: null,
      adzunaAppKey: null,
      adzunaCountry: 'gb',
    },
    settings: overrides.settings ?? DEFAULT_SETTINGS,
    lastFillResult: overrides.lastFillResult ?? null,
  };
}

let storageMock = createChromeStorageMock();

describe('parseFlexibleProfileImport', () => {
  it('parses a full backup payload', () => {
    const payload = {
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      profile: makeProfile({ email: 'backup@example.com' }),
      coverLetters: [makeCoverLetter()],
      applications: [],
      learnedFields: {
        abc: {
          value: 'yes',
          normalizedLabel: 'willing to relocate',
          learnedAt: 1,
          timesUsed: 1,
          sites: ['linkedin.com'],
        } satisfies LearnedField,
      },
      settings: DEFAULT_SETTINGS,
    };

    const parsed = parseFlexibleProfileImport(payload);

    expect(parsed).not.toBeNull();
    expect(parsed?.profile?.personal.email).toBe('backup@example.com');
    expect(parsed?.coverLetters).toHaveLength(1);
    expect(parsed?.learnedFields?.abc?.value).toBe('yes');
  });

  it('parses a partial object with profile, learned fields, and settings', () => {
    const partial = {
      name: 'Aryan Sanghi',
      profile: makeProfile({ fullName: 'Aryan Sanghi', email: 'aryan@example.com' }),
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' as const },
      learnedFields: {
        hash123: {
          value: 'Bengaluru',
          normalizedLabel: 'city',
          learnedAt: 2,
          timesUsed: 3,
          sites: ['workday.com'],
        },
      },
    };

    const parsed = parseFlexibleProfileImport(partial);

    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe('Aryan Sanghi');
    expect(parsed?.settings?.theme).toBe('dark');
    expect(parsed?.learnedFields?.hash123?.value).toBe('Bengaluru');
  });

  it('parses a bare UserProfile object', () => {
    const profile = makeProfile({ fullName: 'Bob Smith', email: 'bob@example.com' });

    const parsed = parseFlexibleProfileImport(profile);

    expect(parsed).toEqual({ profile });
  });

  it('rejects invalid or empty input', () => {
    expect(parseFlexibleProfileImport(null)).toBeNull();
    expect(parseFlexibleProfileImport('not-json')).toBeNull();
    expect(parseFlexibleProfileImport({ profile: { bad: true } })).toBeNull();
    expect(parseFlexibleProfileImport({})).toBeNull();
  });
});

describe('inferProfileName', () => {
  it('prefers an explicit name', () => {
    expect(inferProfileName(makeProfile(), 'Custom Name')).toBe('Custom Name');
  });

  it('uses full name when no explicit name is provided', () => {
    expect(
      inferProfileName(makeProfile({ fullName: 'Aryan Sanghi', email: 'aryan@example.com' })),
    ).toBe('Aryan Sanghi');
  });

  it('falls back to the email local-part', () => {
    expect(
      inferProfileName(makeProfile({ fullName: '', email: 'aryan.sanghi@example.com' })),
    ).toBe('aryan.sanghi');
  });

  it('uses a default label when nothing else is available', () => {
    expect(inferProfileName(null)).toBe('Imported profile');
  });
});

describe('profile library operations', () => {
  beforeEach(() => {
    storageMock = createChromeStorageMock();
    vi.stubGlobal('chrome', storageMock.chrome);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ensureProfileLibrary creates a default entry from active data', async () => {
    storageMock.store.profile = makeProfile({ email: 'active@example.com' });

    await ensureProfileLibrary();

    const savedProfiles = storageMock.store.savedProfiles as SavedProfile[];
    expect(savedProfiles).toHaveLength(1);
    expect(savedProfiles[0].name).toBe('Default');
    expect(savedProfiles[0].profile?.personal.email).toBe('active@example.com');
    expect(storageMock.store.activeProfileId).toBe(savedProfiles[0].id);
  });

  it('snapshotActiveToLibrary updates the active saved profile', async () => {
    const profileA = makeSavedProfile({
      id: 'active-id',
      name: 'Active',
      profile: makeProfile({ email: 'old@example.com' }),
    });

    storageMock.store.savedProfiles = [profileA];
    storageMock.store.activeProfileId = 'active-id';
    storageMock.store.profile = makeProfile({ email: 'updated@example.com' });

    await snapshotActiveToLibrary();

    const savedProfiles = storageMock.store.savedProfiles as SavedProfile[];
    expect(savedProfiles[0].profile?.personal.email).toBe('updated@example.com');
    expect(savedProfiles[0].updatedAt).toBeGreaterThanOrEqual(profileA.updatedAt);
  });

  it('applySavedProfile swaps active flat keys and preserves api key', async () => {
    const profileA = makeSavedProfile({
      id: 'profile-a',
      name: 'Alice',
      profile: makeProfile({ email: 'alice@example.com', fullName: 'Alice' }),
      settings: { ...DEFAULT_SETTINGS, theme: 'light' },
    });
    const profileB = makeSavedProfile({
      id: 'profile-b',
      name: 'Bob',
      profile: makeProfile({ email: 'bob@example.com', fullName: 'Bob' }),
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
    });

    storageMock.store.savedProfiles = [profileA, profileB];
    storageMock.store.activeProfileId = 'profile-a';
    storageMock.store.profile = profileA.profile;
    storageMock.store.settings = {
      ...DEFAULT_SETTINGS,
      theme: 'light',
      apiKey: 'local-secret',
      aiProvider: 'openai',
    };
    storageMock.store.coverLetters = [];
    storageMock.store.applications = [];
    storageMock.store.learnedFields = {};
    storageMock.store.jobPreferences = profileA.jobPreferences;
    storageMock.store.lastFillResult = null;

    await applySavedProfile('profile-b');

    expect(storageMock.store.activeProfileId).toBe('profile-b');
    expect((storageMock.store.profile as UserProfile).personal.email).toBe('bob@example.com');
    expect((storageMock.store.settings as typeof DEFAULT_SETTINGS).theme).toBe('dark');
    expect((storageMock.store.settings as typeof DEFAULT_SETTINGS).apiKey).toBe('local-secret');
    expect((storageMock.store.settings as typeof DEFAULT_SETTINGS).aiProvider).toBe('openai');

    const savedProfiles = storageMock.store.savedProfiles as SavedProfile[];
    const snapshottedA = savedProfiles.find((entry) => entry.id === 'profile-a');
    expect(snapshottedA?.profile?.personal.email).toBe('alice@example.com');
  });

  it('cannot delete the last saved profile', async () => {
    const onlyProfile = makeSavedProfile({ id: 'only-one' });

    storageMock.store.savedProfiles = [onlyProfile];
    storageMock.store.activeProfileId = 'only-one';

    await expect(deleteSavedProfile('only-one')).rejects.toThrow(
      'Cannot delete the last saved profile',
    );
  });

  it('replaceActiveProfileFromImport updates active flat keys for the current profile', async () => {
    const activeProfile = makeSavedProfile({
      id: 'active-id',
      name: 'Old Name',
      profile: makeProfile({ email: 'old@example.com', fullName: 'Old User' }),
      settings: { ...DEFAULT_SETTINGS, theme: 'light' },
    });

    storageMock.store.savedProfiles = [activeProfile];
    storageMock.store.activeProfileId = 'active-id';
    storageMock.store.profile = activeProfile.profile;
    storageMock.store.settings = {
      ...DEFAULT_SETTINGS,
      theme: 'light',
      apiKey: 'keep-me',
      aiProvider: 'openai',
    };
    storageMock.store.coverLetters = [];
    storageMock.store.applications = [];
    storageMock.store.learnedFields = {};
    storageMock.store.jobPreferences = activeProfile.jobPreferences;
    storageMock.store.lastFillResult = null;

    const merged = await replaceActiveProfileFromImport({
      name: 'Aryan Sanghi',
      profile: makeProfile({ email: 'aryan@example.com', fullName: 'Aryan Sanghi' }),
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
      coverLetters: [makeCoverLetter({ id: 'imported-letter' })],
    });

    expect(merged.profile?.personal.email).toBe('aryan@example.com');
    expect((storageMock.store.profile as UserProfile).personal.email).toBe('aryan@example.com');
    expect((storageMock.store.settings as typeof DEFAULT_SETTINGS).theme).toBe('dark');
    expect((storageMock.store.settings as typeof DEFAULT_SETTINGS).apiKey).toBe('keep-me');

    const savedProfiles = storageMock.store.savedProfiles as SavedProfile[];
    expect(savedProfiles[0].profile?.personal.email).toBe('aryan@example.com');
    expect(savedProfiles[0].name).toBe('Aryan Sanghi');
  });

  it('createProfileFromImport appends a new library entry', async () => {
    const existing = makeSavedProfile({ id: 'existing' });
    storageMock.store.savedProfiles = [existing];
    storageMock.store.activeProfileId = 'existing';

    const created = await createProfileFromImport(
      { profile: makeProfile({ email: 'new@example.com', fullName: 'New User' }) },
      { activate: false },
    );

    const savedProfiles = storageMock.store.savedProfiles as SavedProfile[];
    expect(savedProfiles).toHaveLength(2);
    expect(created.name).toBe('New User');
    expect(storageMock.store.activeProfileId).toBe('existing');
  });
});

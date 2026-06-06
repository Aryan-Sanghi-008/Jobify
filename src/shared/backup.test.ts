import { describe, expect, it } from 'vitest';
import {
  BACKUP_VERSION,
  getBackupPreview,
  mergeApplications,
  mergeCoverLetters,
  mergeLearnedFields,
  mergeProfile,
  parseBackupFile,
} from '@/shared/backup';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '@/shared/storage';
import type {
  CoverLetterTemplate,
  JobApplication,
  LearnedField,
  UserProfile,
} from '@/shared/types';

function makeProfile(email: string): UserProfile {
  return {
    ...DEFAULT_PROFILE,
    personal: {
      ...DEFAULT_PROFILE.personal,
      email,
      fullName: 'Jane Doe',
    },
  };
}

function makeApplication(
  overrides: Partial<JobApplication> = {},
): JobApplication {
  return {
    id: 'app-1',
    company: 'Acme Corp',
    role: 'Engineer',
    portal: 'linkedin',
    url: 'https://example.com/jobs/1',
    appliedAt: 1_700_000_000_000,
    status: 'applied',
    ...overrides,
  };
}

function makeCoverLetter(
  overrides: Partial<CoverLetterTemplate> = {},
): CoverLetterTemplate {
  return {
    id: 'letter-1',
    name: 'Default',
    body: 'Hello {{company_name}}',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('parseBackupFile', () => {
  it('accepts a valid v1.0 backup payload', () => {
    const payload = {
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      profile: makeProfile('jane@example.com'),
      coverLetters: [makeCoverLetter()],
      applications: [makeApplication()],
      learnedFields: {
        abc123: {
          value: 'yes',
          normalizedLabel: 'willing to relocate',
          learnedAt: 1,
          timesUsed: 2,
          sites: ['linkedin.com'],
        },
      },
      settings: DEFAULT_SETTINGS,
    };

    expect(parseBackupFile(payload)).toEqual(payload);
  });

  it('rejects backups with unsupported versions', () => {
    const payload = {
      version: '2.0',
      exportedAt: Date.now(),
      profile: null,
      coverLetters: [],
      applications: [],
      learnedFields: {},
      settings: DEFAULT_SETTINGS,
    };

    expect(parseBackupFile(payload)).toBeNull();
  });

  it('accepts legacy backups without version metadata', () => {
    const legacy = {
      profile: makeProfile('jane@example.com'),
      coverLetters: [makeCoverLetter()],
      applications: [makeApplication()],
      settings: DEFAULT_SETTINGS,
    };

    const parsed = parseBackupFile(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(BACKUP_VERSION);
    expect(parsed?.learnedFields).toEqual({});
    expect(parsed?.applications).toHaveLength(1);
  });
});

describe('getBackupPreview', () => {
  it('summarizes backup contents', () => {
    const preview = getBackupPreview({
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      profile: makeProfile('jane@example.com'),
      coverLetters: [makeCoverLetter(), makeCoverLetter({ id: 'letter-2' })],
      applications: [makeApplication(), makeApplication({ id: 'app-2' })],
      learnedFields: {
        one: {
          value: 'yes',
          normalizedLabel: 'field one',
          learnedAt: 1,
          timesUsed: 0,
          sites: [],
        },
        two: {
          value: 'no',
          normalizedLabel: 'field one',
          learnedAt: 2,
          timesUsed: 0,
          sites: [],
        },
      },
      settings: DEFAULT_SETTINGS,
    });

    expect(preview).toEqual({
      applicationCount: 2,
      coverLetterCount: 2,
      learnedFieldCount: 1,
      hasProfile: true,
    });
  });
});

describe('merge helpers', () => {
  it('deduplicates applications by id and keeps the newer record', () => {
    const merged = mergeApplications(
      [makeApplication({ id: 'app-1', company: 'Old Co', appliedAt: 100 })],
      [makeApplication({ id: 'app-1', company: 'New Co', appliedAt: 200 })],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.company).toBe('New Co');
  });

  it('deduplicates cover letters by id and keeps the newer record', () => {
    const merged = mergeCoverLetters(
      [makeCoverLetter({ id: 'letter-1', name: 'Old', updatedAt: 100 })],
      [makeCoverLetter({ id: 'letter-1', name: 'New', updatedAt: 200 })],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe('New');
  });

  it('merges learned fields by key and keeps the newer record', () => {
    const existing: Record<string, LearnedField> = {
      key1: {
        value: 'old',
        normalizedLabel: 'label',
        learnedAt: 100,
        timesUsed: 1,
        sites: [],
      },
    };
    const incoming: Record<string, LearnedField> = {
      key1: {
        value: 'new',
        normalizedLabel: 'label',
        learnedAt: 200,
        timesUsed: 2,
        sites: [],
      },
      key2: {
        value: 'added',
        normalizedLabel: 'added label',
        learnedAt: 50,
        timesUsed: 0,
        sites: [],
      },
    };

    const merged = mergeLearnedFields(existing, incoming);
    expect(merged.key1?.value).toBe('new');
    expect(merged.key2?.value).toBe('added');
  });

  it('keeps the newer profile based on export timestamp', () => {
    const existing = makeProfile('existing@example.com');
    const incoming = makeProfile('incoming@example.com');

    expect(
      mergeProfile(existing, incoming, 500, 400)?.personal.email,
    ).toBe('incoming@example.com');
    expect(
      mergeProfile(existing, incoming, 300, 400)?.personal.email,
    ).toBe('existing@example.com');
  });
});

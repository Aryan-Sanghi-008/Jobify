import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '@/shared/storage';
import {
  Logger,
  getFilledProfileKeys,
  getProfileCompleteness,
  parseChromeVersion,
} from '@/shared/logger';

describe('Logger', () => {
  beforeEach(() => {
    Logger.setDebugMode(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Logger.setDebugMode(false);
  });

  it('suppresses debug logs when debug mode is disabled', () => {
    Logger.setDebugMode(false);
    Logger.debug('Test', 'hidden message');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('logs debug messages with module prefix when debug mode is enabled', () => {
    Logger.debug('Filler', 'filled field', { label: 'Email' });
    expect(console.log).toHaveBeenCalledWith(
      '[JobAutofill:Filler]',
      'filled field',
      { label: 'Email' },
    );
  });

  it('redacts sensitive profile values in debug logs', () => {
    Logger.debug('Profile', 'profile snapshot', {
      ...DEFAULT_PROFILE,
      personal: {
        ...DEFAULT_PROFILE.personal,
        email: 'secret@example.com',
        phone: '555-1234',
      },
    });

    const loggedData = vi.mocked(console.log).mock.calls[0]?.[2] as {
      filledKeys: string[];
      completeness: number;
    };

    expect(loggedData.filledKeys).toContain('personal.email');
    expect(loggedData.filledKeys).toContain('personal.phone');
    expect(JSON.stringify(loggedData)).not.toContain('secret@example.com');
    expect(JSON.stringify(loggedData)).not.toContain('555-1234');
  });

  it('always logs errors regardless of debug mode', () => {
    Logger.setDebugMode(false);
    Logger.error('Background', 'handler failed', new Error('boom'));
    expect(console.error).toHaveBeenCalledWith(
      '[JobAutofill:Background]',
      'handler failed',
      'boom',
    );
  });
});

describe('getProfileCompleteness', () => {
  it('returns filled key names without values', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      personal: {
        ...DEFAULT_PROFILE.personal,
        email: 'jane@example.com',
        phone: '+1 555-0100',
        fullName: 'Jane Doe',
      },
      skills: ['TypeScript'],
    };

    const completeness = getProfileCompleteness(profile);

    expect(completeness.percent).toBeGreaterThan(0);
    expect(completeness.filledKeys).toEqual(
      expect.arrayContaining(['personal.email', 'personal.phone', 'personal.fullName', 'skills']),
    );
    expect(getFilledProfileKeys(profile)).not.toContain('jane@example.com');
  });
});

describe('parseChromeVersion', () => {
  it('extracts the Chrome version from user agent strings', () => {
    expect(
      parseChromeVersion(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.234 Safari/537.36',
      ),
    ).toBe('120.0.6099.234');
  });
});

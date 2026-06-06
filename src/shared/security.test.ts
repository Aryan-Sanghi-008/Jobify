import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '@/shared/storage';
import {
  containsForbiddenCredentials,
  createRateLimiter,
  sanitizeString,
  validateContentMessage,
  validateCtc,
  validateEmail,
  validateMessage,
  validateNoticePeriod,
  validatePhone,
  validateProfile,
  validateUrl,
  validateYear,
} from '@/shared/security';
import type { UserProfile } from '@/shared/types';

describe('sanitizeString', () => {
  it('strips script tags from stored strings', () => {
    expect(sanitizeString('Hello <script>alert(1)</script> world')).toBe(
      'Hello  world',
    );
  });
});

describe('containsForbiddenCredentials', () => {
  it('detects forbidden credential keys', () => {
    expect(
      containsForbiddenCredentials({
        personal: { password: 'secret' },
      }),
    ).toBe(true);
  });

  it('allows normal profile data', () => {
    expect(containsForbiddenCredentials(DEFAULT_PROFILE)).toBe(false);
  });
});

describe('validateProfile', () => {
  it('accepts a valid profile', () => {
    const profile: UserProfile = {
      ...DEFAULT_PROFILE,
      personal: {
        ...DEFAULT_PROFILE.personal,
        email: 'jane@example.com',
        phone: '+1 (555) 123-4567',
      },
      professional: {
        ...DEFAULT_PROFILE.professional,
        noticePeriod: 30,
        currentCTC: 12,
        expectedCTC: 18,
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
    };

    expect(validateProfile(profile).valid).toBe(true);
  });

  it('rejects invalid email, phone, CTC, and year values', () => {
    const result = validateProfile({
      ...DEFAULT_PROFILE,
      personal: {
        ...DEFAULT_PROFILE.personal,
        email: 'not-an-email',
        phone: 'abc!!!',
      },
      professional: {
        ...DEFAULT_PROFILE.professional,
        noticePeriod: 400,
        currentCTC: 1500,
        expectedCTC: -1,
      },
      education: [
        {
          degree: '',
          field: '',
          institution: '',
          graduationYear: 1899,
          percentage: '',
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors['personal.email']).toBeDefined();
    expect(result.errors['personal.phone']).toBeDefined();
    expect(result.errors['professional.noticePeriod']).toBeDefined();
    expect(result.errors['professional.currentCTC']).toBeDefined();
    expect(result.errors['education.0.graduationYear']).toBeDefined();
  });
});

describe('field validators', () => {
  it('validates email, phone, and URL formats', () => {
    expect(validateEmail('jane@example.com')).toBeNull();
    expect(validateEmail('bad-email')).not.toBeNull();
    expect(validatePhone('+91 98765-43210')).toBeNull();
    expect(validatePhone('phone!')).not.toBeNull();
    expect(validateUrl('https://example.com')).toBeNull();
    expect(validateUrl('ftp://example.com')).not.toBeNull();
  });

  it('validates CTC, notice period, and year ranges', () => {
    expect(validateCtc(12, 'Current CTC')).toBeNull();
    expect(validateCtc(1001, 'Current CTC')).not.toBeNull();
    expect(validateNoticePeriod(30)).toBeNull();
    expect(validateNoticePeriod(366)).not.toBeNull();
    expect(validateYear(2020)).toBeNull();
    expect(validateYear(1949)).not.toBeNull();
    expect(validateYear(2031)).not.toBeNull();
  });
});

describe('validateMessage', () => {
  it('accepts known extension messages and rejects unknown types', () => {
    expect(validateMessage({ type: 'PING' })).toBe(true);
    expect(validateMessage({ type: 'GET_PROFILE' })).toBe(true);
    expect(validateMessage({ type: 'UNKNOWN' })).toBe(false);
    expect(validateMessage(null)).toBe(false);
  });
});

describe('validateContentMessage', () => {
  it('accepts valid content messages and rejects malformed payloads', () => {
    expect(validateContentMessage({ type: 'TRIGGER_AUTOFILL' })).toBe(true);
    expect(
      validateContentMessage({
        type: 'FILL_SINGLE_FIELD',
        label: 'Email',
        value: 'jane@example.com',
      }),
    ).toBe(true);
    expect(
      validateContentMessage({
        type: 'FILL_SINGLE_FIELD',
        label: 1,
        value: 'x',
      }),
    ).toBe(false);
  });
});

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('allows up to 3 requests in 30 seconds and then blocks', () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: 30_000 });

    expect(limiter.isLimited()).toBe(false);
    expect(limiter.isLimited()).toBe(false);
    expect(limiter.isLimited()).toBe(false);
    expect(limiter.isLimited()).toBe(true);

    vi.advanceTimersByTime(30_001);
    expect(limiter.isLimited()).toBe(false);
  });
});

import type {
  ApplicationCompleteMessage,
  ContentMessageType,
  ContentScriptMessage,
  ExtensionMessage,
  FormStateChangedMessage,
  JobApplication,
  MessageType,
  PortalName,
  UserProfile,
} from '@/shared/types';

const MESSAGE_TYPES: MessageType[] = [
  'GET_PROFILE',
  'SAVE_PROFILE',
  'LOG_APPLICATION',
  'LEARN_FIELD',
  'GET_SETTINGS',
  'PING',
  'PORTAL_DETECTED',
  'APPLICATION_COMPLETE',
  'FORM_STATE_CHANGED',
];

const CONTENT_MESSAGE_TYPES: ContentMessageType[] = [
  'TRIGGER_AUTOFILL',
  'CONTINUE_AUTOFILL',
  'STOP_AUTOFILL',
  'FILL_COVER_LETTER',
  'GET_PAGE_INFO',
  'LEARN_FIELD_MAPPING',
  'FILL_SINGLE_FIELD',
  'CHECK_FORM_PROGRESS',
];

const PORTAL_NAMES: PortalName[] = [
  'linkedin',
  'naukri',
  'wellfound',
  'instahyre',
  'greenhouse',
  'lever',
  'workday',
  'generic',
];

const SCRIPT_TAG_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;

const FORBIDDEN_STORAGE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /^auth$/i,
  /credential/i,
];

export const STORAGE_SIZE_WARN_BYTES = 4 * 1024 * 1024;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^[\d\s+\-()]*$/;
export const URL_PATTERN = /^https?:\/\/.+/i;

export interface ProfileValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function assertRuntimeValid(): void {
  if (!chrome.runtime?.id) {
    throw new Error('Extension context invalidated');
  }
}

export function sanitizeString(value: string): string {
  return value.replace(SCRIPT_TAG_PATTERN, '').trim();
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }

  if (isRecord(value)) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value)) {
      if (isForbiddenStorageKey(key)) {
        continue;
      }

      sanitized[key] = sanitizeUnknown(nested);
    }

    return sanitized;
  }

  return value;
}

export function isForbiddenStorageKey(key: string): boolean {
  return FORBIDDEN_STORAGE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function containsForbiddenCredentials(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenCredentials(item));
  }

  if (!isRecord(value)) {
    return false;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (isForbiddenStorageKey(key)) {
      return true;
    }

    if (containsForbiddenCredentials(nested)) {
      return true;
    }
  }

  return false;
}

export function sanitizeStorageData<T>(value: T): T {
  return sanitizeUnknown(value) as T;
}

export function sanitizeProfile(profile: UserProfile): UserProfile {
  return sanitizeStorageData(profile);
}

export function sanitizeJobApplication(app: JobApplication): JobApplication {
  return sanitizeUnknown(app) as JobApplication;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return 'Email is required';
  }

  if (!EMAIL_PATTERN.test(trimmed)) {
    return 'Enter a valid email address';
  }

  return null;
}

export function validatePhone(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  if (!PHONE_PATTERN.test(value)) {
    return 'Phone may only contain digits, spaces, +, -, (, )';
  }

  return null;
}

export function validateUrl(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (!URL_PATTERN.test(trimmed)) {
    return 'URL must start with http:// or https://';
  }

  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'URL must start with http:// or https://';
    }
    return null;
  } catch {
    return 'Enter a valid URL';
  }
}

export function validateCtc(value: number, label: string): string | null {
  if (Number.isNaN(value)) {
    return `${label} must be a number`;
  }

  if (value < 0) {
    return `${label} must be a positive number`;
  }

  if (value > 1000) {
    return `${label} cannot exceed 1000 LPA`;
  }

  return null;
}

export function validateNoticePeriod(value: number): string | null {
  if (Number.isNaN(value)) {
    return 'Notice period must be a number';
  }

  if (value < 0 || value > 365) {
    return 'Notice period must be between 0 and 365 days';
  }

  return null;
}

export function validateYear(value: number): string | null {
  if (Number.isNaN(value)) {
    return 'Year must be a number';
  }

  if (value === 0) {
    return null;
  }

  if (value < 1950 || value > 2030) {
    return 'Year must be between 1950 and 2030';
  }

  return null;
}

export function validateProfile(profile: UserProfile): ProfileValidationResult {
  const errors: Record<string, string> = {};

  const emailError = validateEmail(profile.personal.email);
  if (emailError) {
    errors['personal.email'] = emailError;
  }

  const phoneError = validatePhone(profile.personal.phone);
  if (phoneError) {
    errors['personal.phone'] = phoneError;
  }

  for (const [field, value] of [
    ['personal.linkedinUrl', profile.personal.linkedinUrl],
    ['personal.githubUrl', profile.personal.githubUrl],
    ['personal.portfolioUrl', profile.personal.portfolioUrl],
    ['personal.twitterUrl', profile.personal.twitterUrl],
  ] as const) {
    const urlError = validateUrl(value);
    if (urlError) {
      errors[field] = urlError;
    }
  }

  const noticeError = validateNoticePeriod(profile.professional.noticePeriod);
  if (noticeError) {
    errors['professional.noticePeriod'] = noticeError;
  }

  const currentCtcError = validateCtc(profile.professional.currentCTC, 'Current CTC');
  if (currentCtcError) {
    errors['professional.currentCTC'] = currentCtcError;
  }

  const expectedCtcError = validateCtc(
    profile.professional.expectedCTC,
    'Expected CTC',
  );
  if (expectedCtcError) {
    errors['professional.expectedCTC'] = expectedCtcError;
  }

  profile.education.forEach((entry, index) => {
    const yearError = validateYear(entry.graduationYear);
    if (yearError) {
      errors[`education.${index}.graduationYear`] = yearError;
    }
  });

  if (containsForbiddenCredentials(profile)) {
    errors._credentials = 'Profiles cannot store passwords or auth tokens';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

function isUserProfile(payload: unknown): payload is UserProfile {
  if (!isRecord(payload)) {
    return false;
  }

  return isRecord(payload.personal) && isRecord(payload.professional);
}

function isJobApplication(payload: unknown): payload is JobApplication {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    typeof payload.id === 'string' &&
    typeof payload.company === 'string' &&
    typeof payload.role === 'string' &&
    typeof payload.portal === 'string' &&
    typeof payload.url === 'string' &&
    typeof payload.appliedAt === 'number' &&
    typeof payload.status === 'string'
  );
}

function isPortalName(value: unknown): value is PortalName {
  return typeof value === 'string' && PORTAL_NAMES.includes(value as PortalName);
}

export function validateMessage(message: unknown): message is ExtensionMessage {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  if (!MESSAGE_TYPES.includes(message.type as MessageType)) {
    return false;
  }

  switch (message.type) {
    case 'GET_PROFILE':
    case 'GET_SETTINGS':
    case 'PING':
      return true;
    case 'SAVE_PROFILE':
      return isUserProfile(message.payload);
    case 'LOG_APPLICATION':
      return isJobApplication(message.payload);
    case 'LEARN_FIELD':
      return (
        typeof message.labelHash === 'string' &&
        typeof message.profileKey === 'string' &&
        (message.normalizedLabel === undefined ||
          typeof message.normalizedLabel === 'string') &&
        (message.site === undefined || typeof message.site === 'string')
      );
    case 'PORTAL_DETECTED':
      return isPortalName(message.portal);
    case 'APPLICATION_COMPLETE': {
      const payload = (message as unknown as ApplicationCompleteMessage).payload;
      return (
        isRecord(payload) &&
        typeof payload.company === 'string' &&
        typeof payload.role === 'string' &&
        isPortalName(payload.portal) &&
        typeof payload.url === 'string'
      );
    }
    case 'FORM_STATE_CHANGED': {
      const payload = (message as unknown as FormStateChangedMessage).payload;
      return (
        isRecord(payload) &&
        typeof payload.state === 'string' &&
        typeof payload.pageNumber === 'number' &&
        typeof payload.totalFilled === 'number' &&
        Array.isArray(payload.totalUnknown) &&
        Array.isArray(payload.errors)
      );
    }
    default:
      return false;
  }
}

export function validateContentMessage(
  message: unknown,
): message is ContentScriptMessage {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  if (!CONTENT_MESSAGE_TYPES.includes(message.type as ContentMessageType)) {
    return false;
  }

  switch (message.type) {
    case 'TRIGGER_AUTOFILL':
    case 'CONTINUE_AUTOFILL':
    case 'STOP_AUTOFILL':
    case 'GET_PAGE_INFO':
    case 'CHECK_FORM_PROGRESS':
      return true;
    case 'FILL_COVER_LETTER':
      return (
        message.templateId === undefined || typeof message.templateId === 'string'
      );
    case 'LEARN_FIELD_MAPPING':
      return (
        typeof message.labelHash === 'string' &&
        typeof message.profileKey === 'string' &&
        typeof message.normalizedLabel === 'string'
      );
    case 'FILL_SINGLE_FIELD':
      return (
        typeof message.label === 'string' && typeof message.value === 'string'
      );
    default:
      return false;
  }
}

export async function checkStorageSize(): Promise<{
  bytesInUse: number;
  exceedsWarningThreshold: boolean;
}> {
  const bytesInUse = await chrome.storage.local.getBytesInUse();
  return {
    bytesInUse,
    exceedsWarningThreshold: bytesInUse >= STORAGE_SIZE_WARN_BYTES,
  };
}

export function createRateLimiter(config: RateLimitConfig) {
  const timestamps: number[] = [];

  return {
    isLimited(): boolean {
      const now = Date.now();
      const cutoff = now - config.windowMs;

      while (timestamps.length > 0 && timestamps[0] < cutoff) {
        timestamps.shift();
      }

      if (timestamps.length >= config.maxRequests) {
        return true;
      }

      timestamps.push(now);
      return false;
    },
    reset(): void {
      timestamps.length = 0;
    },
  };
}

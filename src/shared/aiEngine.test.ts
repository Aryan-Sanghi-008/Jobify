import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '@/shared/storage';
import {
  AiEngineError,
  buildProfileSummary,
  generateCoverLetter,
  testAiConnection,
} from '@/shared/aiEngine';
import { validateApiKey } from '@/shared/security';
import type { UserProfile } from '@/shared/types';

const ANTHROPIC_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456';
const OPENAI_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';

const sampleProfile: UserProfile = {
  ...DEFAULT_PROFILE,
  personal: {
    ...DEFAULT_PROFILE.personal,
    fullName: 'Jane Doe',
  },
  professional: {
    ...DEFAULT_PROFILE.professional,
    currentTitle: 'Software Engineer',
    currentCompany: 'Acme Corp',
    totalYearsExp: 5,
  },
  skills: ['TypeScript', 'React', 'Node.js'],
  experience: [
    {
      title: 'Senior Engineer',
      company: 'Beta Inc',
      startDate: '2020-01',
      endDate: '',
      current: true,
      description: 'Built scalable web applications.',
    },
  ],
};

describe('validateApiKey', () => {
  it('accepts valid Anthropic keys', () => {
    expect(validateApiKey(ANTHROPIC_KEY, 'anthropic')).toBe(true);
  });

  it('accepts valid OpenAI keys', () => {
    expect(validateApiKey(OPENAI_KEY, 'openai')).toBe(true);
  });

  it('rejects Anthropic keys for OpenAI provider', () => {
    expect(validateApiKey(ANTHROPIC_KEY, 'openai')).toBe(false);
  });

  it('rejects malformed keys', () => {
    expect(validateApiKey('not-a-key', 'anthropic')).toBe(false);
  });
});

describe('buildProfileSummary', () => {
  it('includes professional details without sensitive fields', () => {
    const summary = buildProfileSummary(sampleProfile);

    expect(summary).toContain('Jane Doe');
    expect(summary).toContain('Software Engineer');
    expect(summary).toContain('TypeScript');
    expect(summary).not.toContain('jane@');
    expect(summary).not.toContain('555');
  });
});

describe('generateCoverLetter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns Anthropic cover letter text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Dear Hiring Manager...' }],
        }),
      }),
    );

    const result = await generateCoverLetter(
      'We are hiring a software engineer.',
      sampleProfile,
      ANTHROPIC_KEY,
      'anthropic',
    );

    expect(result).toBe('Dear Hiring Manager...');
  });

  it('returns OpenAI cover letter text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello from OpenAI.' } }],
        }),
      }),
    );

    const result = await generateCoverLetter(
      'We are hiring a software engineer.',
      sampleProfile,
      OPENAI_KEY,
      'openai',
    );

    expect(result).toBe('Hello from OpenAI.');
  });

  it('throws AiEngineError on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    await expect(
      generateCoverLetter('Job description', sampleProfile, ANTHROPIC_KEY, 'anthropic'),
    ).rejects.toBeInstanceOf(AiEngineError);
  });

  it('throws AiEngineError on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(
      generateCoverLetter('Job description', sampleProfile, OPENAI_KEY, 'openai'),
    ).rejects.toBeInstanceOf(AiEngineError);
  });
});

describe('testAiConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports success for valid Anthropic response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'OK' }],
        }),
      }),
    );

    const result = await testAiConnection(ANTHROPIC_KEY, 'anthropic');
    expect(result.success).toBe(true);
  });

  it('reports invalid key on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    const result = await testAiConnection(OPENAI_KEY, 'openai');
    expect(result).toEqual({ success: false, message: 'Invalid API key' });
  });

  it('reports quota exceeded on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      }),
    );

    const result = await testAiConnection(ANTHROPIC_KEY, 'anthropic');
    expect(result).toEqual({ success: false, message: 'API quota exceeded' });
  });
});

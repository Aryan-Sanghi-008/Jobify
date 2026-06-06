import type { UserProfile } from '@/shared/types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_MODEL = 'claude-3-haiku-20240307';
const OPENAI_MODEL = 'gpt-4o-mini';
const MAX_JOB_DESCRIPTION_CHARS = 1000;

export class AiEngineError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AiEngineError';
  }
}

function buildCoverLetterPrompt(
  jobDescription: string,
  profileSummary: string,
): string {
  const trimmedDescription = jobDescription.slice(0, MAX_JOB_DESCRIPTION_CHARS);

  return [
    'Write a concise 3-paragraph cover letter for this job.',
    `Candidate profile: ${profileSummary}`,
    `Job description: ${trimmedDescription}`,
    'Rules: professional tone, specific to the role, under 300 words.',
    'Output only the cover letter body, no Subject line.',
  ].join(' ');
}

/**
 * Builds a concise profile summary for AI prompts (no email, phone, or CTC).
 */
export function buildProfileSummary(profile: UserProfile): string {
  const parts: string[] = [];
  const { personal, professional, experience, skills } = profile;

  if (personal.fullName.trim()) {
    parts.push(`Name: ${personal.fullName.trim()}`);
  }

  if (professional.currentTitle.trim()) {
    const companySuffix = professional.currentCompany.trim()
      ? ` at ${professional.currentCompany.trim()}`
      : '';
    parts.push(`Current role: ${professional.currentTitle.trim()}${companySuffix}`);
  }

  if (professional.totalYearsExp > 0) {
    parts.push(`Experience: ${professional.totalYearsExp} years`);
  }

  if (skills.length > 0) {
    parts.push(`Skills: ${skills.slice(0, 8).join(', ')}`);
  }

  const recentExperience = experience[0];
  if (recentExperience) {
    const roleLine = `${recentExperience.title} at ${recentExperience.company}`;
    const description = recentExperience.description.trim();
    parts.push(
      description
        ? `Recent role: ${roleLine}. ${description.slice(0, 200)}`
        : `Recent role: ${roleLine}`,
    );
  }

  return parts.join('. ');
}

async function callAnthropic(
  apiKey: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  let response: Response;

  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch {
    throw new AiEngineError('Network error while contacting Anthropic');
  }

  if (!response.ok) {
    throw new AiEngineError(
      `Anthropic API error (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = data.content?.find((block) => block.type === 'text')?.text?.trim();
  if (!text) {
    throw new AiEngineError('Anthropic returned an empty response');
  }

  return text;
}

async function callOpenAi(
  apiKey: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  let response: Response;

  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch {
    throw new AiEngineError('Network error while contacting OpenAI');
  }

  if (!response.ok) {
    throw new AiEngineError(
      `OpenAI API error (${response.status})`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new AiEngineError('OpenAI returned an empty response');
  }

  return text;
}

/**
 * Generates a cover letter using the configured AI provider.
 */
export async function generateCoverLetter(
  jobDescription: string,
  profile: UserProfile,
  apiKey: string,
  provider: 'anthropic' | 'openai',
): Promise<string> {
  const profileSummary = buildProfileSummary(profile);
  const prompt = buildCoverLetterPrompt(jobDescription, profileSummary);

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, prompt, 512);
  }

  return callOpenAi(apiKey, prompt, 512);
}

/**
 * Sends a minimal request to verify the API key and provider connectivity.
 */
export async function testAiConnection(
  apiKey: string,
  provider: 'anthropic' | 'openai',
): Promise<{ success: boolean; message: string }> {
  try {
    if (provider === 'anthropic') {
      await callAnthropic(apiKey, 'Reply with only the word OK.', 8);
      return { success: true, message: 'Anthropic connection successful' };
    }

    await callOpenAi(apiKey, 'Reply with only the word OK.', 8);
    return { success: true, message: 'OpenAI connection successful' };
  } catch (error) {
    if (error instanceof AiEngineError) {
      if (error.statusCode === 401) {
        return { success: false, message: 'Invalid API key' };
      }

      if (error.statusCode === 429) {
        return { success: false, message: 'API quota exceeded' };
      }

      return { success: false, message: error.message };
    }

    return { success: false, message: 'Connection test failed' };
  }
}

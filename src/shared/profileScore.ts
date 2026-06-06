import type { UserProfile } from './types';

export interface ProfileCompletionScore {
  score: number;
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

function isFilledNumber(value: number): boolean {
  return typeof value === 'number' && !Number.isNaN(value) && value > 0;
}

function isFilledUrl(value: string): boolean {
  return /^https?:\/\/.+/i.test(value.trim());
}

function hasExperience(profile: UserProfile): boolean {
  return profile.experience.some(
    (entry) => isNonEmptyString(entry.title) && isNonEmptyString(entry.company),
  );
}

function hasEducation(profile: UserProfile): boolean {
  return profile.education.some(
    (entry) =>
      isNonEmptyString(entry.degree) && isNonEmptyString(entry.institution),
  );
}

export function getProfileCompletionScore(
  profile: UserProfile | null,
): ProfileCompletionScore {
  if (!profile) {
    return { score: 0 };
  }

  let score = 0;
  const { personal, professional } = profile;

  if (isNonEmptyString(personal.email)) {
    score += 15;
  }

  if (isNonEmptyString(personal.fullName)) {
    score += 10;
  }

  if (isNonEmptyString(personal.phone)) {
    score += 10;
  }

  if (isFilledNumber(professional.currentCTC)) {
    score += 10;
  }

  if (isFilledNumber(professional.expectedCTC)) {
    score += 10;
  }

  if (isFilledNumber(professional.noticePeriod)) {
    score += 10;
  }

  if (isFilledUrl(personal.linkedinUrl)) {
    score += 5;
  }

  if (hasExperience(profile)) {
    score += 10;
  }

  if (profile.skills.length > 0) {
    score += 5;
  }

  if (hasEducation(profile)) {
    score += 5;
  }

  if (isNonEmptyString(professional.currentTitle)) {
    score += 5;
  }

  if (isNonEmptyString(personal.city)) {
    score += 5;
  }

  return { score: Math.min(100, score) };
}

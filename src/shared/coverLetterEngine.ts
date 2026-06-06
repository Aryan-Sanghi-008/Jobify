import type { CoverLetterTemplate, UserProfile } from './types';

export const SUPPORTED_VARIABLES = [
  'company_name',
  'job_title',
  'your_name',
  'your_email',
  'your_phone',
  'current_role',
  'years_exp',
  'top_skills',
  'notice_period',
  'linkedin',
  'today_date',
] as const;

export type SupportedVariable = (typeof SUPPORTED_VARIABLES)[number];

const SUPPORTED_VARIABLE_SET = new Set<string>(SUPPORTED_VARIABLES);

const VARIABLE_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export interface CoverLetterPageContext {
  company: string;
  jobTitle: string;
}

function isSupportedVariable(name: string): name is SupportedVariable {
  return SUPPORTED_VARIABLE_SET.has(name.toLowerCase());
}

function normalizeVariableName(name: string): string {
  return name.toLowerCase();
}

function formatTodayDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMissingPlaceholder(varName: string): string {
  return `[${varName.toUpperCase()}]`;
}

function isEmptyString(value: string): boolean {
  return value.trim() === '';
}

function buildVariableMap(
  profile: UserProfile,
  pageContext: CoverLetterPageContext,
): Record<SupportedVariable, string | null> {
  const topSkills = profile.skills.slice(0, 3);

  return {
    company_name: isEmptyString(pageContext.company) ? null : pageContext.company,
    job_title: isEmptyString(pageContext.jobTitle) ? null : pageContext.jobTitle,
    your_name: isEmptyString(profile.personal.fullName)
      ? null
      : profile.personal.fullName,
    your_email: isEmptyString(profile.personal.email)
      ? null
      : profile.personal.email,
    your_phone: isEmptyString(profile.personal.phone)
      ? null
      : profile.personal.phone,
    current_role: isEmptyString(profile.professional.currentTitle)
      ? null
      : profile.professional.currentTitle,
    years_exp: String(profile.professional.totalYearsExp),
    top_skills: topSkills.length === 0 ? null : topSkills.join(', '),
    notice_period: `${profile.professional.noticePeriod} days`,
    linkedin: isEmptyString(profile.personal.linkedinUrl)
      ? null
      : profile.personal.linkedinUrl,
    today_date: formatTodayDate(),
  };
}

function extractTemplateVariables(template: string): string[] {
  const found = new Set<string>();
  const pattern = new RegExp(VARIABLE_PATTERN.source, VARIABLE_PATTERN.flags);

  for (const match of template.matchAll(pattern)) {
    const variable = match[1];
    if (variable) {
      found.add(normalizeVariableName(variable));
    }
  }

  return [...found];
}

function replaceVariables(
  template: string,
  variableMap: Record<SupportedVariable, string | null>,
): string {
  return template.replace(VARIABLE_PATTERN, (match, rawName: string) => {
    const normalizedName = normalizeVariableName(rawName);

    if (!isSupportedVariable(normalizedName)) {
      return match;
    }

    const value = variableMap[normalizedName];
    return value ?? formatMissingPlaceholder(normalizedName);
  });
}

/**
 * Expands a cover letter template with profile and page context values.
 * Missing values are replaced with [VARIABLE_NAME] placeholders.
 */
export function expandCoverLetter(
  template: CoverLetterTemplate,
  profile: UserProfile,
  pageContext: CoverLetterPageContext,
): string {
  const variableMap = buildVariableMap(profile, pageContext);
  return replaceVariables(template.body, variableMap);
}

export interface TemplateValidationResult {
  valid: boolean;
  missingVariables: string[];
  unknownVariables: string[];
}

/**
 * Validates template variables against the supported list and profile data.
 */
export function validateTemplate(
  template: string,
  profile: UserProfile,
): TemplateValidationResult {
  const usedVariables = extractTemplateVariables(template);
  const variableMap = buildVariableMap(profile, { company: '', jobTitle: '' });

  const unknownVariables = usedVariables.filter(
    (variable) => !isSupportedVariable(variable),
  );

  const missingVariables = usedVariables.filter((variable) => {
    if (!isSupportedVariable(variable)) {
      return false;
    }

    return variableMap[variable] === null;
  });

  return {
    valid: unknownVariables.length === 0,
    missingVariables,
    unknownVariables,
  };
}

/**
 * Returns variable-to-value mappings for preview display in the popup.
 */
export function getPreviewValues(profile: UserProfile): Record<string, string> {
  const variableMap = buildVariableMap(profile, {
    company: 'Acme Corp',
    jobTitle: 'Software Engineer',
  });

  const previewValues: Record<string, string> = {};

  for (const variable of SUPPORTED_VARIABLES) {
    const value = variableMap[variable];
    if (value !== null) {
      previewValues[variable] = value;
    }
  }

  return previewValues;
}

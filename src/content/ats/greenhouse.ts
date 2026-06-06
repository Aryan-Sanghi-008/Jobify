import { fillFields } from '@/content/filler';
import { matchFields } from '@/content/matcher';
import { scanPageFields } from '@/content/scanner';
import { ATS_SELECTORS, PORTAL_URLS } from '@/shared/constants';
import {
  flattenProfile,
  getCoverLetters,
  getAutofillData,
} from '@/shared/storage';
import type {
  AppSettings,
  FillResult,
  FormField,
  UserProfile,
} from '@/shared/types';
import {
  extractCompanyFromPage,
  extractJobTitleFromPage,
  interpolateCoverLetter,
  simulateUserInput,
} from '@/shared/utils';

const GREENHOUSE_SELECTORS = {
  form: '#application_form',
  resume: '#resume',
  coverLetter: '#cover_letter',
  linkedIn: '#linkedin_profile',
  customFields: '.custom-fields',
} as const;

function mergeFillResults(left: FillResult, right: FillResult): FillResult {
  return {
    filled: left.filled + right.filled,
    skipped: left.skipped + right.skipped,
    unknown: [...left.unknown, ...right.unknown],
    errors: [...left.errors, ...right.errors],
  };
}

function emptyFillResult(errors: string[] = []): FillResult {
  return {
    filled: 0,
    skipped: 0,
    unknown: [],
    errors,
  };
}

function dedupeFieldsByElement(fields: FormField[]): FormField[] {
  const seen = new Set<HTMLElement>();
  const unique: FormField[] = [];

  for (const field of fields) {
    if (seen.has(field.element)) {
      continue;
    }

    seen.add(field.element);
    unique.push(field);
  }

  return unique;
}

function fillTextInput(
  root: ParentNode,
  selector: string,
  value: string,
): boolean {
  if (!value.trim()) {
    return false;
  }

  const element = root.querySelector(selector);
  if (
    !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
  ) {
    return false;
  }

  simulateUserInput(element, value);
  return element.value === value;
}

async function fillGreenhouseOverrides(
  profile: UserProfile,
  settings: AppSettings,
  formRoot: ParentNode,
): Promise<FillResult> {
  const result = emptyFillResult();

  const resumeInput = formRoot.querySelector(GREENHOUSE_SELECTORS.resume);
  if (resumeInput instanceof HTMLInputElement && resumeInput.type === 'file') {
    result.skipped += 1;
  }

  if (fillTextInput(formRoot, GREENHOUSE_SELECTORS.linkedIn, profile.personal.linkedinUrl)) {
    result.filled += 1;
  }

  const coverLetterField = formRoot.querySelector(GREENHOUSE_SELECTORS.coverLetter);
  if (coverLetterField instanceof HTMLTextAreaElement) {
    const coverLetters = await getCoverLetters();
    const templateId = settings.defaultCoverLetterId;
    const template =
      coverLetters.find((letter) => letter.id === templateId) ?? coverLetters[0];

    if (template) {
      const content = interpolateCoverLetter(template.body, {
        company_name: extractCompanyFromPage(),
        job_title: extractJobTitleFromPage(),
        your_name: profile.personal.fullName,
      });

      simulateUserInput(coverLetterField, content);
      result.filled += 1;
    }
  }

  return result;
}

function findFormRoot(): HTMLElement | null {
  const fromConstants = document.querySelector(ATS_SELECTORS.greenhouse.formContainer);
  if (fromConstants instanceof HTMLElement) {
    return fromConstants;
  }

  const fallback = document.querySelector(GREENHOUSE_SELECTORS.form);
  return fallback instanceof HTMLElement ? fallback : null;
}

export class GreenhouseATS {
  isApplicable(): boolean {
    const href = window.location.href.toLowerCase();
    return PORTAL_URLS.greenhouse.some((pattern) => href.includes(pattern));
  }

  async handleApplication(
    profile: UserProfile,
    settings: AppSettings,
  ): Promise<FillResult> {
    const formRoot = findFormRoot();
    if (!formRoot) {
      return emptyFillResult(['Greenhouse application form not found']);
    }

    const overrideResult = await fillGreenhouseOverrides(profile, settings, formRoot);

    const scannedFields = scanPageFields(formRoot);
    const customFieldsSection = formRoot.querySelector(GREENHOUSE_SELECTORS.customFields);
    const customFields = customFieldsSection
      ? scanPageFields(customFieldsSection)
      : [];

    const fields = dedupeFieldsByElement([...scannedFields, ...customFields]);
    const { learnedFields, communityFields } = await getAutofillData();
    const flatProfile = flattenProfile(profile);
    const matchedFields = matchFields(
      fields,
      profile,
      learnedFields,
      communityFields,
      'greenhouse',
    );
    const genericResult = fillFields(matchedFields, flatProfile, settings);

    return mergeFillResults(overrideResult, genericResult);
  }
}

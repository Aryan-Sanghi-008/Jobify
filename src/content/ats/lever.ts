import { fillFields } from '@/content/filler';
import { matchFields } from '@/content/matcher';
import { scanPageFields } from '@/content/scanner';
import { ATS_SELECTORS, PORTAL_URLS } from '@/shared/constants';
import {
  flattenProfile,
  getCoverLetters,
  getAutofillData,
} from '@/shared/storage';
import type { AppSettings, FillResult, UserProfile } from '@/shared/types';
import {
  extractCompanyFromPage,
  extractJobTitleFromPage,
  interpolateCoverLetter,
  simulateUserInput,
  waitForElement,
} from '@/shared/utils';

const LEVER_SELECTORS = {
  form: 'form.posting-application-form',
  name: 'input[name="name"]',
  email: 'input[name="email"]',
  phone: 'input[name="phone"]',
  org: 'input[name="org"]',
  linkedin: 'input[placeholder*="LinkedIn"]',
  github: 'input[placeholder*="GitHub"]',
  additional: '#additional',
  resume: 'input[type="file"]',
} as const;

const FORM_WAIT_MS = 3000;

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

async function fillLeverKnownFields(
  profile: UserProfile,
  settings: AppSettings,
  formRoot: ParentNode,
): Promise<FillResult> {
  const result = emptyFillResult();
  const { personal, professional } = profile;

  const fieldMappings: Array<{ selector: string; value: string }> = [
    { selector: LEVER_SELECTORS.name, value: personal.fullName },
    { selector: LEVER_SELECTORS.email, value: personal.email },
    { selector: LEVER_SELECTORS.phone, value: personal.phone },
    { selector: LEVER_SELECTORS.org, value: professional.currentCompany },
    { selector: LEVER_SELECTORS.linkedin, value: personal.linkedinUrl },
    { selector: LEVER_SELECTORS.github, value: personal.githubUrl },
  ];

  for (const mapping of fieldMappings) {
    if (fillTextInput(formRoot, mapping.selector, mapping.value)) {
      result.filled += 1;
    }
  }

  const resumeInput = formRoot.querySelector(LEVER_SELECTORS.resume);
  if (resumeInput instanceof HTMLInputElement && resumeInput.type === 'file') {
    result.skipped += 1;
  }

  const additionalField = formRoot.querySelector(LEVER_SELECTORS.additional);
  if (additionalField instanceof HTMLTextAreaElement) {
    const coverLetters = await getCoverLetters();
    const templateId = settings.defaultCoverLetterId;
    const template =
      coverLetters.find((letter) => letter.id === templateId) ?? coverLetters[0];

    if (template) {
      const content = interpolateCoverLetter(template.body, {
        company_name: extractCompanyFromPage(),
        job_title: extractJobTitleFromPage(),
        your_name: personal.fullName,
      });

      simulateUserInput(additionalField, content);
      result.filled += 1;
    }
  }

  return result;
}

async function findFormRoot(): Promise<HTMLElement | null> {
  const existing =
    document.querySelector(ATS_SELECTORS.lever.formContainer) ??
    document.querySelector(LEVER_SELECTORS.form);

  if (existing instanceof HTMLElement) {
    return existing;
  }

  try {
    const waited = await waitForElement(ATS_SELECTORS.lever.formContainer, FORM_WAIT_MS);
    return waited;
  } catch {
    try {
      return await waitForElement(LEVER_SELECTORS.form, FORM_WAIT_MS);
    } catch {
      return null;
    }
  }
}

export class LeverATS {
  isApplicable(): boolean {
    const href = window.location.href.toLowerCase();
    return PORTAL_URLS.lever.some((pattern) => href.includes(pattern));
  }

  async handleApplication(
    profile: UserProfile,
    settings: AppSettings,
  ): Promise<FillResult> {
    const formRoot = await findFormRoot();
    if (!formRoot) {
      return emptyFillResult(['Lever application form not found']);
    }

    const overrideResult = await fillLeverKnownFields(profile, settings, formRoot);

    const { learnedFields, communityFields } = await getAutofillData();
    const flatProfile = flattenProfile(profile);
    const fields = scanPageFields(formRoot);
    const matchedFields = matchFields(
      fields,
      profile,
      learnedFields,
      communityFields,
      'lever',
    );
    const genericResult = fillFields(matchedFields, flatProfile, settings);

    return mergeFillResults(overrideResult, genericResult);
  }
}

import { fillFields } from '@/content/filler';
import { matchFields } from '@/content/matcher';
import { scanPageFields } from '@/content/scanner';
import { PORTAL_URLS } from '@/shared/constants';
import { selectorRegistry } from '@/shared/selectorRegistry';
import {
  flattenProfile,
  getCoverLetters,
  getLearnedFields,
} from '@/shared/storage';
import type { AppSettings, FillResult, UserProfile } from '@/shared/types';
import {
  extractCompanyFromPage,
  extractJobTitleFromPage,
  interpolateCoverLetter,
  isElementVisible,
  normalizeLabel,
  simulateUserInput,
  waitForElement,
} from '@/shared/utils';

const PORTAL = 'wellfound' as const;
const FORM_WAIT_MS = 3000;
const FORM_SETTLE_MS = 400;
const WHY_INTERESTED_MAX_LENGTH = 500;

const WHY_INTERESTED_LABEL_PATTERNS = [
  'why are you interested',
  'why do you want to join',
  'why interested',
  'why this role',
  'why this company',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

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

function getElementText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function getElementLabelText(element: HTMLElement): string {
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    if (label?.textContent) {
      return normalizeLabel(label.textContent);
    }
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return normalizeLabel(ariaLabel);
  }

  const ancestorLabel = element.closest('label');
  if (ancestorLabel?.textContent) {
    return normalizeLabel(ancestorLabel.textContent);
  }

  const previous = element.previousElementSibling;
  if (previous?.textContent) {
    return normalizeLabel(previous.textContent);
  }

  const placeholder = element.getAttribute('placeholder');
  return placeholder ? normalizeLabel(placeholder) : '';
}

function findControlByLabel(root: ParentNode, labelPattern: RegExp): HTMLElement | null {
  const controls = root.querySelectorAll('input, select, textarea');

  for (const control of controls) {
    if (!(control instanceof HTMLElement) || !isElementVisible(control)) {
      continue;
    }

    const labelText = getElementLabelText(control);
    if (labelPattern.test(labelText)) {
      return control;
    }
  }

  return null;
}

function fillInputControl(element: HTMLElement, value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    simulateUserInput(element, value);
    return element.value === value;
  }

  return false;
}

function trimToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength).trimEnd();
}

function buildDefaultWhyInterested(
  jobInfo: { company: string; title: string },
  profile: UserProfile,
): string {
  const company = jobInfo.company || 'this company';
  const topSkill = profile.skills[0] || 'my field';
  const jobTitle = jobInfo.title || 'this role';

  return `I'm excited about ${company}'s mission and believe my experience in ${topSkill} aligns well with the ${jobTitle} role.`;
}

async function buildWhyInterestedContent(
  profile: UserProfile,
  settings: AppSettings,
  jobInfo: { company: string; title: string },
): Promise<string> {
  const coverLetters = await getCoverLetters();
  const templateId = settings.defaultCoverLetterId;
  const template =
    coverLetters.find((letter) => letter.id === templateId) ?? coverLetters[0];

  if (template) {
    const content = interpolateCoverLetter(template.body, {
      company_name: jobInfo.company,
      job_title: jobInfo.title,
      your_name: profile.personal.fullName,
    });

    return trimToLength(content, WHY_INTERESTED_MAX_LENGTH);
  }

  return buildDefaultWhyInterested(jobInfo, profile);
}

function findWhyInterestedField(root: ParentNode): HTMLTextAreaElement | null {
  const fromRegistry = selectorRegistry.trySelectors(PORTAL, 'coverLetterField', root);
  if (fromRegistry instanceof HTMLTextAreaElement && isElementVisible(fromRegistry)) {
    return fromRegistry;
  }

  const textareas = root.querySelectorAll('textarea');
  for (const textarea of textareas) {
    if (!(textarea instanceof HTMLTextAreaElement) || !isElementVisible(textarea)) {
      continue;
    }

    const labelText = getElementLabelText(textarea);
    if (WHY_INTERESTED_LABEL_PATTERNS.some((pattern) => labelText.includes(pattern))) {
      return textarea;
    }
  }

  return null;
}

function getApplyButton(): HTMLElement | null {
  const element = selectorRegistry.trySelectors(PORTAL, 'applyButton');
  return element instanceof HTMLElement && isElementVisible(element) ? element : null;
}

function getFormRoot(): HTMLElement | null {
  const element = selectorRegistry.trySelectors(PORTAL, 'formContainer');
  return element instanceof HTMLElement && isElementVisible(element) ? element : null;
}

async function resolveFormRoot(): Promise<HTMLElement | null> {
  const existing = getFormRoot();
  if (existing) {
    return existing;
  }

  const applyButton = getApplyButton();
  if (!applyButton) {
    return null;
  }

  applyButton.click();

  try {
    const selectors = selectorRegistry.getSelectors(PORTAL).formContainer;
    for (const selector of selectors) {
      try {
        const element = await waitForElement(selector, FORM_WAIT_MS);
        if (isElementVisible(element)) {
          return element;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return getFormRoot();
}

function fillWellfoundSpecificFields(
  profile: UserProfile,
  root: ParentNode,
  whyInterestedContent: string,
): FillResult {
  const result = emptyFillResult();

  const locationControl = findControlByLabel(root, /location/i);
  if (locationControl && profile.personal.city.trim()) {
    if (fillInputControl(locationControl, profile.personal.city)) {
      result.filled += 1;
    } else {
      result.errors.push('Could not fill Location');
    }
  }

  const whyInterestedField = findWhyInterestedField(root);
  if (whyInterestedField) {
    if (whyInterestedField.value.trim()) {
      result.skipped += 1;
    } else if (fillInputControl(whyInterestedField, whyInterestedContent)) {
      result.filled += 1;
    } else {
      result.errors.push('Could not fill Why are you interested?');
    }
  }

  return result;
}

export class WellfoundPortal {
  isApplicable(): boolean {
    const href = window.location.href.toLowerCase();
    return PORTAL_URLS.wellfound.some((pattern) => href.includes(pattern));
  }

  extractJobInfo(): { company: string; title: string } {
    const title =
      getElementText(selectorRegistry.trySelectors(PORTAL, 'jobTitle')) ||
      extractJobTitleFromPage();
    const company =
      getElementText(selectorRegistry.trySelectors(PORTAL, 'companyName')) ||
      extractCompanyFromPage();

    return { title, company };
  }

  async handleApplication(
    profile: UserProfile,
    settings: AppSettings,
  ): Promise<FillResult> {
    const formRoot = await resolveFormRoot();
    if (!formRoot) {
      return emptyFillResult(['Wellfound application form not found']);
    }

    await delay(FORM_SETTLE_MS);

    const jobInfo = this.extractJobInfo();
    const whyInterestedContent = await buildWhyInterestedContent(
      profile,
      settings,
      jobInfo,
    );

    let combinedResult = fillWellfoundSpecificFields(
      profile,
      formRoot,
      whyInterestedContent,
    );

    const [learnedFields] = await Promise.all([getLearnedFields()]);
    const flatProfile = flattenProfile(profile);
    const fields = scanPageFields(formRoot);
    const matchedFields = matchFields(fields, profile, learnedFields);
    const genericResult = fillFields(matchedFields, flatProfile, settings);

    return mergeFillResults(combinedResult, genericResult);
  }
}

import { fillFields } from '@/content/filler';
import { matchFields } from '@/content/matcher';
import { scanPageFields } from '@/content/scanner';
import { PORTAL_URLS } from '@/shared/constants';
import {
  flattenProfile,
  getCoverLetters,
  getLearnedFields,
} from '@/shared/storage';
import type { AppSettings, FillResult, UserProfile } from '@/shared/types';
import {
  formatCTC,
  interpolateCoverLetter,
  isElementVisible,
  normalizeLabel,
  simulateSelectChange,
  simulateUserInput,
  waitForElement,
} from '@/shared/utils';

const NAUKRI_SELECTORS = {
  applyButton: ['button#apply-button', 'a.apply-button'],
  applyForm: [
    'form[class*="apply"]',
    '.apply-modal',
    '[class*="application-form"]',
    'form',
  ],
  jobTitle: 'h1.styles_jd-header-title',
  company: 'a.styles_comp-name',
  location: '.styles_jhc__loc',
  naukriResumeLabel: /use my naukri resume/i,
} as const;

const COVER_NOTE_LABEL_PATTERNS = [
  'cover letter',
  'cover note',
  'message',
  'why are you interested',
  'why do you want to join',
];

const FORM_WAIT_MS = 3000;
const FORM_SETTLE_MS = 400;

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

function queryText(selector: string): string {
  const element = document.querySelector(selector);
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function mapNoticePeriodToNaukri(days: number): string {
  if (days <= 15) {
    return '15 days or less';
  }

  if (days <= 30) {
    return '1 Month';
  }

  if (days <= 60) {
    return '2 Months';
  }

  if (days <= 90) {
    return '3 Months';
  }

  return 'More than 3 Months';
}

function mapExperienceToNaukri(years: number): string {
  if (years <= 1) {
    return '0-1 years';
  }

  if (years >= 10) {
    return '10+ years';
  }

  const lower = Math.floor(years);
  const upper = lower + 1;
  return `${lower}-${upper} years`;
}

function formatCtcValue(lpa: number): string {
  if (lpa <= 0) {
    return '';
  }

  return String(lpa);
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

  const parent = element.parentElement;
  if (parent) {
    const clone = parent.cloneNode(true) as HTMLElement;
    const target = clone.querySelector(`#${CSS.escape(element.id)}`);
    target?.remove();
    const text = clone.textContent?.trim();
    if (text) {
      return normalizeLabel(text);
    }
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

function fillSelectByMappedValue(
  select: HTMLSelectElement,
  mappedLabel: string,
): boolean {
  const normalizedTarget = mappedLabel.trim().toLowerCase();

  for (const option of Array.from(select.options)) {
    const optionText = option.textContent?.trim().toLowerCase() ?? '';
    const optionValue = option.value.trim().toLowerCase();

    if (
      optionText.includes(normalizedTarget) ||
      normalizedTarget.includes(optionText) ||
      optionValue.includes(normalizedTarget)
    ) {
      return simulateSelectChange(select, option.value || option.textContent?.trim() || '');
    }
  }

  return false;
}

function findApplyButton(): HTMLElement | null {
  for (const selector of NAUKRI_SELECTORS.applyButton) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement && isElementVisible(element)) {
      return element;
    }
  }

  const candidates = document.querySelectorAll('button, a, [role="button"]');
  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement) || !isElementVisible(candidate)) {
      continue;
    }

    const text = normalizeLabel(candidate.textContent ?? '');
    if (text === 'apply') {
      return candidate;
    }
  }

  return null;
}

async function waitForApplyForm(): Promise<HTMLElement> {
  let lastError: Error | null = null;

  for (const selector of NAUKRI_SELECTORS.applyForm) {
    try {
      const element = await waitForElement(selector, FORM_WAIT_MS);
      if (isElementVisible(element)) {
        return element;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Apply form not found');
    }
  }

  throw lastError ?? new Error('Apply form not found');
}

function fillNaukriSpecificFields(
  profile: UserProfile,
  root: ParentNode,
): FillResult {
  const result = emptyFillResult();
  const { professional } = profile;

  const currentCtcControl = findControlByLabel(root, /current ctc/i);
  if (currentCtcControl) {
    const value =
      formatCtcValue(professional.currentCTC) ||
      formatCTC(professional.currentCTC * 100_000);

    if (fillInputControl(currentCtcControl, value)) {
      result.filled += 1;
    } else if (value) {
      result.errors.push('Could not fill Current CTC');
    }
  }

  const expectedCtcControl = findControlByLabel(root, /expected ctc/i);
  if (expectedCtcControl) {
    const value =
      formatCtcValue(professional.expectedCTC) ||
      formatCTC(professional.expectedCTC * 100_000);

    if (fillInputControl(expectedCtcControl, value)) {
      result.filled += 1;
    } else if (value) {
      result.errors.push('Could not fill Expected CTC');
    }
  }

  const noticeControl = findControlByLabel(root, /notice period/i);
  if (noticeControl instanceof HTMLSelectElement && professional.noticePeriod > 0) {
    const mapped = mapNoticePeriodToNaukri(professional.noticePeriod);
    if (fillSelectByMappedValue(noticeControl, mapped)) {
      result.filled += 1;
    } else {
      result.errors.push('Could not match Notice period dropdown');
    }
  }

  const experienceControl =
    findControlByLabel(root, /total experience/i) ??
    findControlByLabel(root, /experience/i);

  if (experienceControl instanceof HTMLSelectElement && professional.totalYearsExp > 0) {
    const mapped = mapExperienceToNaukri(professional.totalYearsExp);
    if (fillSelectByMappedValue(experienceControl, mapped)) {
      result.filled += 1;
    } else {
      result.errors.push('Could not match Total experience dropdown');
    }
  }

  return result;
}

function getRadioLabel(radio: HTMLInputElement): string {
  if (radio.id) {
    const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
    if (label?.textContent) {
      return normalizeLabel(label.textContent);
    }
  }

  const parentLabel = radio.closest('label');
  if (parentLabel?.textContent) {
    return normalizeLabel(parentLabel.textContent);
  }

  return normalizeLabel(radio.value);
}

function selectUseNaukriResume(root: ParentNode): FillResult {
  const result = emptyFillResult();
  const radios = root.querySelectorAll('input[type="radio"]');

  for (const radio of radios) {
    if (!(radio instanceof HTMLInputElement)) {
      continue;
    }

    const labelText = getRadioLabel(radio);
    if (!NAUKRI_SELECTORS.naukriResumeLabel.test(labelText)) {
      continue;
    }

    if (radio.checked) {
      result.skipped += 1;
      return result;
    }

    radio.click();
    result.filled += 1;
    return result;
  }

  return result;
}

function findCoverNoteField(root: ParentNode): HTMLTextAreaElement | null {
  const textareas = root.querySelectorAll('textarea');

  for (const textarea of textareas) {
    if (!(textarea instanceof HTMLTextAreaElement) || !isElementVisible(textarea)) {
      continue;
    }

    const labelText = getElementLabelText(textarea);
    const isCoverField = COVER_NOTE_LABEL_PATTERNS.some((pattern) =>
      labelText.includes(pattern),
    );

    if (isCoverField) {
      return textarea;
    }
  }

  return null;
}

async function fillCoverNote(
  profile: UserProfile,
  settings: AppSettings,
  root: ParentNode,
  jobInfo: { company: string; title: string; location: string },
): Promise<FillResult> {
  const field = findCoverNoteField(root);
  if (!field) {
    return emptyFillResult();
  }

  const coverLetters = await getCoverLetters();
  const templateId = settings.defaultCoverLetterId;
  const template =
    coverLetters.find((letter) => letter.id === templateId) ?? coverLetters[0];

  if (!template) {
    return emptyFillResult();
  }

  const content = interpolateCoverLetter(template.body, {
    company_name: jobInfo.company,
    job_title: jobInfo.title,
    your_name: profile.personal.fullName,
  });

  simulateUserInput(field, content);

  return {
    filled: 1,
    skipped: 0,
    unknown: [],
    errors: [],
  };
}

export class NaukriPortal {
  isApplicable(): boolean {
    const href = window.location.href.toLowerCase();
    return PORTAL_URLS.naukri.some((pattern) => href.includes(pattern));
  }

  extractJobInfo(): { company: string; title: string; location: string } {
    return {
      title: queryText(NAUKRI_SELECTORS.jobTitle),
      company: queryText(NAUKRI_SELECTORS.company),
      location: queryText(NAUKRI_SELECTORS.location),
    };
  }

  async handleApply(
    profile: UserProfile,
    settings: AppSettings,
  ): Promise<FillResult> {
    const applyButton = findApplyButton();
    if (!applyButton) {
      return emptyFillResult(['Apply button not found']);
    }

    applyButton.click();

    let formRoot: HTMLElement;
    try {
      formRoot = await waitForApplyForm();
    } catch {
      return emptyFillResult(['Apply form did not appear']);
    }

    await delay(FORM_SETTLE_MS);

    const jobInfo = this.extractJobInfo();
    let combinedResult = emptyFillResult();

    combinedResult = mergeFillResults(
      combinedResult,
      fillNaukriSpecificFields(profile, formRoot),
    );
    combinedResult = mergeFillResults(
      combinedResult,
      selectUseNaukriResume(formRoot),
    );
    combinedResult = mergeFillResults(
      combinedResult,
      await fillCoverNote(profile, settings, formRoot, jobInfo),
    );

    const [learnedFields] = await Promise.all([getLearnedFields()]);
    const flatProfile = flattenProfile(profile);
    const fields = scanPageFields(formRoot);
    const matchedFields = matchFields(fields, profile, learnedFields);
    const genericResult = fillFields(matchedFields, flatProfile, settings);

    return mergeFillResults(combinedResult, genericResult);
  }
}

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
  formatCTC,
  interpolateCoverLetter,
  isElementVisible,
  normalizeLabel,
  simulateSelectChange,
  simulateUserInput,
  waitForElement,
} from '@/shared/utils';

const PORTAL = 'instahyre' as const;
const FORM_WAIT_MS = 3000;
const FORM_SETTLE_MS = 300;
const COVER_MESSAGE_MAX_LENGTH = 500;

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

function formatCtcValue(lpa: number): string {
  if (lpa <= 0) {
    return '';
  }

  return String(lpa);
}

function mapNoticePeriodToInstahyre(days: number): string {
  if (days <= 0) {
    return '';
  }

  if (days <= 15) {
    return '15 days';
  }

  if (days <= 30) {
    return '1 month';
  }

  if (days <= 60) {
    return '2 months';
  }

  if (days <= 90) {
    return '3 months';
  }

  return 'more than 3 months';
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
      return simulateSelectChange(
        select,
        option.value || option.textContent?.trim() || '',
      );
    }
  }

  return false;
}

function fillCtcControl(
  control: HTMLElement,
  lpa: number,
  fieldName: string,
  result: FillResult,
): void {
  const value =
    formatCtcValue(lpa) || formatCTC(lpa * 100_000);

  if (!value) {
    return;
  }

  if (control instanceof HTMLSelectElement) {
    if (fillSelectByMappedValue(control, value)) {
      result.filled += 1;
    } else {
      result.errors.push(`Could not match ${fieldName} dropdown`);
    }
    return;
  }

  if (fillInputControl(control, value)) {
    result.filled += 1;
  } else {
    result.errors.push(`Could not fill ${fieldName}`);
  }
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

  return getFormRoot();
}

function fillInstahyreSpecificFields(
  profile: UserProfile,
  root: ParentNode,
): FillResult {
  const result = emptyFillResult();
  const { professional } = profile;

  const currentCtcControl = findControlByLabel(root, /current ctc/i);
  if (currentCtcControl) {
    fillCtcControl(currentCtcControl, professional.currentCTC, 'Current CTC', result);
  }

  const expectedCtcControl = findControlByLabel(root, /expected ctc/i);
  if (expectedCtcControl) {
    fillCtcControl(
      expectedCtcControl,
      professional.expectedCTC,
      'Expected CTC',
      result,
    );
  }

  const noticeControl = findControlByLabel(root, /notice period/i);
  if (noticeControl && professional.noticePeriod > 0) {
    const mapped = mapNoticePeriodToInstahyre(professional.noticePeriod);

    if (noticeControl instanceof HTMLSelectElement) {
      if (fillSelectByMappedValue(noticeControl, mapped)) {
        result.filled += 1;
      } else {
        result.errors.push('Could not match Notice period dropdown');
      }
    } else if (fillInputControl(noticeControl, String(professional.noticePeriod))) {
      result.filled += 1;
    } else {
      result.errors.push('Could not fill Notice period');
    }
  }

  return result;
}

function findCoverMessageField(root: ParentNode): HTMLTextAreaElement | null {
  const fromRegistry = selectorRegistry.trySelectors(PORTAL, 'coverLetterField', root);
  if (fromRegistry instanceof HTMLTextAreaElement && isElementVisible(fromRegistry)) {
    return fromRegistry;
  }

  const coverControl = findControlByLabel(root, /cover|message/i);
  if (
    coverControl instanceof HTMLTextAreaElement &&
    isElementVisible(coverControl)
  ) {
    return coverControl;
  }

  return null;
}

async function fillCoverMessage(
  profile: UserProfile,
  settings: AppSettings,
  root: ParentNode,
  jobInfo: { company: string; title: string },
): Promise<FillResult> {
  const field = findCoverMessageField(root);
  if (!field) {
    return emptyFillResult();
  }

  if (field.value.trim()) {
    return {
      filled: 0,
      skipped: 1,
      unknown: [],
      errors: [],
    };
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
  }).slice(0, COVER_MESSAGE_MAX_LENGTH);

  simulateUserInput(field, content);

  return {
    filled: 1,
    skipped: 0,
    unknown: [],
    errors: [],
  };
}

export class InstahyrePortal {
  isApplicable(): boolean {
    const href = window.location.href.toLowerCase();
    return PORTAL_URLS.instahyre.some((pattern) => href.includes(pattern));
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
      return emptyFillResult(['Instahyre application form not found']);
    }

    await delay(FORM_SETTLE_MS);

    const jobInfo = this.extractJobInfo();
    let combinedResult = fillInstahyreSpecificFields(profile, formRoot);
    combinedResult = mergeFillResults(
      combinedResult,
      await fillCoverMessage(profile, settings, formRoot, jobInfo),
    );

    const [learnedFields] = await Promise.all([getLearnedFields()]);
    const flatProfile = flattenProfile(profile);
    const fields = scanPageFields(formRoot);
    const matchedFields = matchFields(fields, profile, learnedFields);
    const genericResult = fillFields(matchedFields, flatProfile, settings);

    return mergeFillResults(combinedResult, genericResult);
  }
}

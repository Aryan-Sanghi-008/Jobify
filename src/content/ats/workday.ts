import {
  fillDateInput,
  fillProfileDateInContainer,
  parseProfileDate,
} from '@/content/dateFormat';
import {
  detectUxiIdPattern,
  fillEducationEntryFields,
  fillExperienceEntryFields,
} from '@/content/entryFieldFill';
import {
  fillComboboxSync,
  findMatchingOption,
} from '@/content/controls/combobox';
import { fillFields } from '@/content/filler';
import {
  isRepeatablePagePrepared,
  isRepeatableSectionPrepared,
  prepareRepeatablePage,
  type RepeatablePrepareStrategy,
} from '@/content/prepareRepeatablePage';
import { resolveFieldValue } from '@/content/profileResolver';
import { FormStateMachine } from '@/content/formStateMachine';
import { matchFields } from '@/content/matcher';
import { getEntryContainers, getRepeatableDelays } from '@/content/repeatableSections';
import { scanForNextButton, scanPageFields } from '@/content/scanner';
import { ATS_SELECTORS, PORTAL_URLS } from '@/shared/constants';
import { selectorRegistry } from '@/shared/selectorRegistry';
import { flattenProfile, getAutofillData } from '@/shared/storage';
import type {
  AppSettings,
  CommunityFieldsMap,
  FillResult,
  FlatProfile,
  FormField,
  FormState,
  LearnedField,
  UserProfile,
} from '@/shared/types';
import {
  isElementVisible,
  simulateUserInput,
  waitForElement,
} from '@/shared/utils';

const WORKDAY_DELAY_MS = 200;
const FORM_WAIT_MS = 5000;
const MAX_WIZARD_STEPS = 10;

const WORKDAY_SELECTORS = {
  firstName: '[data-automation-id="legalNameSection_firstName"]',
  lastName: '[data-automation-id="legalNameSection_lastName"]',
  email: '[data-automation-id="email"]',
  phone: '[data-automation-id="phone"]',
  city: '[data-automation-id="addressSection_city"]',
  state: '[data-automation-id="addressSection_stateProvince"]',
  country: '[data-automation-id="addressSection_country"]',
  postal: '[data-automation-id="addressSection_postalCode"]',
  linkedin: '[data-automation-id*="linkedin" i], input[aria-label*="LinkedIn" i]',
  resume: 'input[type="file"][data-automation-id*="resume" i], input[type="file"]',
  experienceCompany:
    '[data-automation-id*="workExperience"][data-automation-id*="company" i], [data-automation-id*="company"]',
  experienceTitle:
    '[data-automation-id*="workExperience"][data-automation-id*="jobTitle" i], [data-automation-id*="jobTitle"]',
  experienceDescription:
    '[data-automation-id*="workExperience"][data-automation-id*="description" i], textarea[data-automation-id*="description" i]',
  educationSchool:
    '[data-automation-id*="education"][data-automation-id*="school" i], [data-automation-id*="school"]',
  educationDegree:
    '[data-automation-id*="education"][data-automation-id*="degree" i], [data-automation-id*="degree"]',
  experienceLocation:
    '[data-automation-id*="workExperience"][data-automation-id*="location" i], [data-automation-id*="location"]',
  skillsSection:
    '[data-automation-id*="skills" i], [data-automation-id*="skillSection" i]',
  dateMonth: '[data-automation-id*="dateSectionMonth" i]',
  dateDay: '[data-automation-id*="dateSectionDay" i]',
  dateYear: '[data-automation-id*="dateSectionYear" i]',
} as const;

const SELF_IDENTIFY_PATTERNS = [
  /self identify/i,
  /voluntary disclosure/i,
  /\beeo\b/i,
  /demographic/i,
  /gender identity/i,
  /\brace\b/i,
  /veteran/i,
  /disability/i,
];

const SECTION_PATTERNS: Array<{ section: WorkdaySection; pattern: RegExp }> = [
  { section: 'self_identify', pattern: SELF_IDENTIFY_PATTERNS[0] },
  { section: 'self_identify', pattern: /voluntary disclosure/i },
  { section: 'self_identify', pattern: /\beeo\b/i },
  { section: 'self_identify', pattern: /demographic/i },
  { section: 'my_information', pattern: /my information/i },
  { section: 'my_experience', pattern: /my experience/i },
  { section: 'my_experience', pattern: /work experience/i },
  { section: 'my_experience', pattern: /education/i },
  {
    section: 'application_questions',
    pattern: /application questions|additional questions/i,
  },
];

const DATE_LABEL_PATTERNS = [
  /\bfrom\b/i,
  /\bto\b/i,
  /start date/i,
  /end date/i,
  /graduation/i,
];

export {
  isMyExperiencePrepared,
  isRepeatablePagePrepared,
  isRepeatableSectionPrepared,
  resetMyExperiencePreparedForTests,
  resetRepeatablePagePreparedForTests,
} from '@/content/prepareRepeatablePage';

const DROPDOWN_TRIGGER_SELECTORS = [
  '[role="combobox"]',
  '[role="listbox"]',
  'button[aria-expanded]',
];

export type WorkdaySection =
  | 'my_information'
  | 'my_experience'
  | 'application_questions'
  | 'self_identify'
  | 'unknown';

export interface DateParts {
  month: string;
  day: string;
  year: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function syncDelay(ms: number): void {
  const deadline = performance.now() + ms;
  while (performance.now() < deadline) {
    // Workday dropdowns need a brief pause before options render.
  }
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

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function findDropdownTrigger(container: ParentNode): HTMLElement | null {
  for (const selector of DROPDOWN_TRIGGER_SELECTORS) {
    const match = container.querySelector(selector);
    if (match instanceof HTMLElement && isElementVisible(match)) {
      return match;
    }
  }

  if (
    container instanceof HTMLElement &&
    isElementVisible(container) &&
    (container.getAttribute('role') === 'combobox' ||
      container.getAttribute('role') === 'listbox')
  ) {
    return container;
  }

  return null;
}

function fillWorkdayDropdownSync(container: ParentNode, value: string): boolean {
  if (container instanceof HTMLElement) {
    return fillComboboxSync(container, value);
  }

  const trigger = findDropdownTrigger(container);
  if (trigger instanceof HTMLElement) {
    return fillComboboxSync(trigger, value);
  }

  return false;
}

export async function fillWorkdayDropdown(
  container: ParentNode,
  value: string,
): Promise<boolean> {
  if (!value.trim()) {
    return false;
  }

  const trigger = findDropdownTrigger(container);
  if (!trigger) {
    return false;
  }

  trigger.click();
  await delay(WORKDAY_DELAY_MS);

  const option = findMatchingOption(value);
  if (!option) {
    return false;
  }

  option.click();
  await delay(WORKDAY_DELAY_MS);
  return true;
}

export function parseDateParts(date: string): DateParts | null {
  const parts = parseProfileDate(date);
  if (!parts) {
    return null;
  }

  const monthNumber = Number.parseInt(parts.month, 10);

  return {
    month: new Date(2000, monthNumber - 1, 1).toLocaleString('en-US', {
      month: 'long',
    }),
    day: parts.day,
    year: parts.year,
  };
}

export async function fillWorkdayDateGroup(
  container: Element,
  date: string,
): Promise<boolean> {
  const parts = parseDateParts(date);
  if (!parts) {
    return false;
  }

  const monthContainer =
    container.querySelector(WORKDAY_SELECTORS.dateMonth) ?? container;
  const dayContainer =
    container.querySelector(WORKDAY_SELECTORS.dateDay) ?? container;
  const yearContainer =
    container.querySelector(WORKDAY_SELECTORS.dateYear) ?? container;

  const monthFilled = await fillWorkdayDropdown(monthContainer, parts.month);
  const dayFilled = await fillWorkdayDropdown(dayContainer, parts.day);
  const yearFilled = await fillWorkdayDropdown(yearContainer, parts.year);

  return monthFilled && dayFilled && yearFilled;
}

function hasDateControls(container: ParentNode): boolean {
  return Boolean(
    container.querySelector(WORKDAY_SELECTORS.dateMonth) ||
      container.querySelector(WORKDAY_SELECTORS.dateDay) ||
      container.querySelector(WORKDAY_SELECTORS.dateYear),
  );
}

function fillWorkdayDateGroupSync(container: ParentNode, date: string): boolean {
  const parts = parseDateParts(date);
  if (!parts || !hasDateControls(container)) {
    return false;
  }

  const monthContainer =
    container.querySelector(WORKDAY_SELECTORS.dateMonth) ?? container;
  const dayContainer =
    container.querySelector(WORKDAY_SELECTORS.dateDay) ?? container;
  const yearContainer =
    container.querySelector(WORKDAY_SELECTORS.dateYear) ?? container;

  const monthFilled = fillWorkdayDropdownSync(monthContainer, parts.month);
  const dayFilled = fillWorkdayDropdownSync(dayContainer, parts.day);
  const yearFilled = fillWorkdayDropdownSync(yearContainer, parts.year);

  return monthFilled && dayFilled && yearFilled;
}

function getInputLabelText(
  input: HTMLInputElement | HTMLTextAreaElement,
  container: ParentNode,
): string {
  const ariaLabel = getTrimmedText(input.getAttribute('aria-label'));
  if (ariaLabel) {
    return ariaLabel;
  }

  const id = input.id;
  if (id) {
    const linked = container.querySelector(`label[for="${CSS.escape(id)}"]`);
    const linkedText = getTrimmedText(linked?.textContent);
    if (linkedText) {
      return linkedText;
    }
  }

  const parentLabel = input.closest('label');
  return getTrimmedText(parentLabel?.textContent);
}

function findInputByLabel(
  container: ParentNode,
  labelPattern: RegExp,
): HTMLInputElement | HTMLTextAreaElement | null {
  const inputs = container.querySelectorAll('input, textarea');

  for (const element of inputs) {
    if (
      !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) ||
      !isElementVisible(element) ||
      element.type === 'checkbox' ||
      element.type === 'radio' ||
      element.type === 'file' ||
      element.type === 'hidden'
    ) {
      continue;
    }

    const labelText = getInputLabelText(element, container);
    if (labelPattern.test(labelText)) {
      return element;
    }
  }

  return null;
}

function fillInputByLabel(
  container: ParentNode,
  labelPattern: RegExp,
  value: string,
): boolean {
  if (!value.trim()) {
    return false;
  }

  const element = findInputByLabel(container, labelPattern);
  if (!element) {
    return false;
  }

  simulateUserInput(element, value);
  return element.value === value;
}

function findLabeledFieldRow(
  container: ParentNode,
  labelPattern: RegExp,
): HTMLElement | null {
  const labelNodes = container.querySelectorAll('label, legend, span, div, p');
  for (const labelNode of labelNodes) {
    const labelText = getTrimmedText(labelNode.textContent);
    if (!labelPattern.test(labelText)) {
      continue;
    }

    const row =
      labelNode.closest(
        'div[data-automation-id], fieldset, section, li, div[role="group"]',
      ) ?? labelNode.parentElement;

    if (row instanceof HTMLElement) {
      return row;
    }
  }

  const element = findInputByLabel(container, labelPattern);
  if (!element) {
    return null;
  }

  let current: HTMLElement | null = element.parentElement;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const hasDateControls = hasDateControlsInRow(current);
    const hasTargetInput = current.contains(element);

    if (hasTargetInput && hasDateControls) {
      return current;
    }

    current = current.parentElement;
  }

  return element.parentElement;
}

function hasDateControlsInRow(element: ParentNode): boolean {
  return Boolean(
    element.querySelector(WORKDAY_SELECTORS.dateMonth) ||
      element.querySelector(WORKDAY_SELECTORS.dateDay) ||
      element.querySelector(WORKDAY_SELECTORS.dateYear),
  );
}

function fillDateByLabelScoped(
  container: ParentNode,
  labelPattern: RegExp,
  profileDate: string,
): boolean {
  if (!profileDate.trim()) {
    return false;
  }

  if (fillProfileDateInContainer(container, labelPattern, profileDate)) {
    return true;
  }

  const element = findInputByLabel(container, labelPattern);
  if (!element) {
    return false;
  }

  if (element instanceof HTMLInputElement && fillDateInput(element, profileDate)) {
    return true;
  }

  const dateRow = findLabeledFieldRow(container, labelPattern);
  if (dateRow && fillWorkdayDateGroupSync(dateRow, profileDate)) {
    return true;
  }

  let ancestor: HTMLElement | null = element.parentElement;
  for (let depth = 0; depth < 4 && ancestor; depth += 1) {
    if (fillWorkdayDateGroupSync(ancestor, profileDate)) {
      return true;
    }
    ancestor = ancestor.parentElement;
  }

  return false;
}

function fillDateByLabel(
  container: ParentNode,
  labelPattern: RegExp,
  profileDate: string,
): boolean {
  return fillDateByLabelScoped(container, labelPattern, profileDate);
}

export function shouldDeferToDedicatedWorkdayFill(field: FormField): boolean {
  if (field.sectionType === 'experience' || field.sectionType === 'education') {
    return true;
  }

  if (field.type === 'multiselect') {
    return true;
  }

  if (/work experience\s*\d+/i.test(field.label)) {
    return true;
  }

  if (/education\s*\d+/i.test(field.label)) {
    return true;
  }

  if (/\b(from|to)\b|start date|end date/i.test(field.label)) {
    return /work experience|education/i.test(field.label);
  }

  if (/\bskills\b/i.test(field.label)) {
    return true;
  }

  return false;
}

function getSectionHeadingText(element: Element): string {
  const headings = element.querySelectorAll(
    'h1, h2, h3, [data-automation-id*="pageTitle" i]',
  );

  for (const heading of headings) {
    const text = getTrimmedText(heading.textContent);
    if (text) {
      return text;
    }
  }

  return '';
}

function matchesSectionPattern(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

export function detectWorkdaySection(root: ParentNode = document): WorkdaySection {
  const text = getSectionHeadingText(
    root instanceof Element ? root : document.body,
  );

  for (const { section, pattern } of SECTION_PATTERNS) {
    if (matchesSectionPattern(text, pattern)) {
      return section;
    }
  }

  if (SELF_IDENTIFY_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'self_identify';
  }

  return 'unknown';
}

function getDirectSectionHeadingText(container: HTMLElement): string {
  const heading = container.querySelector(
    ':scope > h1, :scope > h2, :scope > h3, :scope > [data-automation-id*="pageTitle" i]',
  );

  return getTrimmedText(heading?.textContent);
}

export function isInSelfIdentifySection(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;

  while (current) {
    const headingText = getDirectSectionHeadingText(current);
    if (SELF_IDENTIFY_PATTERNS.some((pattern) => pattern.test(headingText))) {
      return true;
    }

    if (current.matches('h1, h2, h3, [data-automation-id*="pageTitle" i]')) {
      const text = getTrimmedText(current.textContent);
      if (SELF_IDENTIFY_PATTERNS.some((pattern) => pattern.test(text))) {
        return true;
      }
    }

    current = current.parentElement;
  }

  return false;
}

export function filterWorkdayFields(fields: FormField[]): FormField[] {
  return fields.filter((field) => !isInSelfIdentifySection(field.element));
}

function fillTextControl(
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

function fillMyInformation(
  profile: UserProfile,
  formRoot: ParentNode,
): FillResult {
  const result = emptyFillResult();
  const { personal } = profile;

  const mappings: Array<{ selector: string; value: string }> = [
    { selector: WORKDAY_SELECTORS.firstName, value: personal.firstName },
    { selector: WORKDAY_SELECTORS.lastName, value: personal.lastName },
    { selector: WORKDAY_SELECTORS.email, value: personal.email },
    { selector: WORKDAY_SELECTORS.phone, value: personal.phone },
    { selector: WORKDAY_SELECTORS.city, value: personal.city },
    { selector: WORKDAY_SELECTORS.linkedin, value: personal.linkedinUrl },
  ];

  for (const mapping of mappings) {
    if (fillTextControl(formRoot, mapping.selector, mapping.value)) {
      result.filled += 1;
    }
  }

  const stateControl = formRoot.querySelector(WORKDAY_SELECTORS.state);
  if (stateControl) {
    if (fillWorkdayDropdownSync(stateControl, personal.state)) {
      result.filled += 1;
    } else if (fillTextControl(formRoot, WORKDAY_SELECTORS.state, personal.state)) {
      result.filled += 1;
    }
  }

  const countryControl = formRoot.querySelector(WORKDAY_SELECTORS.country);
  if (countryControl) {
    if (fillWorkdayDropdownSync(countryControl, personal.country)) {
      result.filled += 1;
    } else if (
      fillTextControl(formRoot, WORKDAY_SELECTORS.country, personal.country)
    ) {
      result.filled += 1;
    }
  }

  const resumeInput = formRoot.querySelector(WORKDAY_SELECTORS.resume);
  if (resumeInput instanceof HTMLInputElement && resumeInput.type === 'file') {
    result.skipped += 1;
  }

  return result;
}

function fillTextInContainer(
  container: ParentNode,
  selector: string,
  value: string,
): boolean {
  if (!value.trim()) {
    return false;
  }

  const element = container.querySelector(selector);
  if (
    !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
  ) {
    return false;
  }

  simulateUserInput(element, value);
  return element.value === value;
}

function fillDropdownInContainer(
  container: ParentNode,
  selector: string,
  value: string,
): boolean {
  const element = container.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return fillWorkdayDropdownSync(element, value);
}

function fillCurrentWorkCheckbox(container: ParentNode, current: boolean): boolean {
  if (!current) {
    return false;
  }

  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  for (const checkbox of checkboxes) {
    if (!(checkbox instanceof HTMLInputElement)) {
      continue;
    }

    const labelText = getTrimmedText(
      checkbox.closest('label')?.textContent ??
        document.querySelector(`label[for="${CSS.escape(checkbox.id)}"]`)?.textContent,
    );

    if (/currently work|still working/i.test(labelText) && !checkbox.checked) {
      checkbox.click();
      return checkbox.checked;
    }
  }

  return false;
}

function fillExperienceEntry(
  container: ParentNode,
  experience: UserProfile['experience'][number],
  city: string,
): FillResult {
  const result = emptyFillResult();

  if (
    fillTextInContainer(container, WORKDAY_SELECTORS.experienceCompany, experience.company) ||
    fillInputByLabel(container, /^company\b/i, experience.company)
  ) {
    result.filled += 1;
  }

  if (
    fillTextInContainer(container, WORKDAY_SELECTORS.experienceTitle, experience.title) ||
    fillInputByLabel(container, /job title/i, experience.title)
  ) {
    result.filled += 1;
  }

  if (
    fillTextInContainer(container, WORKDAY_SELECTORS.experienceLocation, city) ||
    fillInputByLabel(container, /^location\b/i, city)
  ) {
    result.filled += 1;
  }

  if (
    fillTextInContainer(
      container,
      WORKDAY_SELECTORS.experienceDescription,
      experience.description,
    ) ||
    fillInputByLabel(container, /role description|job description|responsibilities/i, experience.description)
  ) {
    result.filled += 1;
  }

  if (fillCurrentWorkCheckbox(container, experience.current)) {
    result.filled += 1;
  }

  if (fillDateByLabelScoped(container, /\b(from|start date)\b/i, experience.startDate)) {
    result.filled += 1;
  }

  if (
    !experience.current &&
    fillDateByLabelScoped(container, /\b(to|end date)\b/i, experience.endDate)
  ) {
    result.filled += 1;
  }

  return result;
}

function fillEducationEntry(
  container: ParentNode,
  education: UserProfile['education'][number],
): FillResult {
  const result = emptyFillResult();

  if (
    fillDropdownInContainer(container, WORKDAY_SELECTORS.educationSchool, education.institution) ||
    fillTextInContainer(container, WORKDAY_SELECTORS.educationSchool, education.institution) ||
    fillInputByLabel(container, /school|university|college|institution/i, education.institution)
  ) {
    result.filled += 1;
  }

  if (
    fillDropdownInContainer(container, WORKDAY_SELECTORS.educationDegree, education.degree) ||
    fillTextInContainer(container, WORKDAY_SELECTORS.educationDegree, education.degree) ||
    fillInputByLabel(container, /^degree\b|qualification/i, education.degree)
  ) {
    result.filled += 1;
  }

  if (fillInputByLabel(container, /field of study|major|specialization/i, education.field)) {
    result.filled += 1;
  }

  const gpaSelectors = [
    'input[aria-label*="GPA" i]',
    'input[aria-label*="result" i]',
    '[data-automation-id*="gpa" i]',
    '[data-automation-id*="grade" i]',
  ];

  for (const selector of gpaSelectors) {
    if (fillTextInContainer(container, selector, education.percentage)) {
      result.filled += 1;
      break;
    }
  }

  if (education.graduationYear > 0) {
    const graduationDate = `${education.graduationYear}-06-01`;
    if (
      fillDateByLabelScoped(container, /graduation|year of passing|passing year/i, graduationDate) ||
      fillInputByLabel(container, /graduation year|year of passing|passing year/i, String(education.graduationYear))
    ) {
      result.filled += 1;
    }
  }

  return result;
}

export async function fillWorkdayExperienceEntryPrepare(
  container: ParentNode,
  experience: UserProfile['experience'][number],
  city: string,
  index: number = 0,
): Promise<number> {
  if (detectUxiIdPattern(container)) {
    const filled = fillExperienceEntryFields(container, experience, city, index);
    await delay(getRepeatableDelays('workday').entrySettle);
    return filled;
  }

  const result = fillExperienceEntry(container, experience, city);
  await delay(getRepeatableDelays('workday').entrySettle);
  return result.filled;
}

export async function fillWorkdayEducationEntryPrepare(
  container: ParentNode,
  education: UserProfile['education'][number],
  index: number = 0,
): Promise<number> {
  if (detectUxiIdPattern(container)) {
    const filled = fillEducationEntryFields(container, education, index);
    await delay(getRepeatableDelays('workday').entrySettle);
    return filled;
  }

  const result = fillEducationEntry(container, education);
  await delay(getRepeatableDelays('workday').entrySettle);
  return result.filled;
}

export function getWorkdayPrepareStrategy(
  profile: UserProfile,
): RepeatablePrepareStrategy {
  return {
    shouldRun: (formRoot) => detectWorkdaySection(formRoot) === 'my_experience',
    fillExperienceEntry: async (container, entry, _profile, index) =>
      fillWorkdayExperienceEntryPrepare(
        container,
        entry,
        profile.personal.city,
        index,
      ),
    fillEducationEntry: async (container, entry, _profile, index) =>
      fillWorkdayEducationEntryPrepare(container, entry, index),
  };
}

function fillMyExperience(profile: UserProfile, formRoot: ParentNode): FillResult {
  let result = emptyFillResult();

  if (!isRepeatableSectionPrepared('experience')) {
    const experienceContainers = getEntryContainers('experience');

    profile.experience.forEach((experience, index) => {
      const container = experienceContainers[index];
      if (!container) {
        return;
      }

      result = mergeFillResults(
        result,
        fillExperienceEntry(container, experience, profile.personal.city),
      );
    });
  }

  if (!isRepeatableSectionPrepared('education')) {
    const educationContainers = getEntryContainers('education');
    profile.education.forEach((education, index) => {
      const container = educationContainers[index];
      if (!container) {
        return;
      }

      result = mergeFillResults(result, fillEducationEntry(container, education));
    });
  }

  return result;
}

export async function prepareWorkdayPage(
  profile: UserProfile,
  formRoot: ParentNode = document,
): Promise<void> {
  await prepareRepeatablePage(profile, 'workday', formRoot, getWorkdayPrepareStrategy(profile));
}

export function runWorkdayMatchAndFill(
  fields: FormField[],
  profile: UserProfile,
  settings: AppSettings,
  learnedFields: Record<string, LearnedField>,
  communityFields: CommunityFieldsMap,
  flatProfile: FlatProfile,
  formRoot: ParentNode = document,
): FillResult {
  const section = detectWorkdaySection(formRoot);
  return fillWorkdayStep(
    section,
    fields,
    profile,
    settings,
    formRoot,
    learnedFields,
    communityFields,
    flatProfile,
  );
}

function findDateContainer(element: HTMLElement): Element | null {
  let current: HTMLElement | null = element;

  while (current) {
    if (
      current.querySelector(WORKDAY_SELECTORS.dateMonth) ||
      current.querySelector(WORKDAY_SELECTORS.dateDay) ||
      current.querySelector(WORKDAY_SELECTORS.dateYear)
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function fillWorkdayMatchedFields(
  fields: FormField[],
  flatProfile: FlatProfile,
  settings: AppSettings,
  profile?: UserProfile,
): FillResult {
  const textFields: FormField[] = [];
  const result = emptyFillResult();

  for (const field of fields) {
    if (field.unknown || field.filled) {
      continue;
    }

    if (
      field.profileKey === 'skills' ||
      field.sectionType === 'skills' ||
      /\bskills\b/i.test(field.label)
    ) {
      result.skipped += 1;
      continue;
    }

    if (field.type === 'file') {
      result.skipped += 1;
      continue;
    }

    let value =
      field.learnedLiteral ??
      (field.profileKey
        ? String(flatProfile[field.profileKey as keyof FlatProfile] ?? '')
        : '');

    if (
      profile &&
      field.sectionIndex !== undefined &&
      field.sectionType &&
      !field.learnedLiteral
    ) {
      const resolved = resolveFieldValue(profile, field);
      if (resolved.trim()) {
        value = resolved;
      }
    }

    if (!value.trim()) {
      result.skipped += 1;
      continue;
    }

    if (
      field.type === 'select' &&
      !(field.element instanceof HTMLSelectElement)
    ) {
      if (fillWorkdayDropdownSync(field.element, value)) {
        field.filled = true;
        result.filled += 1;
        continue;
      }

      result.errors.push(`No matching Workday option for ${field.label}`);
      continue;
    }

    if (DATE_LABEL_PATTERNS.some((pattern) => pattern.test(field.label))) {
      const dateContainer =
        findDateContainer(field.element) ??
        field.element.closest('section, fieldset, [data-automation-id], form, div, li') ??
        field.element.parentElement;

      const labelPattern = /\b(from|start)\b/i.test(field.label)
        ? /\b(from|start date|start)\b/i
        : /\b(to|end date|end)\b/i.test(field.label)
          ? /\b(to|end date|end)\b/i
          : /graduation|year of passing|passing year/i;

      if (
        dateContainer &&
        fillProfileDateInContainer(dateContainer, labelPattern, value)
      ) {
        field.filled = true;
        result.filled += 1;
        continue;
      }

      if (dateContainer && fillWorkdayDateGroupSync(dateContainer, value)) {
        field.filled = true;
        result.filled += 1;
        continue;
      }

      if (field.element instanceof HTMLInputElement && fillDateInput(field.element, value)) {
        field.filled = true;
        result.filled += 1;
        continue;
      }
    }

    if (
      field.type === 'date' &&
      field.element instanceof HTMLInputElement &&
      fillDateInput(field.element, value)
    ) {
      field.filled = true;
      result.filled += 1;
      continue;
    }

    textFields.push(field);
  }

  const genericResult = fillFields(textFields, flatProfile, settings, profile);
  return mergeFillResults(result, genericResult);
}

function fillApplicationQuestions(
  fields: FormField[],
  profile: UserProfile,
  settings: AppSettings,
  learnedFields: Record<string, LearnedField>,
  communityFields: CommunityFieldsMap,
  flatProfile: FlatProfile,
): FillResult {
  const matchedFields = matchFields(
    fields,
    profile,
    learnedFields,
    communityFields,
    'workday',
  );
  return fillWorkdayMatchedFields(matchedFields, flatProfile, settings, profile);
}

function fillWorkdayStep(
  section: WorkdaySection,
  fields: FormField[],
  profile: UserProfile,
  settings: AppSettings,
  formRoot: ParentNode,
  learnedFields: Record<string, LearnedField>,
  communityFields: CommunityFieldsMap,
  flatProfile: FlatProfile,
): FillResult {
  if (section === 'self_identify') {
    return emptyFillResult();
  }

  switch (section) {
    case 'my_information':
      return fillMyInformation(profile, formRoot);
    case 'my_experience':
      return mergeFillResults(
        fillMyExperience(profile, formRoot),
        fillApplicationQuestions(
          fields.filter((field) => !shouldDeferToDedicatedWorkdayFill(field)),
          profile,
          settings,
          learnedFields,
          communityFields,
          flatProfile,
        ),
      );
    case 'application_questions':
      return fillApplicationQuestions(
        fields,
        profile,
        settings,
        learnedFields,
        communityFields,
        flatProfile,
      );
    default:
      return fillApplicationQuestions(
        fields,
        profile,
        settings,
        learnedFields,
        communityFields,
        flatProfile,
      );
  }
}

async function findFormRoot(): Promise<HTMLElement | null> {
  const selectors = [
    ATS_SELECTORS.workday.formContainer,
    ...selectorRegistry.getSelectors('workday').formContainer,
  ];

  for (const selector of selectors) {
    const existing = document.querySelector(selector);
    if (existing instanceof HTMLElement) {
      return existing;
    }
  }

  for (const selector of selectors) {
    try {
      const waited = await waitForElement(selector, FORM_WAIT_MS);
      return waited;
    } catch {
      continue;
    }
  }

  return null;
}

function queryVisibleButton(selector: string, root: ParentNode): HTMLButtonElement | null {
  const buttons = root.querySelectorAll(selector);

  for (const button of buttons) {
    if (button instanceof HTMLButtonElement && isElementVisible(button)) {
      return button;
    }
  }

  return null;
}

function findWorkdayNextButton(root: ParentNode): HTMLButtonElement | null {
  const selectors = [
    ATS_SELECTORS.workday.nextButton,
    ...selectorRegistry.getSelectors('workday').nextButton,
  ];

  for (const selector of selectors) {
    const button = queryVisibleButton(selector, root);
    if (button) {
      return button;
    }
  }

  return scanForNextButton(root);
}

function isTerminalState(state: FormState): boolean {
  return state === 'WAITING_FOR_USER' || state === 'COMPLETE' || state === 'ERROR';
}

export class WorkdayATS {
  isApplicable(): boolean {
    const href = window.location.href.toLowerCase();
    return PORTAL_URLS.workday.some((pattern) => href.includes(pattern));
  }

  async handleApplication(
    profile: UserProfile,
    settings: AppSettings,
  ): Promise<FillResult> {
    const formRoot = await findFormRoot();
    if (!formRoot) {
      return emptyFillResult(['Workday application form not found']);
    }

    const { learnedFields, communityFields } = await getAutofillData();
    const flatProfile = flattenProfile(profile);
    let aggregate = emptyFillResult();

    return new Promise((resolve) => {
      const machine = new FormStateMachine({
        preparePage: async (activeProfile) => {
          await prepareRepeatablePage(
            activeProfile,
            'workday',
            formRoot,
            getWorkdayPrepareStrategy(activeProfile),
          );
        },
        scanFields: () => filterWorkdayFields(scanPageFields(formRoot)),
        matchAndFill: (fields) => {
          const section = detectWorkdaySection(formRoot);
          const stepResult = fillWorkdayStep(
            section,
            fields,
            profile,
            settings,
            formRoot,
            learnedFields,
            communityFields,
            flatProfile,
          );
          aggregate = mergeFillResults(aggregate, stepResult);
          return stepResult;
        },
        findNextButton: () => findWorkdayNextButton(formRoot),
        clickNext: (button) => {
          button.click();
          syncDelay(WORKDAY_DELAY_MS);
        },
        notifyComplete: () => {},
        broadcastState: () => {},
      });

      machine.onStateChange((state) => {
        if (isTerminalState(state)) {
          resolve(aggregate);
        }
      });

      machine.start(profile, settings);

      window.setTimeout(() => {
        if (!isTerminalState(machine.state)) {
          resolve(aggregate);
        }
      }, MAX_WIZARD_STEPS * 2_000);
    });
  }
}

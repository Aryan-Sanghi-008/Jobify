import { fillFields } from '@/content/filler';
import { FormStateMachine } from '@/content/formStateMachine';
import { matchFields } from '@/content/matcher';
import { scanForNextButton, scanPageFields } from '@/content/scanner';
import { ATS_SELECTORS, PORTAL_URLS } from '@/shared/constants';
import { selectorRegistry } from '@/shared/selectorRegistry';
import { flattenProfile, getLearnedFields } from '@/shared/storage';
import type {
  AppSettings,
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

const DATE_LABEL_PATTERNS = [/start date/i, /end date/i, /graduation/i, /date/i];

const DROPDOWN_TRIGGER_SELECTORS = [
  '[role="combobox"]',
  '[role="listbox"]',
  'button[aria-expanded]',
];

const DROPDOWN_OPTION_SELECTORS = [
  '[role="option"]',
  '[data-automation-id*="option" i]',
  'li[role="option"]',
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

function matchesText(value: string, target: string): boolean {
  const left = value.trim().toLowerCase();
  const right = target.trim().toLowerCase();

  if (!left || !right) {
    return false;
  }

  return left.includes(right) || right.includes(left);
}

function findDropdownTrigger(container: Element): HTMLElement | null {
  for (const selector of DROPDOWN_TRIGGER_SELECTORS) {
    const match = container.querySelector(selector);
    if (match instanceof HTMLElement && isElementVisible(match)) {
      return match;
    }
  }

  if (container instanceof HTMLElement && isElementVisible(container)) {
    const role = container.getAttribute('role')?.toLowerCase();
    if (role === 'combobox' || role === 'listbox') {
      return container;
    }
  }

  return null;
}

function findMatchingOption(value: string, root: ParentNode = document): HTMLElement | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const selector of DROPDOWN_OPTION_SELECTORS) {
    const options = root.querySelectorAll(selector);

    for (const option of options) {
      if (!(option instanceof HTMLElement) || !isElementVisible(option)) {
        continue;
      }

      const text = getTrimmedText(option.textContent);
      if (matchesText(text, normalized)) {
        return option;
      }
    }
  }

  return null;
}

function fillWorkdayDropdownSync(container: Element, value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  const trigger = findDropdownTrigger(container);
  if (!trigger) {
    return false;
  }

  trigger.click();
  syncDelay(WORKDAY_DELAY_MS);

  const option = findMatchingOption(value);
  if (!option) {
    return false;
  }

  option.click();
  syncDelay(WORKDAY_DELAY_MS);
  return true;
}

export async function fillWorkdayDropdown(
  container: Element,
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
  const trimmed = date.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthNumber = Number.parseInt(isoMatch[2], 10);
    const dayNumber = isoMatch[3] ? Number.parseInt(isoMatch[3], 10) : 1;

    if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
      return null;
    }

    return {
      month: new Date(2000, monthNumber - 1, 1).toLocaleString('en-US', {
        month: 'long',
      }),
      day: String(dayNumber),
      year,
    };
  }

  return null;
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

function fillWorkdayDateGroupSync(container: Element, date: string): boolean {
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

  const monthFilled = fillWorkdayDropdownSync(monthContainer, parts.month);
  const dayFilled = fillWorkdayDropdownSync(dayContainer, parts.day);
  const yearFilled = fillWorkdayDropdownSync(yearContainer, parts.year);

  return monthFilled && dayFilled && yearFilled;
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

function fillMyExperience(profile: UserProfile, formRoot: ParentNode): FillResult {
  const result = emptyFillResult();
  const experience = profile.experience[0];
  const education = profile.education[0];

  if (experience) {
    if (
      fillTextControl(formRoot, WORKDAY_SELECTORS.experienceCompany, experience.company)
    ) {
      result.filled += 1;
    }

    if (fillTextControl(formRoot, WORKDAY_SELECTORS.experienceTitle, experience.title)) {
      result.filled += 1;
    }

    if (
      fillTextControl(
        formRoot,
        WORKDAY_SELECTORS.experienceDescription,
        experience.description,
      )
    ) {
      result.filled += 1;
    }

    const dateContainers = formRoot.querySelectorAll(
      '[data-automation-id*="workExperience" i]',
    );
    const dateContainer = dateContainers[0];

    if (dateContainer) {
      if (fillWorkdayDateGroupSync(dateContainer, experience.startDate)) {
        result.filled += 1;
      }

      if (!experience.current && fillWorkdayDateGroupSync(dateContainer, experience.endDate)) {
        result.filled += 1;
      }
    }
  }

  if (education) {
    if (
      fillTextControl(formRoot, WORKDAY_SELECTORS.educationSchool, education.institution)
    ) {
      result.filled += 1;
    }

    if (fillTextControl(formRoot, WORKDAY_SELECTORS.educationDegree, education.degree)) {
      result.filled += 1;
    }

    const educationContainers = formRoot.querySelectorAll(
      '[data-automation-id*="education" i]',
    );
    const educationContainer = educationContainers[0];

    if (educationContainer) {
      const graduationDate = `${education.graduationYear}-06-01`;
      if (fillWorkdayDateGroupSync(educationContainer, graduationDate)) {
        result.filled += 1;
      }
    }
  }

  return result;
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
): FillResult {
  const textFields: FormField[] = [];
  const result = emptyFillResult();

  for (const field of fields) {
    if (field.unknown || field.filled) {
      continue;
    }

    if (field.type === 'file') {
      result.skipped += 1;
      continue;
    }

    const value =
      field.learnedLiteral ??
      (field.profileKey
        ? String(flatProfile[field.profileKey as keyof FlatProfile] ?? '')
        : '');

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
      const dateContainer = findDateContainer(field.element);
      if (dateContainer && fillWorkdayDateGroupSync(dateContainer, value)) {
        field.filled = true;
        result.filled += 1;
        continue;
      }
    }

    textFields.push(field);
  }

  const genericResult = fillFields(textFields, flatProfile, settings);
  return mergeFillResults(result, genericResult);
}

function fillApplicationQuestions(
  fields: FormField[],
  profile: UserProfile,
  settings: AppSettings,
  learnedFields: Record<string, LearnedField>,
  flatProfile: FlatProfile,
): FillResult {
  const matchedFields = matchFields(fields, profile, learnedFields);
  return fillWorkdayMatchedFields(matchedFields, flatProfile, settings);
}

function fillWorkdayStep(
  section: WorkdaySection,
  fields: FormField[],
  profile: UserProfile,
  settings: AppSettings,
  formRoot: ParentNode,
  learnedFields: Record<string, LearnedField>,
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
        fillApplicationQuestions(fields, profile, settings, learnedFields, flatProfile),
      );
    case 'application_questions':
      return fillApplicationQuestions(
        fields,
        profile,
        settings,
        learnedFields,
        flatProfile,
      );
    default:
      return fillApplicationQuestions(
        fields,
        profile,
        settings,
        learnedFields,
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

    const [learnedFields] = await Promise.all([getLearnedFields()]);
    const flatProfile = flattenProfile(profile);
    let aggregate = emptyFillResult();

    return new Promise((resolve) => {
      const machine = new FormStateMachine({
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

import { simulateUserInput } from '@/shared/utils';

export type ProfileDateParts = {
  year: string;
  month: string;
  day: string;
};

export type DateInputFormat =
  | 'mm/yyyy'
  | 'mm/dd/yyyy'
  | 'yyyy-mm'
  | 'month-name';

export type DateFieldPart = 'month' | 'year' | 'day';

export type DateFieldGroup = {
  month?: HTMLInputElement;
  year?: HTMLInputElement;
  day?: HTMLInputElement;
  single?: HTMLInputElement;
  wrapper?: HTMLElement;
};

export interface DateFillScope {
  prefix?: string;
  instanceId?: string;
}

const PROFILE_DATE_PATTERN =
  /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/;
const DISPLAY_MM_YYYY_PATTERN = /^(\d{1,2})\/(\d{4})$/;
const DISPLAY_MM_DD_YYYY_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

const DATE_ID_SUFFIX_PATTERNS: Record<'start' | 'end', RegExp[]> = {
  start: [
    /--startDate-dateSectionMonth-input$/i,
    /--startDate-dateSectionYear-input$/i,
    /--startDate-dateSectionDay-input$/i,
    /--fromDate-dateSectionMonth-input$/i,
    /--fromDate-dateSectionYear-input$/i,
  ],
  end: [
    /--endDate-dateSectionMonth-input$/i,
    /--endDate-dateSectionYear-input$/i,
    /--endDate-dateSectionDay-input$/i,
    /--toDate-dateSectionMonth-input$/i,
    /--toDate-dateSectionYear-input$/i,
  ],
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

/**
 * Parses profile dates stored as YYYY-MM or YYYY-MM-DD.
 */
export function parseProfileDate(value: string): ProfileDateParts | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let year = '';
  let monthNumber = 0;
  let dayNumber = 1;

  const profileMatch = trimmed.match(PROFILE_DATE_PATTERN);
  if (profileMatch) {
    year = profileMatch[1];
    monthNumber = Number.parseInt(profileMatch[2], 10);
    dayNumber = profileMatch[3] ? Number.parseInt(profileMatch[3], 10) : 1;
  } else {
    const mmDdYyyy = trimmed.match(DISPLAY_MM_DD_YYYY_PATTERN);
    if (mmDdYyyy) {
      monthNumber = Number.parseInt(mmDdYyyy[1], 10);
      dayNumber = Number.parseInt(mmDdYyyy[2], 10);
      year = mmDdYyyy[3];
    } else {
      const mmYyyy = trimmed.match(DISPLAY_MM_YYYY_PATTERN);
      if (!mmYyyy) {
        return null;
      }
      monthNumber = Number.parseInt(mmYyyy[1], 10);
      year = mmYyyy[2];
    }
  }

  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    return null;
  }

  return {
    year,
    month: pad2(monthNumber),
    day: pad2(dayNumber),
  };
}

function monthName(month: string): string {
  const monthNumber = Number.parseInt(month, 10);
  if (monthNumber < 1 || monthNumber > 12) {
    return month;
  }

  return new Date(2000, monthNumber - 1, 1).toLocaleString('en-US', {
    month: 'long',
  });
}

/**
 * Infers the display format expected by a date input from hints on the element.
 */
export function detectDateInputFormat(element: HTMLInputElement): DateInputFormat {
  const hints = [
    element.placeholder,
    element.getAttribute('aria-label'),
    element.getAttribute('pattern'),
    element.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/mm\s*\/\s*dd\s*\/\s*yyyy|dd\s*\/\s*mm\s*\/\s*yyyy/.test(hints)) {
    return 'mm/dd/yyyy';
  }

  if (/mm\s*\/\s*yyyy|m\s*\/\s*y/.test(hints)) {
    return 'mm/yyyy';
  }

  if (/yyyy\s*-\s*mm|yyyy-mm/.test(hints)) {
    return 'yyyy-mm';
  }

  const sample = element.value.trim();
  if (/^\d{1,2}\/\d{4}$/.test(sample)) {
    return 'mm/yyyy';
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sample)) {
    return 'mm/dd/yyyy';
  }

  if (/^\d{4}-\d{1,2}/.test(sample)) {
    return 'yyyy-mm';
  }

  return 'mm/yyyy';
}

/**
 * Formats a profile date string for a target input format.
 */
export function formatProfileDateForInput(
  value: string,
  format: DateInputFormat,
): string {
  const parts = parseProfileDate(value);
  if (!parts) {
    return value.trim();
  }

  switch (format) {
    case 'mm/yyyy':
      return `${parts.month}/${parts.year}`;
    case 'mm/dd/yyyy':
      return `${parts.month}/${parts.day}/${parts.year}`;
    case 'yyyy-mm':
      return `${parts.year}-${parts.month}`;
    case 'month-name':
      return monthName(parts.month);
    default:
      return `${parts.month}/${parts.year}`;
  }
}

function valuesRoughlyMatch(expected: string, actual: string): boolean {
  const normalize = (text: string) => text.replace(/\s+/g, '').toLowerCase();
  const left = normalize(expected);
  const right = normalize(actual);

  if (!left || !right) {
    return false;
  }

  return right.includes(left) || left.includes(right);
}

/**
 * Fills a single date text input using the element's expected format.
 */
export function fillDateInput(element: HTMLInputElement, profileDate: string): boolean {
  const trimmed = profileDate.trim();
  if (!trimmed) {
    return false;
  }

  const formatted = formatProfileDateForInput(
    trimmed,
    detectDateInputFormat(element),
  );

  simulateUserInput(element, formatted);
  return valuesRoughlyMatch(formatted, element.value);
}

export function isSpinbuttonDateInput(element: HTMLElement): boolean {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  if (element.getAttribute('role') !== 'spinbutton') {
    return false;
  }

  const ariaLabel = getTrimmedText(element.getAttribute('aria-label')).toLowerCase();
  return ariaLabel === 'month' || ariaLabel === 'year' || ariaLabel === 'day';
}

export function getSpinbuttonDatePart(element: HTMLInputElement): DateFieldPart | null {
  const ariaLabel = getTrimmedText(element.getAttribute('aria-label')).toLowerCase();
  if (ariaLabel === 'month' || ariaLabel === 'year' || ariaLabel === 'day') {
    return ariaLabel;
  }

  const id = element.id.toLowerCase();
  if (/month/i.test(id)) {
    return 'month';
  }
  if (/year/i.test(id)) {
    return 'year';
  }
  if (/day/i.test(id)) {
    return 'day';
  }

  return null;
}

export function verifySpinbuttonFilled(
  element: HTMLInputElement,
  expected: string,
): boolean {
  if (valuesRoughlyMatch(expected, element.value)) {
    return true;
  }

  const ariaValue = element.getAttribute('aria-valuenow');
  if (ariaValue && valuesRoughlyMatch(expected, ariaValue)) {
    return true;
  }

  const displayId = element.id.replace(/-input$/i, '-display');
  const display = document.getElementById(displayId);
  if (display && valuesRoughlyMatch(expected, display.textContent ?? '')) {
    return true;
  }

  return false;
}

function dispatchSpinbuttonInputEvents(element: HTMLInputElement, value: string): void {
  element.dispatchEvent(new Event('focus', { bubbles: true }));
  element.dispatchEvent(
    new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }),
  );

  for (const char of value) {
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key: char, bubbles: true }),
    );
    element.dispatchEvent(
      new KeyboardEvent('keyup', { key: char, bubbles: true }),
    );
  }

  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Fills a spinbutton date part with numeric values derived from YYYY-MM profile dates.
 */
export function fillSpinbuttonDatePart(
  element: HTMLInputElement,
  profileDate: string,
  part?: DateFieldPart,
): boolean {
  const parts = parseProfileDate(profileDate);
  if (!parts) {
    return false;
  }

  const resolvedPart = part ?? getSpinbuttonDatePart(element);
  if (!resolvedPart) {
    return false;
  }

  let value = '';
  switch (resolvedPart) {
    case 'month':
      value = String(Number.parseInt(parts.month, 10));
      break;
    case 'year':
      value = parts.year;
      break;
    case 'day':
      value = String(Number.parseInt(parts.day, 10));
      break;
    default:
      return false;
  }

  const applyValue = (): void => {
    element.focus();
    simulateUserInput(element, '');
    simulateUserInput(element, value);
    dispatchSpinbuttonInputEvents(element, value);
  };

  applyValue();
  if (verifySpinbuttonFilled(element, value)) {
    return true;
  }

  element.click();
  applyValue();
  return verifySpinbuttonFilled(element, value);
}

function findLabelRow(
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

  return null;
}

function collectSpinbuttonsInScope(scope: ParentNode): DateFieldGroup {
  const group: DateFieldGroup = {};
  const spinbuttons = scope.querySelectorAll('input[role="spinbutton"]');

  for (const element of spinbuttons) {
    if (!(element instanceof HTMLInputElement)) {
      continue;
    }

    const part = getSpinbuttonDatePart(element);
    if (part === 'month') {
      group.month = element;
    } else if (part === 'year') {
      group.year = element;
    } else if (part === 'day') {
      group.day = element;
    }
  }

  return group;
}

function inferDateKindFromLabel(labelPattern: RegExp): 'start' | 'end' | null {
  const source = labelPattern.source.toLowerCase();
  if (/\b(from|start)\b/.test(source)) {
    return 'start';
  }
  if (/\b(to|end)\b/.test(source)) {
    return 'end';
  }
  return null;
}

function findDateGroupByInstanceScope(
  labelPattern: RegExp,
  scope: DateFillScope,
): DateFieldGroup | null {
  const kind = inferDateKindFromLabel(labelPattern);
  if (!kind || !scope.prefix || !scope.instanceId) {
    return null;
  }

  const dateKey = kind === 'start' ? 'startDate' : 'endDate';
  const baseId = `${scope.prefix}-${scope.instanceId}--${dateKey}`;

  const month = document.getElementById(`${baseId}-dateSectionMonth-input`);
  const year = document.getElementById(`${baseId}-dateSectionYear-input`);
  const day = document.getElementById(`${baseId}-dateSectionDay-input`);

  if (
    !(month instanceof HTMLInputElement) &&
    !(year instanceof HTMLInputElement)
  ) {
    return null;
  }

  const group: DateFieldGroup = {};
  if (month instanceof HTMLInputElement) {
    group.month = month;
  }
  if (year instanceof HTMLInputElement) {
    group.year = year;
  }
  if (day instanceof HTMLInputElement) {
    group.day = day;
  }

  group.wrapper =
    month?.closest('[role="group"], fieldset, div') ??
    year?.parentElement ??
    undefined;

  return group;
}

function findDateGroupByIdSuffix(
  container: ParentNode,
  labelPattern: RegExp,
  scope?: DateFillScope,
): DateFieldGroup | null {
  if (scope?.instanceId && scope.prefix) {
    const byInstance = findDateGroupByInstanceScope(labelPattern, scope);
    if (byInstance) {
      return byInstance;
    }

    return null;
  }

  const kind = inferDateKindFromLabel(labelPattern);
  if (!kind) {
    return null;
  }

  const monthSelector =
    kind === 'start'
      ? '[id*="--startDate-dateSectionMonth-input"], [id*="--fromDate-dateSectionMonth-input"]'
      : '[id*="--endDate-dateSectionMonth-input"], [id*="--toDate-dateSectionMonth-input"]';
  const yearSelector =
    kind === 'start'
      ? '[id*="--startDate-dateSectionYear-input"], [id*="--fromDate-dateSectionYear-input"]'
      : '[id*="--endDate-dateSectionYear-input"], [id*="--toDate-dateSectionYear-input"]';
  const daySelector =
    kind === 'start'
      ? '[id*="--startDate-dateSectionDay-input"], [id*="--fromDate-dateSectionDay-input"]'
      : '[id*="--endDate-dateSectionDay-input"], [id*="--toDate-dateSectionDay-input"]';

  const month = container.querySelector(monthSelector);
  const year = container.querySelector(yearSelector);
  const day = container.querySelector(daySelector);

  if (
    !(month instanceof HTMLInputElement) &&
    !(year instanceof HTMLInputElement)
  ) {
    return null;
  }

  const group: DateFieldGroup = {};
  if (month instanceof HTMLInputElement) {
    group.month = month;
  }
  if (year instanceof HTMLInputElement) {
    group.year = year;
  }
  if (day instanceof HTMLInputElement) {
    group.day = day;
  }

  const anchor = group.month ?? group.year ?? group.day;
  group.wrapper =
    anchor?.closest('[id*="--startDate"], [id*="--endDate"], [id*="--fromDate"], [id*="--toDate"], [role="group"]') ??
    anchor?.parentElement ??
    undefined;

  return group;
}

/**
 * Locates date controls within a container for a label pattern.
 */
export function findDateFieldGroup(
  container: ParentNode,
  labelPattern: RegExp,
  scope?: DateFillScope,
): DateFieldGroup | null {
  const byIdSuffix = findDateGroupByIdSuffix(container, labelPattern, scope);
  if (byIdSuffix && (byIdSuffix.month || byIdSuffix.year || byIdSuffix.day)) {
    return byIdSuffix;
  }

  if (scope?.instanceId && scope?.prefix) {
    return null;
  }

  const labelRow = findLabelRow(container, labelPattern);
  if (labelRow) {
    const spinGroup = collectSpinbuttonsInScope(labelRow);
    if (spinGroup.month || spinGroup.year || spinGroup.day) {
      spinGroup.wrapper = labelRow;
      return spinGroup;
    }

    const inputs = labelRow.querySelectorAll('input, textarea');
    for (const element of inputs) {
      if (
        element instanceof HTMLInputElement &&
        element.type !== 'checkbox' &&
        element.type !== 'radio' &&
        element.type !== 'hidden' &&
        element.type !== 'file' &&
        element.getAttribute('role') !== 'spinbutton'
      ) {
        return { single: element, wrapper: labelRow };
      }
    }
  }

  const scopedSpinbuttons = collectSpinbuttonsInScope(container);
  if (scopedSpinbuttons.month || scopedSpinbuttons.year || scopedSpinbuttons.day) {
    scopedSpinbuttons.wrapper =
      scopedSpinbuttons.month?.closest('[role="group"], fieldset, div') ??
      scopedSpinbuttons.year?.parentElement ??
      undefined;
    return scopedSpinbuttons;
  }

  return null;
}

function fillDateFieldGroup(group: DateFieldGroup, profileDate: string): boolean {
  let filled = false;

  if (group.month) {
    filled = fillSpinbuttonDatePart(group.month, profileDate, 'month') || filled;
  }
  if (group.year) {
    filled = fillSpinbuttonDatePart(group.year, profileDate, 'year') || filled;
  }
  if (group.day) {
    filled = fillSpinbuttonDatePart(group.day, profileDate, 'day') || filled;
  }
  if (group.single) {
    filled = fillDateInput(group.single, profileDate) || filled;
  }

  return filled;
}

/**
 * Fills date fields inside a container from a YYYY-MM profile value.
 * Supports spinbutton groups, id-suffix Workday UXI fields, and single text inputs.
 */
export function fillProfileDateInContainer(
  container: ParentNode,
  labelPattern: RegExp,
  profileDate: string,
  scope?: DateFillScope,
): boolean {
  const trimmed = profileDate.trim();
  if (!trimmed) {
    return false;
  }

  const group = findDateFieldGroup(container, labelPattern, scope);
  if (!group) {
    return false;
  }

  return fillDateFieldGroup(group, trimmed);
}

export function isDateLabelPattern(label: string): boolean {
  return /\b(from|to)\b|start date|end date|graduation|date started|date ended/i.test(
    label,
  );
}

export { DATE_ID_SUFFIX_PATTERNS };

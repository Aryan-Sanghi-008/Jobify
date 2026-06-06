import { getProfileValue } from '@/content/matcher';
import {
  FILLED_FIELD_HIGHLIGHT_STYLE,
  UNKNOWN_FIELD_HIGHLIGHT_STYLE,
} from '@/shared/constants';
import type {
  AppSettings,
  FillResult,
  FlatProfile,
  FormField,
  ProfileMatchKey,
} from '@/shared/types';
import { normalizeLabel, simulateSelectChange, simulateUserInput } from '@/shared/utils';

const BOOLEAN_PROFILE_KEYS = new Set<ProfileMatchKey>([
  'willingToRelocate',
  'current',
]);

const LEGAL_CHECKBOX_PATTERN = /agree|terms|consent|privacy|conditions/i;
const FILE_SKIP_REASON = 'File upload requires manual selection';

function logFiller(action: string, label: string): void {
  console.log('[JobAutofill Filler]', action, label);
}

function applyHighlight(element: HTMLElement, style: string): void {
  element.style.cssText += style;
}

function getFieldValue(
  field: FormField,
  flatProfile: FlatProfile,
): string {
  if (field.learnedLiteral) {
    return field.learnedLiteral;
  }

  if (!field.profileKey || field.profileKey === 'resumeFile') {
    return '';
  }

  return getProfileValue(field.profileKey, flatProfile);
}

function getMaxLength(element: HTMLElement): number | undefined {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const maxlength = element.maxLength;
    if (maxlength > 0) {
      return maxlength;
    }
  }

  const describedBy = element.getAttribute('aria-describedby');
  if (!describedBy) {
    return undefined;
  }

  for (const id of describedBy.split(/\s+/)) {
    const counter = document.getElementById(id);
    const text = counter?.textContent ?? '';
    const match = text.match(/(\d+)\s*(?:char|character)/i);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }

  return undefined;
}

function truncateValue(value: string, maxLength: number | undefined): string {
  if (!maxLength || value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function fillTextInput(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  simulateUserInput(element, value);
  return element.value === value;
}

function fillTextarea(element: HTMLTextAreaElement, value: string): boolean {
  const truncated = truncateValue(value, getMaxLength(element));
  return fillTextInput(element, truncated);
}

function findClosestSelectOption(
  element: HTMLSelectElement,
  value: string,
): string | null {
  if (simulateSelectChange(element, value)) {
    return value;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  for (const option of Array.from(element.options)) {
    const optionText = option.textContent?.trim().toLowerCase() ?? '';
    const optionValue = option.value.trim().toLowerCase();

    if (
      optionText.includes(normalizedValue) ||
      normalizedValue.includes(optionText) ||
      optionValue.includes(normalizedValue) ||
      normalizedValue.includes(optionValue)
    ) {
      return option.value || option.textContent?.trim() || null;
    }
  }

  return null;
}

function fillSelect(element: HTMLSelectElement, value: string): boolean {
  const closestOption = findClosestSelectOption(element, value);
  if (!closestOption) {
    return false;
  }

  return simulateSelectChange(element, closestOption);
}

function normalizeChoiceValue(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (['yes', 'true', '1'].includes(normalized)) {
    return 'yes';
  }

  if (['no', 'false', '0'].includes(normalized)) {
    return 'no';
  }

  return normalized;
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

function fillRadioGroup(element: HTMLInputElement, value: string): boolean {
  const groupName = element.name;
  if (!groupName) {
    return false;
  }

  const radios = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${CSS.escape(groupName)}"]`,
    ),
  );

  const normalizedValue = normalizeChoiceValue(value);

  for (const radio of radios) {
    const optionLabel = getRadioLabel(radio);
    const optionValue = normalizeChoiceValue(radio.value);

    if (
      optionLabel === normalizedValue ||
      optionValue === normalizedValue ||
      optionLabel.includes(normalizedValue) ||
      normalizedValue.includes(optionLabel)
    ) {
      radio.click();
      return radio.checked;
    }
  }

  return false;
}

function fillCheckbox(
  element: HTMLInputElement,
  field: FormField,
  value: string,
): 'filled' | 'skipped' | 'error' {
  const normalizedLabel = normalizeLabel(field.label);

  if (LEGAL_CHECKBOX_PATTERN.test(normalizedLabel)) {
    return 'skipped';
  }

  if (!field.profileKey || !BOOLEAN_PROFILE_KEYS.has(field.profileKey)) {
    return 'skipped';
  }

  const shouldCheck = normalizeChoiceValue(value) === 'yes';

  if (shouldCheck && !element.checked) {
    element.click();
  }

  return shouldCheck && element.checked ? 'filled' : 'skipped';
}

function handleUnknownFields(
  fields: FormField[],
  settings: AppSettings,
  result: FillResult,
): void {
  let firstUnknown: HTMLElement | undefined;

  for (const field of fields) {
    if (!field.unknown) {
      continue;
    }

    result.unknown.push(field);

    if (settings.highlightUnknownFields) {
      applyHighlight(field.element, UNKNOWN_FIELD_HIGHLIGHT_STYLE);
    }

    if (!firstUnknown) {
      firstUnknown = field.element;
    }
  }

  firstUnknown?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function fillElementWithValue(field: FormField, value: string): boolean {
  const element = field.element;

  switch (field.type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'date':
      if (element instanceof HTMLInputElement) {
        return fillTextInput(element, value);
      }
      break;
    case 'textarea':
      if (element instanceof HTMLTextAreaElement) {
        return fillTextarea(element, value);
      }
      break;
    case 'select':
      if (element instanceof HTMLSelectElement) {
        return fillSelect(element, value);
      }
      break;
    case 'radio':
      if (element instanceof HTMLInputElement) {
        return fillRadioGroup(element, value);
      }
      break;
    case 'checkbox':
      if (element instanceof HTMLInputElement) {
        const checkboxResult = fillCheckbox(element, field, value);
        return checkboxResult === 'filled';
      }
      break;
    default:
      break;
  }

  return false;
}

/**
 * Fills a single form field with an explicit value (used for manual unknown-field fills).
 */
export function fillFieldWithValue(field: FormField, value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  return fillElementWithValue(field, value);
}

function fillMatchedField(
  field: FormField,
  flatProfile: FlatProfile,
  result: FillResult,
): void {
  if (field.unknown || (!field.profileKey && !field.learnedLiteral)) {
    return;
  }

  if (field.type === 'file' || field.profileKey === 'resumeFile') {
    result.skipped += 1;
    logFiller(FILE_SKIP_REASON, field.label);
    return;
  }

  const value = getFieldValue(field, flatProfile);
  if (!value.trim()) {
    result.skipped += 1;
    logFiller('skipped empty value', field.label);
    return;
  }

  const element = field.element;
  let success = false;

  if (field.type === 'checkbox' && element instanceof HTMLInputElement) {
    const checkboxResult = fillCheckbox(element, field, value);
    if (checkboxResult === 'filled') {
      success = true;
    } else if (checkboxResult === 'skipped') {
      result.skipped += 1;
      logFiller('skipped checkbox', field.label);
      return;
    }
  } else {
    success = fillElementWithValue(field, value);
  }

  if (success) {
    field.filled = true;
    result.filled += 1;
    applyHighlight(element, FILLED_FIELD_HIGHLIGHT_STYLE);
    logFiller('filled', field.label);
    return;
  }

  result.errors.push(`No matching option for ${field.label}`);
  logFiller('failed', field.label);
}

/**
 * Fills matched form fields on the page using the flattened profile.
 */
export function fillFields(
  fields: FormField[],
  flatProfile: FlatProfile,
  settings: AppSettings,
): FillResult {
  const result: FillResult = {
    filled: 0,
    skipped: 0,
    unknown: [],
    errors: [],
  };

  try {
    handleUnknownFields(fields, settings, result);

    for (const field of fields) {
      try {
        fillMatchedField(field, flatProfile, result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown fill error';
        result.errors.push(`${field.label}: ${message}`);
        logFiller(`error: ${message}`, field.label);
      }
    }
  } catch {
    return {
      filled: 0,
      skipped: 0,
      unknown: [],
      errors: ['Fill operation failed'],
    };
  }

  return result;
}

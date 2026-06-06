import { normalizeLabel } from '@/shared/utils';

function escapeCssIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
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

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function getNativeRadioLabel(radio: HTMLInputElement): string {
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

function choiceMatchesOption(
  normalizedValue: string,
  optionLabel: string,
  optionValue: string,
): boolean {
  return (
    optionLabel === normalizedValue ||
    optionValue === normalizedValue ||
    optionLabel.includes(normalizedValue) ||
    normalizedValue.includes(optionLabel)
  );
}

/**
 * Fills a native HTML radio group by name.
 */
export function fillNativeRadioGroup(
  element: HTMLInputElement,
  value: string,
): boolean {
  const groupName = element.name;
  if (!groupName) {
    return false;
  }

  const radios = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${escapeCssIdent(groupName)}"]`,
    ),
  );

  const normalizedValue = normalizeChoiceValue(value);

  for (const radio of radios) {
    const optionLabel = getNativeRadioLabel(radio);
    const optionValue = normalizeChoiceValue(radio.value);

    if (choiceMatchesOption(normalizedValue, optionLabel, optionValue)) {
      radio.click();
      return radio.checked;
    }
  }

  return false;
}

function getAriaRadioLabel(radio: HTMLElement): string {
  const ariaLabel = getTrimmedText(radio.getAttribute('aria-label'));
  if (ariaLabel) {
    return normalizeLabel(ariaLabel);
  }

  const labelledBy = radio.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelText = labelledBy
      .split(/\s+/)
      .map((id) => getTrimmedText(document.getElementById(id)?.textContent))
      .filter(Boolean)
      .join(' ');

    if (labelText) {
      return normalizeLabel(labelText);
    }
  }

  return normalizeLabel(radio.textContent ?? '');
}

function findAriaRadioGroupRoot(element: HTMLElement): HTMLElement {
  const group = element.closest('[role="radiogroup"]');
  if (group instanceof HTMLElement) {
    return group;
  }

  return element.parentElement ?? element;
}

/**
 * Fills an ARIA radio group (`[role="radiogroup"]` + `[role="radio"]`).
 */
export function fillAriaRadioGroup(
  element: HTMLElement,
  value: string,
): boolean {
  const normalizedValue = normalizeChoiceValue(value);
  const groupRoot = findAriaRadioGroupRoot(element);
  const radios = groupRoot.querySelectorAll('[role="radio"]');

  for (const radio of radios) {
    if (!(radio instanceof HTMLElement)) {
      continue;
    }

    const optionLabel = getAriaRadioLabel(radio);
    const optionValue = normalizeChoiceValue(
      radio.getAttribute('data-value') ?? radio.getAttribute('value') ?? '',
    );

    if (choiceMatchesOption(normalizedValue, optionLabel, optionValue)) {
      radio.click();
      return (
        radio.getAttribute('aria-checked') === 'true' ||
        radio.classList.contains('selected') ||
        radio.getAttribute('data-checked') === 'true'
      );
    }
  }

  return false;
}

/**
 * Fills either a native or ARIA radio control.
 */
export function fillRadioControl(element: HTMLElement, value: string): boolean {
  if (element instanceof HTMLInputElement && element.type === 'radio') {
    return fillNativeRadioGroup(element, value);
  }

  if (
    element.getAttribute('role') === 'radio' ||
    element.closest('[role="radiogroup"]')
  ) {
    return fillAriaRadioGroup(element, value);
  }

  return false;
}

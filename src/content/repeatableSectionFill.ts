import { fillDateInput, fillProfileDateInContainer } from '@/content/dateFormat';
import type { UserProfile } from '@/shared/types';
import { isElementVisible, simulateUserInput } from '@/shared/utils';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
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

function fillInputByLabel(
  container: ParentNode,
  labelPattern: RegExp,
  value: string,
): HTMLInputElement | HTMLTextAreaElement | null {
  if (!value.trim()) {
    return null;
  }

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
    if (!labelPattern.test(labelText)) {
      continue;
    }

    simulateUserInput(element, value);
    if (element.value === value) {
      return element;
    }

    if (element instanceof HTMLInputElement && fillDateInput(element, value)) {
      return element;
    }
  }

  return null;
}

function blurLastElement(
  element: HTMLInputElement | HTMLTextAreaElement | null,
): void {
  if (!element) {
    return;
  }

  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

function fillGenericCurrentWorkCheckbox(container: ParentNode, current: boolean): void {
  if (!current) {
    return;
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

    if (/currently work|still working|current role|i currently/i.test(labelText) && !checkbox.checked) {
      checkbox.click();
      return;
    }
  }
}

/**
 * Portal-agnostic experience entry fill used to unlock gated Add buttons.
 */
export function fillGenericExperienceEntry(
  container: ParentNode,
  experience: UserProfile['experience'][number],
  city: string,
): void {
  let lastElement: HTMLInputElement | HTMLTextAreaElement | null = null;

  lastElement =
    fillInputByLabel(container, /job title|position|role/i, experience.title) ??
    lastElement;
  lastElement =
    fillInputByLabel(container, /company|employer|organization/i, experience.company) ??
    lastElement;
  lastElement =
    fillInputByLabel(container, /location|city/i, city) ?? lastElement;
  lastElement =
    fillInputByLabel(
      container,
      /role description|job description|responsibilities|description/i,
      experience.description,
    ) ?? lastElement;
  if (
    !fillProfileDateInContainer(
      container,
      /\b(from|start date|start)\b/i,
      experience.startDate,
    )
  ) {
    lastElement =
      fillInputByLabel(container, /\b(from|start date)\b/i, experience.startDate) ??
      lastElement;
  }

  fillGenericCurrentWorkCheckbox(container, experience.current);

  if (
    !experience.current &&
    !fillProfileDateInContainer(
      container,
      /\b(to|end date|end)\b/i,
      experience.endDate,
    )
  ) {
    lastElement =
      fillInputByLabel(container, /\b(to|end date)\b/i, experience.endDate) ??
      lastElement;
  }

  blurLastElement(lastElement);
}

/**
 * Portal-agnostic education entry fill used to unlock gated Add buttons.
 */
export function fillGenericEducationEntry(
  container: ParentNode,
  education: UserProfile['education'][number],
): void {
  let lastElement: HTMLInputElement | HTMLTextAreaElement | null = null;

  lastElement =
    fillInputByLabel(
      container,
      /school|university|college|institution/i,
      education.institution,
    ) ?? lastElement;
  lastElement =
    fillInputByLabel(container, /degree|qualification/i, education.degree) ?? lastElement;
  lastElement =
    fillInputByLabel(container, /field of study|major|specialization/i, education.field) ??
    lastElement;

  if (education.graduationYear > 0) {
    const graduationDate = `${education.graduationYear}-06-01`;
    if (
      !fillProfileDateInContainer(
        container,
        /graduation|year of passing|passing year/i,
        graduationDate,
      )
    ) {
      lastElement =
        fillInputByLabel(
          container,
          /graduation|year of passing|passing year/i,
          String(education.graduationYear),
        ) ?? lastElement;
    }
  }

  blurLastElement(lastElement);
}

export async function fillGenericExperienceEntryAsync(
  container: ParentNode,
  experience: UserProfile['experience'][number],
  city: string,
  settleMs: number = 200,
): Promise<void> {
  fillGenericExperienceEntry(container, experience, city);
  await delay(settleMs);
}

export async function fillGenericEducationEntryAsync(
  container: ParentNode,
  education: UserProfile['education'][number],
  settleMs: number = 200,
): Promise<void> {
  fillGenericEducationEntry(container, education);
  await delay(settleMs);
}

import { fillComboboxSync } from '@/content/controls/combobox';
import { fillProfileDateInContainer } from '@/content/dateFormat';
import {
  getEntryContainers,
  getInstanceIdForEntry,
} from '@/content/repeatableSections';
import type { FormSectionType, UserProfile } from '@/shared/types';
import { isElementVisible, simulateUserInput } from '@/shared/utils';

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function escapeCssIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function queryWithinScope(
  container: ParentNode,
  instanceId: string | null,
  prefix: string,
  suffix: string,
): HTMLElement | null {
  if (instanceId) {
    const direct = document.getElementById(`${prefix}-${instanceId}--${suffix}`);
    if (direct instanceof HTMLElement && container.contains(direct)) {
      return direct;
    }
    const escaped = escapeCssIdent(instanceId);
    const scoped = container.querySelector(
      `[id^="${prefix}-${escaped}--${suffix}"], [id*="${suffix}"]`,
    );
    if (scoped instanceof HTMLElement) {
      return scoped;
    }
  }

  const bySuffix = container.querySelector(
    `[id*="--${suffix}"], [name="${suffix}"], [name="${suffix.replace(/Name$/, '')}"]`,
  );
  if (bySuffix instanceof HTMLElement) {
    return bySuffix;
  }

  return null;
}

function fillTextControl(element: HTMLElement | null, value: string): boolean {
  if (!value.trim() || !element) {
    return false;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' ||
        element.type === 'radio' ||
        element.type === 'file' ||
        element.type === 'hidden')
    ) {
      return false;
    }

    simulateUserInput(element, value);
    return element.value === value;
  }

  if (
    element instanceof HTMLButtonElement ||
    element.getAttribute('role') === 'combobox' ||
    element.getAttribute('aria-haspopup') === 'listbox'
  ) {
    return fillComboboxSync(element, value);
  }

  return false;
}

function fillInputByLabel(
  container: ParentNode,
  labelPattern: RegExp,
  value: string,
): boolean {
  if (!value.trim()) {
    return false;
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

    const ariaLabel = getTrimmedText(element.getAttribute('aria-label'));
    const placeholder = getTrimmedText(element.placeholder);
    const name = getTrimmedText(element.name);
    const labelText = ariaLabel || placeholder || name;

    if (!labelPattern.test(labelText)) {
      const linked = element.id
        ? container.querySelector(`label[for="${escapeCssIdent(element.id)}"]`)
        : null;
      const linkedText = getTrimmedText(linked?.textContent);
      if (!labelPattern.test(linkedText)) {
        continue;
      }
    }

    return fillTextControl(element, value);
  }

  return false;
}

function fillCheckboxByLabel(container: ParentNode, labelPattern: RegExp): boolean {
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  for (const checkbox of checkboxes) {
    if (!(checkbox instanceof HTMLInputElement)) {
      continue;
    }

    const labelText = getTrimmedText(
      checkbox.closest('label')?.textContent ??
        document.querySelector(`label[for="${escapeCssIdent(checkbox.id)}"]`)?.textContent,
    );

    if (!labelPattern.test(labelText)) {
      continue;
    }

    if (!checkbox.checked) {
      checkbox.click();
    }
    return checkbox.checked;
  }

  return false;
}

function resolveExperiencePrefix(
  container: ParentNode,
  instanceId: string | null,
): string {
  if (instanceId) {
    if (document.getElementById(`workExperience-${instanceId}--jobTitle`)) {
      return 'workExperience';
    }
    if (document.getElementById(`employment-${instanceId}--jobTitle`)) {
      return 'employment';
    }
  }

  if (container.querySelector('[id*="workExperience"]')) {
    return 'workExperience';
  }

  return 'employment';
}

function resolveEducationPrefix(
  container: ParentNode,
  instanceId: string | null,
): string {
  if (instanceId) {
    if (document.getElementById(`education-${instanceId}--schoolName`)) {
      return 'education';
    }
    if (document.getElementById(`school-${instanceId}--schoolName`)) {
      return 'school';
    }
  }

  if (container.querySelector('[id*="education"]')) {
    return 'education';
  }

  return 'school';
}

function resolveEntryIndex(
  type: Exclude<FormSectionType, 'skills'>,
  container: ParentNode,
  index?: number,
): number {
  if (index !== undefined && index >= 0) {
    return index;
  }

  if (!(container instanceof HTMLElement)) {
    return 0;
  }

  const containers = getEntryContainers(type);
  const directIndex = containers.indexOf(container);
  if (directIndex >= 0) {
    return directIndex;
  }

  const nestedIndex = containers.findIndex(
    (entry) => entry.contains(container) || container.contains(entry),
  );
  return nestedIndex >= 0 ? nestedIndex : 0;
}

export function detectUxiIdPattern(root: ParentNode = document): boolean {
  return Boolean(
    root.querySelector(
      'input[id*="workExperience-"][id*="--"], input[id*="education-"][id*="--"]',
    ),
  );
}

/**
 * Portal-agnostic experience entry fill with instance-id, suffix, and label fallbacks.
 */
export function fillExperienceEntryFields(
  container: ParentNode,
  experience: UserProfile['experience'][number],
  city: string,
  index?: number,
): number {
  const resolvedIndex = resolveEntryIndex('experience', container, index);
  const instanceId = getInstanceIdForEntry('experience', resolvedIndex);
  const prefix = resolveExperiencePrefix(container, instanceId);
  let filled = 0;

  const mappings: Array<{
    suffix: string;
    value: string;
    label: RegExp;
    isDate?: boolean;
    dateLabel?: RegExp;
  }> = [
    {
      suffix: 'jobTitle',
      value: experience.title,
      label: /job title|position|role/i,
    },
    {
      suffix: 'companyName',
      value: experience.company,
      label: /company|employer|organization/i,
    },
    {
      suffix: 'location',
      value: city,
      label: /location|city/i,
    },
    {
      suffix: 'roleDescription',
      value: experience.description,
      label: /role description|job description|responsibilities|description/i,
    },
  ];

  for (const mapping of mappings) {
    const element = queryWithinScope(
      container,
      instanceId,
      prefix,
      mapping.suffix,
    );
    if (fillTextControl(element, mapping.value)) {
      filled += 1;
      continue;
    }
    if (fillInputByLabel(container, mapping.label, mapping.value)) {
      filled += 1;
    }
  }

  if (experience.current) {
    const checkbox = queryWithinScope(
      container,
      instanceId,
      prefix,
      'currentlyWorkHere',
    );
    if (checkbox instanceof HTMLInputElement) {
      if (!checkbox.checked) {
        checkbox.click();
      }
      if (checkbox.checked) {
        filled += 1;
      }
    } else if (
      fillCheckboxByLabel(container, /currently work|still working|current role/i)
    ) {
      filled += 1;
    }
  }

  const dateScope =
    instanceId && prefix ? { prefix, instanceId } : undefined;

  if (
    fillProfileDateInContainer(
      container,
      /\b(from|start date|start)\b/i,
      experience.startDate,
      dateScope,
    )
  ) {
    filled += 1;
  }

  if (
    !experience.current &&
    fillProfileDateInContainer(
      container,
      /\b(to|end date|end)\b/i,
      experience.endDate,
      dateScope,
    )
  ) {
    filled += 1;
  }

  return filled;
}

/**
 * Portal-agnostic education entry fill with instance-id, suffix, and label fallbacks.
 */
export function fillEducationEntryFields(
  container: ParentNode,
  education: UserProfile['education'][number],
  index?: number,
): number {
  const resolvedIndex = resolveEntryIndex('education', container, index);
  const instanceId = getInstanceIdForEntry('education', resolvedIndex);
  const prefix = resolveEducationPrefix(container, instanceId);
  let filled = 0;

  const school = queryWithinScope(container, instanceId, prefix, 'schoolName');
  if (
    fillTextControl(school, education.institution) ||
    fillInputByLabel(container, /school|university|college|institution/i, education.institution)
  ) {
    filled += 1;
  }

  const degree = queryWithinScope(container, instanceId, prefix, 'degree');
  if (
    fillTextControl(degree, education.degree) ||
    fillInputByLabel(container, /degree|qualification/i, education.degree)
  ) {
    filled += 1;
  }

  const field = queryWithinScope(container, instanceId, prefix, 'fieldOfStudy');
  if (
    fillTextControl(field, education.field) ||
    fillInputByLabel(container, /field of study|major|specialization/i, education.field)
  ) {
    filled += 1;
  }

  const grade = queryWithinScope(container, instanceId, prefix, 'gradeAverage');
  if (
    fillTextControl(grade, education.percentage) ||
    fillInputByLabel(container, /gpa|grade|result|percentage/i, education.percentage)
  ) {
    filled += 1;
  }

  const dateScope =
    instanceId && prefix ? { prefix, instanceId } : undefined;

  if (education.graduationYear > 0) {
    const graduationDate = `${education.graduationYear}-06-01`;
    if (
      fillProfileDateInContainer(
        container,
        /graduation|year of passing|passing year/i,
        graduationDate,
        dateScope,
      ) ||
      fillInputByLabel(
        container,
        /graduation year|year of passing|passing year/i,
        String(education.graduationYear),
      )
    ) {
      filled += 1;
    }
  }

  return filled;
}

export function getEntryFieldPrefix(
  type: Exclude<FormSectionType, 'skills'>,
  index: number,
  container: ParentNode,
): { instanceId: string | null; prefix: string } {
  const instanceId = getInstanceIdForEntry(type, index);
  const prefix =
    type === 'experience'
      ? resolveExperiencePrefix(container, instanceId)
      : resolveEducationPrefix(container, instanceId);

  return { instanceId, prefix };
}

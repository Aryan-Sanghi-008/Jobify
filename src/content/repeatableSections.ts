import type { FormSectionType, UserProfile } from '@/shared/types';
import { isElementVisible, waitForElement } from '@/shared/utils';

const MAX_REPEATABLE_ENTRIES = 10;
const ADD_CLICK_DELAY_MS = 300;
const DOM_CHANGE_TIMEOUT_MS = 3000;

const SECTION_HEADING_PATTERNS: Record<
  Exclude<FormSectionType, 'skills'>,
  RegExp[]
> = {
  experience: [/work experience\s*(\d+)/i, /experience\s*(\d+)/i],
  education: [/education\s*(\d+)/i],
};

const SECTION_ROOT_PATTERNS: Record<
  Exclude<FormSectionType, 'skills'>,
  string[]
> = {
  experience: [
    '[data-automation-id*="workExperience" i]',
    '[data-automation-id*="experienceSection" i]',
    'section:has(h2, h3, h4, legend)',
  ],
  education: [
    '[data-automation-id*="education" i]',
    '[data-automation-id*="educationSection" i]',
    'section:has(h2, h3, h4, legend)',
  ],
};

const ADD_BUTTON_PATTERNS = [
  /^add$/i,
  /^add another$/i,
  /add work experience/i,
  /add education/i,
  /add another work experience/i,
  /add another education/i,
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function normalizeButtonText(text: string): string {
  return text.trim().toLowerCase();
}

function isAddButton(element: HTMLElement): boolean {
  const text = getTrimmedText(
    element.textContent || element.getAttribute('aria-label'),
  );

  if (!text) {
    return false;
  }

  const normalized = normalizeButtonText(text);
  return ADD_BUTTON_PATTERNS.some((pattern) => pattern.test(normalized));
}

function findSectionHeading(
  type: Exclude<FormSectionType, 'skills'>,
  index: number,
): RegExp {
  const oneBased = index + 1;
  if (type === 'experience') {
    return new RegExp(`work experience\\s*${oneBased}`, 'i');
  }

  return new RegExp(`education\\s*${oneBased}`, 'i');
}

function queryContainersByHeading(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLElement[] {
  const headings = Array.from(
    document.querySelectorAll('h1, h2, h3, h4, legend, [role="heading"], label, span, div'),
  );

  const containers: HTMLElement[] = [];

  for (const heading of headings) {
    if (!(heading instanceof HTMLElement) || !isElementVisible(heading)) {
      continue;
    }

    const text = getTrimmedText(heading.textContent);
    const matchesSection = SECTION_HEADING_PATTERNS[type].some((pattern) =>
      pattern.test(text),
    );

    if (!matchesSection) {
      continue;
    }

    const container =
      heading.closest('section, fieldset, [data-automation-id], form') ??
      heading.parentElement;

    if (container instanceof HTMLElement && !containers.includes(container)) {
      containers.push(container);
    }
  }

  return containers;
}

function queryContainersByAutomationId(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLElement[] {
  const containers: HTMLElement[] = [];
  const indexedContainers = new Map<number, HTMLElement>();

  for (const selector of SECTION_ROOT_PATTERNS[type]) {
    try {
      const matches = document.querySelectorAll(selector);
      for (const match of matches) {
        if (
          match instanceof HTMLElement &&
          isElementVisible(match) &&
          !containers.includes(match)
        ) {
          containers.push(match);
        }
      }
    } catch {
      continue;
    }
  }

  const indexedSelector =
    type === 'experience'
      ? '[data-automation-id*="workExperience" i]'
      : '[data-automation-id*="education" i]';

  for (const match of document.querySelectorAll(indexedSelector)) {
    if (!(match instanceof HTMLElement)) {
      continue;
    }

    const automationId = match.getAttribute('data-automation-id') ?? '';
    const indexMatch = automationId.match(/(\d+)/);
    const index = indexMatch ? Number.parseInt(indexMatch[1], 10) - 1 : 0;
    const container =
      match.parentElement?.closest('section, fieldset, form, div') ??
      match.parentElement ??
      match;

    if (container instanceof HTMLElement) {
      indexedContainers.set(index, container);
    }
  }

  if (indexedContainers.size > 0) {
    return Array.from(indexedContainers.entries())
      .sort(([left], [right]) => left - right)
      .map(([, container]) => container);
  }

  return containers;
}

/**
 * Returns ordered DOM containers for each entry in a repeatable section.
 */
export function getEntryContainers(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLElement[] {
  const byAutomation = queryContainersByAutomationId(type);
  if (byAutomation.length > 0) {
    return byAutomation.slice(0, MAX_REPEATABLE_ENTRIES);
  }

  const byHeading = queryContainersByHeading(type);
  if (byHeading.length > 0) {
    return byHeading.slice(0, MAX_REPEATABLE_ENTRIES);
  }

  return [];
}

function findAddButtonNearSection(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLButtonElement | null {
  const sectionLabels =
    type === 'experience'
      ? [/work experience/i, /experience/i]
      : [/education/i];

  const headings = Array.from(
    document.querySelectorAll('h1, h2, h3, h4, legend, [role="heading"]'),
  );

  for (const heading of headings) {
    if (!(heading instanceof HTMLElement)) {
      continue;
    }

    const headingText = getTrimmedText(heading.textContent);
    if (!sectionLabels.some((pattern) => pattern.test(headingText))) {
      continue;
    }

    const sectionRoot =
      heading.closest('section, fieldset, [data-automation-id], form, div') ??
      heading.parentElement;

    if (!sectionRoot) {
      continue;
    }

    const buttons = sectionRoot.querySelectorAll('button, [role="button"]');
    for (const button of buttons) {
      if (
        button instanceof HTMLButtonElement &&
        isElementVisible(button) &&
        isAddButton(button)
      ) {
        return button;
      }
    }
  }

  const globalButtons = document.querySelectorAll(
    'button[data-automation-id*="add" i], [role="button"][data-automation-id*="add" i], button, [role="button"]',
  );

  for (const button of globalButtons) {
    if (
      button instanceof HTMLButtonElement &&
      isElementVisible(button) &&
      isAddButton(button)
    ) {
      const context = getTrimmedText(button.closest('section, fieldset, div')?.textContent);
      const matchesContext = sectionLabels.some((pattern) => pattern.test(context));
      if (matchesContext || ADD_BUTTON_PATTERNS.some((pattern) => pattern.test(getTrimmedText(button.textContent)))) {
        return button;
      }
    }
  }

  return null;
}

async function waitForAdditionalEntry(
  type: Exclude<FormSectionType, 'skills'>,
  previousCount: number,
): Promise<boolean> {
  const deadline = Date.now() + DOM_CHANGE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const currentCount = getEntryContainers(type).length;
    if (currentCount > previousCount) {
      return true;
    }

    await delay(100);
  }

  try {
    const nextIndex = previousCount;
    const headingPattern = findSectionHeading(type, nextIndex);
    await waitForElement(
      `h1, h2, h3, h4, legend, [role="heading"]`,
      DOM_CHANGE_TIMEOUT_MS,
    );

    const headings = document.querySelectorAll(
      'h1, h2, h3, h4, legend, [role="heading"]',
    );

    for (const heading of headings) {
      const text = getTrimmedText(heading.textContent);
      if (headingPattern.test(text)) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Clicks Add buttons until the desired number of section entries are visible.
 */
export async function ensureEntryCount(
  type: Exclude<FormSectionType, 'skills'>,
  desiredCount: number,
): Promise<void> {
  const cappedDesired = Math.min(Math.max(desiredCount, 0), MAX_REPEATABLE_ENTRIES);

  for (let attempt = 0; attempt < MAX_REPEATABLE_ENTRIES; attempt += 1) {
    const currentCount = getEntryContainers(type).length;
    if (currentCount >= cappedDesired) {
      return;
    }

    const addButton = findAddButtonNearSection(type);
    if (!addButton) {
      return;
    }

    addButton.click();
    await delay(ADD_CLICK_DELAY_MS);
    await waitForAdditionalEntry(type, currentCount);
  }
}

/**
 * Expands repeatable Work Experience and Education sections before scanning.
 */
export async function ensureRepeatableSections(profile: UserProfile): Promise<void> {
  if (profile.experience.length > 0) {
    await ensureEntryCount('experience', profile.experience.length);
  }

  if (profile.education.length > 0) {
    await ensureEntryCount('education', profile.education.length);
  }
}

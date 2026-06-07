import type { FormSectionType, PortalName, UserProfile } from '@/shared/types';
import { isElementVisible } from '@/shared/utils';

const MAX_REPEATABLE_ENTRIES = 10;
const DOM_CHANGE_TIMEOUT_MS = 10000;
const WAIT_POLL_INTERVAL_MS = 100;

const SECTION_HEADING_PATTERNS: Record<
  Exclude<FormSectionType, 'skills'>,
  RegExp[]
> = {
  experience: [/work experience\s*(\d+)/i, /experience\s*(\d+)/i, /employment\s*(\d+)/i],
  education: [/education\s*(\d+)/i, /^school\s*(\d+)/i],
};

const SECTION_ADD_BUTTON_INDEX: Record<
  Exclude<FormSectionType, 'skills'>,
  number
> = {
  experience: 0,
  education: 1,
};

const ELEMENT_ID_ENTRY_CONFIG: Record<
  Exclude<FormSectionType, 'skills'>,
  Array<{ prefix: string; anchorSuffix: string; instancePattern: RegExp }>
> = {
  experience: [
    {
      prefix: 'workExperience',
      anchorSuffix: 'jobTitle',
      instancePattern: /workExperience-(\d+)--/i,
    },
    {
      prefix: 'employment',
      anchorSuffix: 'jobTitle',
      instancePattern: /employment-(\d+)--/i,
    },
  ],
  education: [
    {
      prefix: 'education',
      anchorSuffix: 'schoolName',
      instancePattern: /education-(\d+)--/i,
    },
    {
      prefix: 'school',
      anchorSuffix: 'schoolName',
      instancePattern: /school-(\d+)--/i,
    },
  ],
};

const instanceIdsByType: Partial<
  Record<Exclude<FormSectionType, 'skills'>, string[]>
> = {};

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
  /add experience/i,
  /add employment/i,
  /add school/i,
  /add degree/i,
];

const GENERIC_REPEATABLE_DELAYS: RepeatablePrepareDelays = {
  entrySettle: 1000,
  addClick: 1000,
  betweenSections: 800,
  skillItem: 600,
};

export interface RepeatablePrepareDelays {
  entrySettle: number;
  addClick: number;
  betweenSections: number;
  skillItem: number;
}

export interface RepeatablePrepareOptions {
  delays?: Partial<RepeatablePrepareDelays>;
  addButtonTimeoutMs?: number;
  entryReadyTimeoutMs?: number;
}

export const PORTAL_REPEATABLE_DELAYS: Record<PortalName, RepeatablePrepareDelays> = {
  workday: {
    entrySettle: 2000,
    addClick: 2000,
    betweenSections: 1500,
    skillItem: 800,
  },
  generic: GENERIC_REPEATABLE_DELAYS,
  greenhouse: GENERIC_REPEATABLE_DELAYS,
  lever: GENERIC_REPEATABLE_DELAYS,
  linkedin: GENERIC_REPEATABLE_DELAYS,
  naukri: GENERIC_REPEATABLE_DELAYS,
  wellfound: GENERIC_REPEATABLE_DELAYS,
  instahyre: GENERIC_REPEATABLE_DELAYS,
};

export function getRepeatableDelays(
  portal: PortalName,
  overrides?: Partial<RepeatablePrepareDelays>,
): RepeatablePrepareDelays {
  const base = PORTAL_REPEATABLE_DELAYS[portal] ?? PORTAL_REPEATABLE_DELAYS.generic;
  return { ...base, ...overrides };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number = DOM_CHANGE_TIMEOUT_MS,
  intervalMs: number = WAIT_POLL_INTERVAL_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await delay(intervalMs);
  }

  return predicate();
}

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function normalizeButtonText(text: string): string {
  return text.trim().toLowerCase();
}

function isAddButton(element: HTMLElement, type: Exclude<FormSectionType, 'skills'>): boolean {
  const text = getTrimmedText(
    element.textContent || element.getAttribute('aria-label'),
  );

  if (!text) {
    return false;
  }

  const normalized = normalizeButtonText(text);
  if (ADD_BUTTON_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (type === 'experience' && /add.*(experience|employment|position|job)/i.test(normalized)) {
    return true;
  }

  if (type === 'education' && /add.*(education|school|degree|university)/i.test(normalized)) {
    return true;
  }

  return false;
}

function isButtonEnabled(button: HTMLButtonElement): boolean {
  if (button.disabled) {
    return false;
  }

  if (button.getAttribute('aria-disabled') === 'true') {
    return false;
  }

  return isElementVisible(button);
}

function findSectionHeading(
  type: Exclude<FormSectionType, 'skills'>,
  index: number,
): RegExp {
  const oneBased = index + 1;
  if (type === 'experience') {
    return new RegExp(`(?:work )?experience\\s*${oneBased}|employment\\s*${oneBased}`, 'i');
  }

  return new RegExp(`education\\s*${oneBased}|school\\s*${oneBased}`, 'i');
}

function findEntryContainerForLabel(labelNode: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = labelNode.parentElement;

  for (let depth = 0; depth < 10 && current; depth += 1) {
    if (
      current !== document.body &&
      current.querySelector('input, textarea, [role="combobox"]')
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return labelNode.parentElement;
}

function queryContainersByVisibleLabels(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLElement[] {
  const labelNodes = Array.from(
    document.querySelectorAll(
      'label, span, div, p, h1, h2, h3, h4, legend, [role="heading"]',
    ),
  );

  const containers: HTMLElement[] = [];

  for (const labelNode of labelNodes) {
    if (!(labelNode instanceof HTMLElement) || !isElementVisible(labelNode)) {
      continue;
    }

    const text = getTrimmedText(labelNode.textContent);
    if (!text || text.length > 80) {
      continue;
    }

    const matchesSection = SECTION_HEADING_PATTERNS[type].some((pattern) =>
      pattern.test(text),
    );

    if (!matchesSection) {
      continue;
    }

    const hasNestedMatch = Array.from(
      labelNode.querySelectorAll(
        'label, span, div, p, h1, h2, h3, h4, legend, [role="heading"]',
      ),
    ).some((descendant) => {
      if (descendant === labelNode || !(descendant instanceof HTMLElement)) {
        return false;
      }
      const descendantText = getTrimmedText(descendant.textContent);
      return SECTION_HEADING_PATTERNS[type].some((pattern) =>
        pattern.test(descendantText),
      );
    });

    if (hasNestedMatch) {
      continue;
    }

    const container = findEntryContainerForLabel(labelNode);
    if (container && !containers.includes(container)) {
      containers.push(container);
    }
  }

  return sortContainersByDocumentOrder(containers);
}

function queryContainersByHeading(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLElement[] {
  const headings = Array.from(
    document.querySelectorAll('h1, h2, h3, h4, legend, [role="heading"]'),
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

function findSmallestCommonAncestor(elements: HTMLElement[]): HTMLElement | null {
  if (elements.length === 0) {
    return null;
  }

  let ancestor: HTMLElement | null = elements[0];
  while (ancestor) {
    if (elements.every((element) => ancestor?.contains(element))) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }

  return null;
}

function escapeCssIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function queryFieldsForInstance(
  prefix: string,
  instanceId: string,
): HTMLElement[] {
  const escaped = escapeCssIdent(instanceId);
  const selector = `[id^="${prefix}-${escaped}--"]`;
  return Array.from(document.querySelectorAll(selector)).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );
}

function queryContainersByElementId(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLElement[] {
  const configs = ELEMENT_ID_ENTRY_CONFIG[type];
  const instanceEntries: Array<{ instanceId: string; anchor: HTMLElement }> = [];

  for (const config of configs) {
    const anchorSelector = `input[id*="${config.prefix}"][id*="${config.anchorSuffix}"], textarea[id*="${config.prefix}"][id*="${config.anchorSuffix}"]`;

    for (const anchor of document.querySelectorAll(anchorSelector)) {
      if (!(anchor instanceof HTMLElement) || !isElementVisible(anchor)) {
        continue;
      }

      const id = anchor.id;
      const match = id.match(config.instancePattern);
      if (!match?.[1]) {
        continue;
      }

      const instanceId = match[1];
      if (
        !instanceEntries.some(
          (entry) => entry.instanceId === instanceId,
        )
      ) {
        instanceEntries.push({ instanceId, anchor });
      }
    }
  }

  if (instanceEntries.length === 0) {
    instanceIdsByType[type] = [];
    return [];
  }

  instanceEntries.sort((left, right) => {
    const position = left.anchor.compareDocumentPosition(right.anchor);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  });

  const containers: HTMLElement[] = [];
  const instanceIds: string[] = [];

  for (const entry of instanceEntries) {
    const config = configs.find((item) =>
      entry.anchor.id.toLowerCase().includes(item.prefix.toLowerCase()),
    );
    if (!config) {
      continue;
    }

    const fields = queryFieldsForInstance(config.prefix, entry.instanceId);
    const container = findSmallestCommonAncestor(
      fields.length > 0 ? fields : [entry.anchor],
    );

    if (container) {
      containers.push(container);
      instanceIds.push(entry.instanceId);
    }
  }

  instanceIdsByType[type] = instanceIds;
  return containers;
}

/**
 * Returns the Workday-style instance id for an entry index when discovered via element ids.
 */
export function getInstanceIdForEntry(
  type: Exclude<FormSectionType, 'skills'>,
  index: number,
): string | null {
  getEntryContainers(type);
  return instanceIdsByType[type]?.[index] ?? null;
}

function getOrderedAddButtons(): HTMLButtonElement[] {
  const selectors = [
    'button[data-automation-id="add-button"]',
    'button[data-automation-id*="add" i]',
    'button[aria-label*="add" i]',
    '[data-testid*="add" i]',
  ];

  const buttons: HTMLButtonElement[] = [];
  const seen = new Set<HTMLButtonElement>();

  for (const selector of selectors) {
    for (const button of document.querySelectorAll(selector)) {
      if (
        button instanceof HTMLButtonElement &&
        isElementVisible(button) &&
        !seen.has(button)
      ) {
        seen.add(button);
        buttons.push(button);
      }
    }
  }

  return buttons.sort((left, right) => {
    const position = left.compareDocumentPosition(right);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  });
}

function findSectionRoot(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLElement | null {
  const sectionLabelPattern =
    type === 'experience'
      ? /^(work )?experience$|^employment$/i
      : /^education$/i;

  const labelNodes = document.querySelectorAll(
    'label, span, div, p, h1, h2, h3, h4, legend, [role="heading"]',
  );

  for (const node of labelNodes) {
    if (!(node instanceof HTMLElement) || !isElementVisible(node)) {
      continue;
    }

    const text = getTrimmedText(node.textContent);
    if (!sectionLabelPattern.test(text) || text.length > 40) {
      continue;
    }

    const root =
      node.closest('section, fieldset, [data-automation-id], form, div') ??
      node.parentElement;

    if (root instanceof HTMLElement) {
      return root;
    }
  }

  const anchorSelector =
    type === 'experience'
      ? 'input[id*="workExperience"][id*="jobTitle"], input[id*="employment"][id*="jobTitle"]'
      : 'input[id*="education"][id*="schoolName"]';

  const anchor = document.querySelector(anchorSelector);
  if (anchor instanceof HTMLElement) {
    const root =
      anchor.closest('[data-automation-id*="applyFlow" i], section, fieldset, form') ??
      anchor.parentElement?.parentElement?.parentElement;
    if (root instanceof HTMLElement) {
      return root;
    }
  }

  return null;
}

function findAddButtonInSectionRoot(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLButtonElement | null {
  const sectionRoot = findSectionRoot(type);
  if (!sectionRoot) {
    return null;
  }

  const buttons = sectionRoot.querySelectorAll(
    'button[data-automation-id="add-button"], button[data-automation-id*="add" i], button, [role="button"]',
  );

  for (const button of buttons) {
    if (
      button instanceof HTMLButtonElement &&
      isElementVisible(button) &&
      isAddButton(button, type)
    ) {
      return button;
    }
  }

  return null;
}

function clickAddButton(button: HTMLButtonElement): void {
  if (typeof button.scrollIntoView === 'function') {
    button.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  button.focus();
  if (typeof button.click === 'function') {
    button.click();
    return;
  }

  try {
    button.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  } catch {
    // Best-effort fallback when click() is unavailable.
  }
}

function findAddButtonBySectionOrder(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLButtonElement | null {
  const buttons = getOrderedAddButtons().filter((button) =>
    isAddButton(button, type),
  );
  const targetIndex = SECTION_ADD_BUTTON_INDEX[type];
  return buttons[targetIndex] ?? buttons[0] ?? null;
}

function findAddButtonAfterLastEntry(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLButtonElement | null {
  const containers = getEntryContainers(type);
  const lastContainer = containers[containers.length - 1];
  if (!lastContainer) {
    return null;
  }

  const buttons = getOrderedAddButtons().filter((button) =>
    isAddButton(button, type),
  );

  for (const button of buttons) {
    const relation = lastContainer.compareDocumentPosition(button);
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
      return button;
    }
  }

  return null;
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

function getSectionFallbackContainer(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLElement | null {
  const sectionLabelPattern =
    type === 'experience'
      ? /^(work )?experience$|^employment$/i
      : /^education$/i;

  const headings = document.querySelectorAll(
    'h1, h2, h3, h4, legend, [role="heading"]',
  );

  for (const heading of headings) {
    if (!(heading instanceof HTMLElement) || !isElementVisible(heading)) {
      continue;
    }

    const text = getTrimmedText(heading.textContent);
    if (!sectionLabelPattern.test(text)) {
      continue;
    }

    const container =
      heading.closest('section, fieldset, [data-automation-id], form, div') ??
      heading.parentElement;

    if (
      container instanceof HTMLElement &&
      container.querySelector('input, textarea, select, [role="combobox"]')
    ) {
      return container;
    }
  }

  return null;
}

function dedupeNestedContainers(containers: HTMLElement[]): HTMLElement[] {
  return containers.filter(
    (container) =>
      !containers.some(
        (other) => other !== container && container.contains(other),
      ),
  );
}

function sortContainersByDocumentOrder(containers: HTMLElement[]): HTMLElement[] {
  return [...containers].sort((left, right) => {
    const position = left.compareDocumentPosition(right);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  });
}

/**
 * Returns ordered DOM containers for each entry in a repeatable section.
 */
export function getEntryContainers(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLElement[] {
  const byElementId = queryContainersByElementId(type);
  if (byElementId.length > 0) {
    return dedupeNestedContainers(byElementId).slice(0, MAX_REPEATABLE_ENTRIES);
  }

  const byVisibleLabels = queryContainersByVisibleLabels(type);
  if (byVisibleLabels.length > 0) {
    return dedupeNestedContainers(byVisibleLabels).slice(0, MAX_REPEATABLE_ENTRIES);
  }

  const byAutomation = queryContainersByAutomationId(type);
  if (byAutomation.length > 0) {
    return dedupeNestedContainers(byAutomation).slice(0, MAX_REPEATABLE_ENTRIES);
  }

  const byHeading = queryContainersByHeading(type);
  if (byHeading.length > 0) {
    return sortContainersByDocumentOrder(dedupeNestedContainers(byHeading)).slice(
      0,
      MAX_REPEATABLE_ENTRIES,
    );
  }

  const fallback = getSectionFallbackContainer(type);
  if (fallback) {
    return [fallback];
  }

  return [];
}

function findAddButtonNearSection(
  type: Exclude<FormSectionType, 'skills'>,
): HTMLButtonElement | null {
  const inSectionRoot = findAddButtonInSectionRoot(type);
  if (inSectionRoot) {
    return inSectionRoot;
  }

  const afterEntryButton = findAddButtonAfterLastEntry(type);
  if (afterEntryButton) {
    return afterEntryButton;
  }

  const orderedButton = findAddButtonBySectionOrder(type);
  if (orderedButton) {
    return orderedButton;
  }

  const sectionLabels =
    type === 'experience'
      ? [/work experience/i, /\bexperience\b/i, /employment/i]
      : [/education/i, /school/i];

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
      heading.parentElement?.parentElement ??
      heading.parentElement;

    if (!sectionRoot) {
      continue;
    }

    const searchRoots = [sectionRoot];
    let sibling: Element | null = heading.nextElementSibling;
    for (let step = 0; step < 4 && sibling; step += 1) {
      searchRoots.push(sibling);
      sibling = sibling.nextElementSibling;
    }

    for (const root of searchRoots) {
      const buttons = root.querySelectorAll(
        'button, [role="button"], button[aria-label*="add" i], [data-testid*="add" i]',
      );
      for (const button of buttons) {
        if (
          button instanceof HTMLButtonElement &&
          isElementVisible(button) &&
          isAddButton(button, type)
        ) {
          return button;
        }
      }
    }
  }

  const globalButtons = document.querySelectorAll(
    'button[data-automation-id*="add" i], [role="button"][data-automation-id*="add" i], button[aria-label*="add" i], [data-testid*="add" i], button, [role="button"]',
  );

  for (const button of globalButtons) {
    if (
      button instanceof HTMLButtonElement &&
      isElementVisible(button) &&
      isAddButton(button, type)
    ) {
      let parent: HTMLElement | null = button.parentElement;
      let context = '';
      for (let depth = 0; depth < 12 && parent; depth += 1) {
        const automationId = parent.getAttribute('data-automation-id');
        if (automationId && automationId !== 'add-button') {
          context = getTrimmedText(parent.textContent);
          break;
        }
        parent = parent.parentElement;
      }

      if (!context) {
        context = getTrimmedText(button.parentElement?.textContent);
      }

      const matchesContext = sectionLabels.some((pattern) => pattern.test(context));
      if (matchesContext) {
        return button;
      }
    }
  }

  return null;
}

export function hasNumberedEntryHeading(
  type: Exclude<FormSectionType, 'skills'>,
  index: number,
): boolean {
  const headingPattern = findSectionHeading(type, index);
  const headings = document.querySelectorAll(
    'label, span, div, p, h1, h2, h3, h4, legend, [role="heading"]',
  );

  for (const heading of headings) {
    const text = getTrimmedText(heading.textContent);
    if (text.length > 80) {
      continue;
    }
    if (headingPattern.test(text)) {
      return true;
    }
  }

  return false;
}

function isEntryValidated(
  type: Exclude<FormSectionType, 'skills'>,
  container: HTMLElement,
): boolean {
  if (type === 'experience') {
    const title = container.querySelector(
      '[id*="--jobTitle"], [name="jobTitle"], input[aria-label*="Job Title" i]',
    );
    const company = container.querySelector(
      '[id*="--companyName"], [name="companyName"], input[aria-label*="Company" i]',
    );
    const startYear = container.querySelector(
      '[id*="--startDate-dateSectionYear-input"], [id*="--startDate"] input[aria-label="Year" i]',
    );

    const checks: boolean[] = [];

    if (title instanceof HTMLInputElement) {
      checks.push(title.value.trim().length > 0);
    }
    if (company instanceof HTMLInputElement) {
      checks.push(company.value.trim().length > 0);
    }
    if (startYear instanceof HTMLInputElement) {
      const yearValue =
        startYear.value.trim() || startYear.getAttribute('aria-valuenow') || '';
      checks.push(yearValue.length > 0);
    }

    if (checks.length === 0) {
      const anyInput = container.querySelector('input, textarea');
      return (
        anyInput instanceof HTMLInputElement &&
        anyInput.value.trim().length > 0
      );
    }

    return checks.every(Boolean);
  }

  const school = container.querySelector(
    '[id*="--schoolName"], [name="schoolName"], input[aria-label*="School" i]',
  );
  const schoolValue =
    school instanceof HTMLInputElement ? school.value.trim() : '';
  return Boolean(schoolValue);
}

/**
 * Polls until required fields in an entry container appear filled.
 */
export async function waitForEntryValidation(
  type: Exclude<FormSectionType, 'skills'>,
  index: number,
  timeoutMs: number = DOM_CHANGE_TIMEOUT_MS,
): Promise<boolean> {
  return waitForCondition(() => {
    const containers = getEntryContainers(type);
    const container = containers[index];
    if (!container) {
      return false;
    }
    return isEntryValidated(type, container);
  }, timeoutMs);
}

function countNumberedEntryHeadings(
  type: Exclude<FormSectionType, 'skills'>,
): number {
  let count = 0;

  for (let index = 0; index < MAX_REPEATABLE_ENTRIES; index += 1) {
    if (!hasNumberedEntryHeading(type, index)) {
      break;
    }
    count += 1;
  }

  return count;
}

/**
 * Polls until the section Add button exists and is enabled.
 */
export async function waitForAddButtonEnabled(
  type: Exclude<FormSectionType, 'skills'>,
  timeoutMs: number = DOM_CHANGE_TIMEOUT_MS,
): Promise<HTMLButtonElement | null> {
  let found: HTMLButtonElement | null = null;

  const ready = await waitForCondition(() => {
    const button = findAddButtonNearSection(type);
    if (button && isButtonEnabled(button)) {
      found = button;
      return true;
    }
    return false;
  }, timeoutMs);

  return ready ? found : null;
}

/**
 * Polls until the entry at index exists in the DOM.
 */
export async function waitForEntryReady(
  type: Exclude<FormSectionType, 'skills'>,
  index: number,
  timeoutMs: number = DOM_CHANGE_TIMEOUT_MS,
): Promise<boolean> {
  return waitForCondition(() => {
    const containers = getEntryContainers(type);
    if (containers[index]) {
      return true;
    }
    return hasNumberedEntryHeading(type, index);
  }, timeoutMs);
}

async function waitForAdditionalEntry(
  type: Exclude<FormSectionType, 'skills'>,
  previousCount: number,
  nextIndex: number,
  timeoutMs: number,
): Promise<boolean> {
  const previousNumberedCount = countNumberedEntryHeadings(type);

  const ready = await waitForCondition(() => {
    const currentCount = getEntryContainers(type).length;
    if (currentCount > previousCount) {
      return true;
    }

    if (previousCount === 0 && currentCount > 0) {
      return true;
    }

    if (countNumberedEntryHeadings(type) > previousNumberedCount) {
      return true;
    }

    return hasNumberedEntryHeading(type, nextIndex);
  }, timeoutMs);

  return ready;
}

/**
 * Clicks Add buttons until the desired number of section entries are visible.
 */
export async function ensureEntryCount(
  type: Exclude<FormSectionType, 'skills'>,
  desiredCount: number,
): Promise<void> {
  const cappedDesired = Math.min(Math.max(desiredCount, 0), MAX_REPEATABLE_ENTRIES);
  const delays = PORTAL_REPEATABLE_DELAYS.generic;

  for (let attempt = 0; attempt < MAX_REPEATABLE_ENTRIES; attempt += 1) {
    const currentCount = getEntryContainers(type).length;
    if (currentCount >= cappedDesired) {
      return;
    }

    const addButton = await waitForAddButtonEnabled(type);
    if (!addButton) {
      return;
    }

    clickAddButton(addButton);
    await delay(delays.addClick);
    await waitForAdditionalEntry(type, currentCount, currentCount, DOM_CHANGE_TIMEOUT_MS);
  }
}

/**
 * Clicks the section Add button and waits for a new entry block to appear.
 */
export async function clickAddAndWait(
  type: Exclude<FormSectionType, 'skills'>,
  options?: RepeatablePrepareOptions,
): Promise<boolean> {
  const delays = getRepeatableDelays('generic', options?.delays);
  const timeoutMs = options?.entryReadyTimeoutMs ?? DOM_CHANGE_TIMEOUT_MS;
  const previousCount = getEntryContainers(type).length;
  const nextIndex = previousCount;

  const addButton = await waitForAddButtonEnabled(
    type,
    options?.addButtonTimeoutMs ?? timeoutMs,
  );
  if (!addButton) {
    return false;
  }

  clickAddButton(addButton);
  await delay(delays.addClick);
  return waitForAdditionalEntry(type, previousCount, nextIndex, timeoutMs);
}

async function ensureContainerAtIndex(
  type: Exclude<FormSectionType, 'skills'>,
  index: number,
  options?: RepeatablePrepareOptions,
): Promise<HTMLElement | null> {
  let containers = getEntryContainers(type);

  if (index < containers.length) {
    return containers[index] ?? null;
  }

  const added = await clickAddAndWait(type, options);
  if (!added) {
    if (index === 0) {
      return getSectionFallbackContainer(type);
    }
    return null;
  }

  await waitForEntryReady(type, index, options?.entryReadyTimeoutMs);
  containers = getEntryContainers(type);
  return containers[index] ?? null;
}

/**
 * Fills each entry in order, clicking Add only after the current entry is filled.
 */
export async function fillRepeatableEntriesSequential<T>(
  type: Exclude<FormSectionType, 'skills'>,
  entries: T[],
  fillEntry: (container: HTMLElement, entry: T, index: number) => void | Promise<void>,
  options?: RepeatablePrepareOptions,
): Promise<number> {
  const cappedEntries = entries.slice(0, MAX_REPEATABLE_ENTRIES);
  const delays = getRepeatableDelays('generic', options?.delays);
  let filled = 0;

  for (let index = 0; index < cappedEntries.length; index += 1) {
    const container = await ensureContainerAtIndex(type, index, options);
    if (!container) {
      break;
    }

    await fillEntry(container, cappedEntries[index], index);
    filled += 1;
    await delay(delays.entrySettle);

    if (index < cappedEntries.length - 1) {
      await waitForEntryValidation(
        type,
        index,
        options?.entryReadyTimeoutMs ?? DOM_CHANGE_TIMEOUT_MS,
      );
      await waitForAddButtonEnabled(
        type,
        options?.addButtonTimeoutMs ?? DOM_CHANGE_TIMEOUT_MS,
      );
      const added = await clickAddAndWait(type, options);
      if (!added) {
        break;
      }
      await waitForEntryReady(
        type,
        index + 1,
        options?.entryReadyTimeoutMs ?? DOM_CHANGE_TIMEOUT_MS,
      );
    }
  }

  return filled;
}

export async function delayBetweenSections(
  portal: PortalName,
  overrides?: Partial<RepeatablePrepareDelays>,
): Promise<void> {
  const delays = getRepeatableDelays(portal, overrides);
  await delay(delays.betweenSections);
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

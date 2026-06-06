import {
  isElementVisible,
  simulateUserInput,
  waitForElement,
} from '@/shared/utils';

const COMBOBOX_DELAY_MS = 200;
const OPTION_SELECTORS = [
  '[role="option"]',
  '[data-automation-id*="option" i]',
  'li[role="option"]',
];

const TRIGGER_SELECTORS = [
  'input:not([type="hidden"])',
  '[role="combobox"]',
  '[role="listbox"]',
  'button[aria-expanded]',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function matchesText(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function findSearchInput(container: Element): HTMLInputElement | null {
  const inputs = container.querySelectorAll('input:not([type="hidden"])');

  for (const input of inputs) {
    if (
      input instanceof HTMLInputElement &&
      isElementVisible(input) &&
      input.type !== 'checkbox' &&
      input.type !== 'radio' &&
      input.type !== 'file'
    ) {
      return input;
    }
  }

  if (
    container instanceof HTMLInputElement &&
    container.type !== 'checkbox' &&
    container.type !== 'radio'
  ) {
    return container;
  }

  return null;
}

function findDropdownTrigger(container: Element): HTMLElement | null {
  for (const selector of TRIGGER_SELECTORS) {
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

export function findMatchingOption(
  value: string,
  root: ParentNode = document,
): HTMLElement | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const selector of OPTION_SELECTORS) {
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

async function openCombobox(container: Element): Promise<HTMLElement | null> {
  const trigger = findDropdownTrigger(container);
  if (!trigger) {
    return null;
  }

  trigger.click();
  await delay(COMBOBOX_DELAY_MS);
  return trigger;
}

async function typeFilterValue(
  container: Element,
  value: string,
): Promise<void> {
  const searchInput = findSearchInput(container);
  if (!searchInput) {
    return;
  }

  searchInput.focus();
  simulateUserInput(searchInput, value);
  await delay(COMBOBOX_DELAY_MS);
}

/**
 * Fills a custom combobox / searchable dropdown with a single value.
 */
export async function fillCombobox(
  element: HTMLElement,
  value: string,
): Promise<boolean> {
  if (!value.trim()) {
    return false;
  }

  const container =
    element.closest('[role="combobox"], [role="listbox"]') ?? element;

  await openCombobox(container);
  await typeFilterValue(container, value);

  try {
    await waitForElement('[role="option"]', 1500);
  } catch {
    // Options may already be in the DOM.
  }

  const option = findMatchingOption(value);
  if (!option) {
    return false;
  }

  option.click();
  await delay(COMBOBOX_DELAY_MS);
  return true;
}

/**
 * Synchronous combobox fill for contexts that cannot await (e.g. Workday sync path).
 */
export function fillComboboxSync(element: HTMLElement, value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  const container =
    element.closest('[role="combobox"], [role="listbox"]') ?? element;
  const trigger = findDropdownTrigger(container);

  if (!trigger) {
    return false;
  }

  trigger.click();

  const deadline = performance.now() + COMBOBOX_DELAY_MS;
  while (performance.now() < deadline) {
    // Allow options to render.
  }

  const searchInput = findSearchInput(container);
  if (searchInput) {
    searchInput.focus();
    simulateUserInput(searchInput, value);

    const typeDeadline = performance.now() + COMBOBOX_DELAY_MS;
    while (performance.now() < typeDeadline) {
      // Allow filtered results to render.
    }
  }

  const option = findMatchingOption(value);
  if (!option) {
    return false;
  }

  option.click();

  const clickDeadline = performance.now() + COMBOBOX_DELAY_MS;
  while (performance.now() < clickDeadline) {
    // Allow selection to apply.
  }

  return true;
}

function findChipContainer(root: ParentNode): Element | null {
  const chipSelectors = [
    '[data-automation-id*="selectedItem" i]',
    '[data-automation-id*="chip" i]',
    '[class*="chip" i]',
    '[class*="tag" i]',
    '[class*="pill" i]',
  ];

  for (const selector of chipSelectors) {
    const match = root.querySelector(selector);
    if (match) {
      return match.parentElement ?? match;
    }
  }

  return null;
}

function hasSelectedChip(root: ParentNode, value: string): boolean {
  const chipContainer = findChipContainer(root);
  const searchRoot = chipContainer ?? root;
  const normalized = value.trim().toLowerCase();

  const chipCandidates = searchRoot.querySelectorAll(
    '[data-automation-id*="selectedItem" i], [class*="chip" i], [class*="tag" i], [class*="pill" i], span, button',
  );

  for (const chip of chipCandidates) {
    const text = getTrimmedText(chip.textContent).toLowerCase();
    if (text && (text === normalized || text.includes(normalized))) {
      return true;
    }
  }

  return false;
}

/**
 * Fills a searchable multi-select widget (e.g. Workday Skills) with multiple values.
 */
export async function fillMultiSelectSearch(
  container: Element,
  values: string[],
): Promise<number> {
  let filled = 0;

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    if (hasSelectedChip(container, trimmed)) {
      filled += 1;
      continue;
    }

    const searchInput = findSearchInput(container);
    if (!searchInput) {
      continue;
    }

    searchInput.focus();
    searchInput.click();
    simulateUserInput(searchInput, trimmed);
    await delay(COMBOBOX_DELAY_MS);

    try {
      await waitForElement('[role="option"]', 1500);
    } catch {
      // Continue with whatever options exist.
    }

    const option = findMatchingOption(trimmed, container);
    if (!option) {
      continue;
    }

    option.click();
    await delay(COMBOBOX_DELAY_MS);

    if (hasSelectedChip(container, trimmed)) {
      filled += 1;
    }
  }

  return filled;
}

function syncDelay(ms: number): void {
  const deadline = performance.now() + ms;
  while (performance.now() < deadline) {
    // Allow DOM updates between multi-select steps.
  }
}

/**
 * Synchronous multi-select fill for the generic filler pipeline.
 */
export function fillMultiSelectSearchSync(
  container: Element,
  values: string[],
): number {
  let filled = 0;

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    if (hasSelectedChip(container, trimmed)) {
      filled += 1;
      continue;
    }

    const searchInput = findSearchInput(container);
    if (!searchInput) {
      continue;
    }

    searchInput.focus();
    searchInput.click();
    simulateUserInput(searchInput, trimmed);
    syncDelay(COMBOBOX_DELAY_MS);

    const option = findMatchingOption(trimmed, container);
    if (!option) {
      continue;
    }

    option.click();
    syncDelay(COMBOBOX_DELAY_MS);

    if (hasSelectedChip(container, trimmed)) {
      filled += 1;
    }
  }

  return filled;
}

import { findMatchingOption } from '@/content/controls/combobox';
import { getRepeatableDelays } from '@/content/repeatableSections';
import type { PortalName } from '@/shared/types';
import { isElementVisible, simulateUserInput } from '@/shared/utils';

const SEARCH_RESULTS_TIMEOUT_MS = 3000;
const SEARCH_POLL_INTERVAL_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getTrimmedText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function normalizeSkill(value: string): string {
  return value.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scoreSkillMatch(profileSkill: string, optionText: string): number {
  const skill = normalizeSkill(profileSkill);
  const option = normalizeSkill(optionText);

  if (!skill || !option) {
    return 0;
  }

  if (option === skill) {
    return 100;
  }

  if (option.startsWith(`${skill} (`)) {
    return 90;
  }

  if (skill.length >= 2) {
    const wordBoundary = new RegExp(`\\b${escapeRegExp(skill)}\\b`, 'i');
    if (wordBoundary.test(option)) {
      return 80;
    }
  }

  if (option.includes(skill)) {
    return skill.length >= 3 ? 70 : 0;
  }

  return 0;
}

function isSkillsSectionRoot(element: ParentNode): boolean {
  const text = getTrimmedText(
    element instanceof HTMLElement ? element.textContent : '',
  ).toLowerCase();
  return /\bskills\b/.test(text) || /type to add skills/i.test(text);
}

export function findSkillsSearchInput(root: ParentNode): HTMLInputElement | null {
  const directSelectors = [
    '#skills--skills',
    'input[id*="skills--"]',
    'input[data-uxi-widget-type="selectinput"][placeholder="Search"]',
    'input[data-uxi-widget-type="selectinput"]',
  ];

  for (const selector of directSelectors) {
    const match = root.querySelector(selector);
    if (match instanceof HTMLInputElement && isElementVisible(match)) {
      return match;
    }
  }

  const inputs = root.querySelectorAll('input:not([type="hidden"])');

  for (const input of inputs) {
    if (!(input instanceof HTMLInputElement) || !isElementVisible(input)) {
      continue;
    }

    const ariaLabel = getTrimmedText(input.getAttribute('aria-label')).toLowerCase();
    const placeholder = getTrimmedText(input.placeholder).toLowerCase();
    const name = getTrimmedText(input.name).toLowerCase();

    const sectionRoot =
      input.closest('section, fieldset, [data-automation-id], form, div') ??
      input.parentElement;

    const inSkillsSection =
      sectionRoot instanceof HTMLElement && isSkillsSectionRoot(sectionRoot);

    if (
      /type to add skills|add skills|search skills|skill/i.test(ariaLabel) ||
      /type to add skills|add skills|skill/i.test(placeholder) ||
      /skill/i.test(name) ||
      (inSkillsSection && placeholder === 'search')
    ) {
      return input;
    }
  }

  return null;
}

export function findSkillsRoot(root: ParentNode): HTMLElement | null {
  const automationMatch = root.querySelector(
    '[data-automation-id*="skills" i], [data-automation-id*="skillSection" i]',
  );

  if (automationMatch instanceof HTMLElement) {
    return automationMatch;
  }

  const sections = root.querySelectorAll('section, fieldset, div');
  for (const section of sections) {
    if (
      section instanceof HTMLElement &&
      /\bskills\b/i.test(getTrimmedText(section.textContent))
    ) {
      return section;
    }
  }

  const searchInput = findSkillsSearchInput(root);
  if (searchInput) {
    const container = searchInput.closest('section, fieldset, [data-automation-id], form, div');
    if (container instanceof HTMLElement) {
      return container;
    }
  }

  return null;
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

export function hasSelectedSkillChip(root: ParentNode, skill: string): boolean {
  const chipContainer = findChipContainer(root);
  const searchRoot = chipContainer ?? root;
  const normalized = normalizeSkill(skill);

  const chipCandidates = searchRoot.querySelectorAll(
    '[data-automation-id*="selectedItem" i], [class*="chip" i], [class*="tag" i], [class*="pill" i], span, button',
  );

  for (const chip of chipCandidates) {
    const text = normalizeSkill(chip.textContent ?? '');
    if (!text) {
      continue;
    }

    if (
      text === normalized ||
      text.includes(normalized) ||
      scoreSkillMatch(skill, text) >= 80
    ) {
      return true;
    }
  }

  return false;
}

function collectSearchResultRows(root: ParentNode): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const panelSelectors = [
    '[data-automation-id*="searchResults" i]',
    '[role="listbox"]',
    'ul',
  ];

  for (const selector of panelSelectors) {
    for (const panel of root.querySelectorAll(selector)) {
      if (!(panel instanceof HTMLElement) || !isElementVisible(panel)) {
        continue;
      }

      const panelText = getTrimmedText(panel.textContent);
      if (
        panelText &&
        !/search results/i.test(panelText) &&
        selector === 'ul' &&
        !panel.querySelector('input[type="checkbox"]')
      ) {
        continue;
      }

      const candidates = panel.querySelectorAll(
        '[role="option"], li, label:has(input[type="checkbox"]), div:has(input[type="checkbox"])',
      );

      for (const candidate of candidates) {
        if (
          candidate instanceof HTMLElement &&
          isElementVisible(candidate) &&
          getTrimmedText(candidate.textContent) &&
          !seen.has(candidate)
        ) {
          seen.add(candidate);
          rows.push(candidate);
        }
      }
    }
  }

  if (rows.length > 0) {
    return rows;
  }

  for (const option of document.querySelectorAll('[role="option"]')) {
    if (
      option instanceof HTMLElement &&
      isElementVisible(option) &&
      !seen.has(option)
    ) {
      seen.add(option);
      rows.push(option);
    }
  }

  return rows;
}

export function findBestSkillMatchRow(skill: string, root: ParentNode): HTMLElement | null {
  const rows = collectSearchResultRows(root);
  let bestRow: HTMLElement | null = null;
  let bestScore = 0;

  for (const row of rows) {
    const text = getTrimmedText(row.textContent);
    const score = scoreSkillMatch(skill, text);
    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }

  return bestScore >= 70 ? bestRow : null;
}

export function clickSkillResultRow(row: HTMLElement): void {
  const checkbox = row.querySelector('input[type="checkbox"]');
  if (checkbox instanceof HTMLInputElement) {
    if (!checkbox.checked) {
      checkbox.click();
    }
    return;
  }

  row.click();
}

async function waitForSearchResults(root: ParentNode): Promise<boolean> {
  const deadline = Date.now() + SEARCH_RESULTS_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const hasOptions = root.querySelector('[role="option"]');
    const hasCheckbox = root.querySelector(
      'input[type="checkbox"], [data-automation-id*="searchResults" i]',
    );
    const hasSearchHeader = Array.from(root.querySelectorAll('div, span, h3, h4')).some(
      (node) => /search results/i.test(getTrimmedText(node.textContent)),
    );

    if (hasOptions || hasCheckbox || hasSearchHeader) {
      return true;
    }

    if (document.querySelector('[role="option"], [data-automation-id*="searchResults" i]')) {
      return true;
    }

    await delay(SEARCH_POLL_INTERVAL_MS);
  }

  return false;
}

function selectSkillMatch(skill: string, skillsRoot: ParentNode): boolean {
  let option = findMatchingOption(skill, skillsRoot);
  if (!option) {
    option = findMatchingOption(skill, document);
  }

  if (option) {
    option.click();
    return true;
  }

  let matchRow = findBestSkillMatchRow(skill, skillsRoot);
  if (!matchRow) {
    matchRow = findBestSkillMatchRow(skill, document);
  }

  if (!matchRow) {
    return false;
  }

  clickSkillResultRow(matchRow);
  return true;
}

function clearSearchInput(searchInput: HTMLInputElement): void {
  simulateUserInput(searchInput, '');
}

function dispatchEnterKey(element: HTMLElement): void {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
  );
  element.dispatchEvent(
    new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }),
  );
}

export interface FillSkillsSequentialOptions {
  portal?: PortalName;
  skillItemDelayMs?: number;
}

/**
 * Fills a searchable multi-select skills widget one skill at a time.
 */
export async function fillSkillsSequential(
  root: ParentNode,
  skills: string[],
  options: FillSkillsSequentialOptions = {},
): Promise<number> {
  const skillsRoot = findSkillsRoot(root);
  if (!skillsRoot || skills.length === 0) {
    return 0;
  }

  const searchInput = findSkillsSearchInput(skillsRoot);
  if (!searchInput) {
    return 0;
  }

  const portal = options.portal ?? 'generic';
  const skillItemDelay =
    options.skillItemDelayMs ?? getRepeatableDelays(portal).skillItem;
  let filled = 0;

  for (const skill of skills) {
    const trimmed = skill.trim();
    if (!trimmed) {
      continue;
    }

    if (
      hasSelectedSkillChip(skillsRoot, trimmed) ||
      hasSelectedSkillChip(document, trimmed)
    ) {
      filled += 1;
      continue;
    }

    searchInput.focus();
    searchInput.click();
    clearSearchInput(searchInput);
    searchInput.focus();
    simulateUserInput(searchInput, trimmed);
    dispatchEnterKey(searchInput);
    await waitForSearchResults(skillsRoot);

    let selected = selectSkillMatch(trimmed, skillsRoot);
    if (!selected) {
      dispatchEnterKey(searchInput);
      await waitForSearchResults(document);
      selected = selectSkillMatch(trimmed, document);
    }

    if (!selected) {
      continue;
    }

    await delay(skillItemDelay);

    if (
      hasSelectedSkillChip(skillsRoot, trimmed) ||
      hasSelectedSkillChip(document, trimmed)
    ) {
      filled += 1;
      clearSearchInput(searchInput);
      continue;
    }

    clearSearchInput(searchInput);
    searchInput.focus();
    simulateUserInput(searchInput, trimmed);
    dispatchEnterKey(searchInput);
    await waitForSearchResults(skillsRoot);
    selected = selectSkillMatch(trimmed, skillsRoot);
    if (selected) {
      await delay(skillItemDelay);
      if (
        hasSelectedSkillChip(skillsRoot, trimmed) ||
        hasSelectedSkillChip(document, trimmed)
      ) {
        filled += 1;
      }
    }

    clearSearchInput(searchInput);
  }

  return filled;
}

export function pageHasSkillsSection(root: ParentNode = document): boolean {
  return findSkillsRoot(root) !== null && findSkillsSearchInput(root) !== null;
}

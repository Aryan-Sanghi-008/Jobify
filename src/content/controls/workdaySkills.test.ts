/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fillWorkdaySkillsAsync,
  scoreSkillMatch,
} from '@/content/controls/workdaySkills';

function mockVisibleLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 24,
    top: 0,
    left: 0,
    bottom: 24,
    right: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('scoreSkillMatch', () => {
  it('prefers expanded programming language labels for short skills', () => {
    expect(scoreSkillMatch('C', 'C (Programming Language)')).toBeGreaterThanOrEqual(90);
    expect(scoreSkillMatch('C', 'C NMR')).toBe(0);
  });
});

describe('fillWorkdaySkillsAsync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockVisibleLayout();
    document.body.innerHTML = `
      <section data-automation-id="skillsSection">
        <h2>Skills</h2>
        <p>Type to Add Skills</p>
        <div id="chips"></div>
        <input type="text" aria-label="Type to Add Skills" />
        <div data-automation-id="searchResultsPanel">
          <div>Search Results (31)</div>
          <ul>
            <li>
              <label>
                <input type="checkbox" />
                C (Programming Language)
              </label>
            </li>
            <li>
              <label>
                <input type="checkbox" />
                C NMR
              </label>
            </li>
          </ul>
        </div>
      </section>
    `;

    const chips = document.getElementById('chips') as HTMLElement;
    document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        if (!(checkbox instanceof HTMLInputElement) || !checkbox.checked) {
          return;
        }

        const label = checkbox.closest('label');
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = label?.textContent?.trim() ?? '';
        chips.appendChild(chip);
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('selects fuzzy checkbox search results and adds chips', async () => {
    const promise = fillWorkdaySkillsAsync(document.body, ['C']);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(1);
    expect(document.getElementById('chips')?.textContent).toContain(
      'C (Programming Language)',
    );
  });
});

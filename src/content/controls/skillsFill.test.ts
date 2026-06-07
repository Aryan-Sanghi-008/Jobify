/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fillSkillsSequential,
  findSkillsSearchInput,
  scoreSkillMatch,
} from '@/content/controls/skillsFill';

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

describe('skillsFill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockVisibleLayout();
    document.body.innerHTML = `
      <section>
        <h2>Skills</h2>
        <div id="chips"></div>
        <input type="text" aria-label="Type to Add Skills" />
        <ul>
          <li>
            <label>
              <input type="checkbox" />
              TypeScript
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" />
              JavaScript
            </label>
          </li>
        </ul>
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

  it('scoreSkillMatch prefers expanded labels for short skills', () => {
    expect(scoreSkillMatch('C', 'C (Programming Language)')).toBeGreaterThanOrEqual(90);
    expect(scoreSkillMatch('C', 'C NMR')).toBe(0);
  });

  it('findSkillsSearchInput discovers Workday UXI skills input', () => {
    document.body.innerHTML = `
      <section>
        <h2>Skills</h2>
        <span>Type to Add Skills</span>
        <input id="skills--skills" placeholder="Search" data-uxi-widget-type="selectinput" />
      </section>
    `;

    const input = findSkillsSearchInput(document.body);
    expect(input?.id).toBe('skills--skills');
  });

  it('fillSkillsSequential adds multiple skills with delays', async () => {
    const promise = fillSkillsSequential(document.body, ['TypeScript', 'JavaScript'], {
      skillItemDelayMs: 50,
    });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(2);
    expect(document.getElementById('chips')?.textContent).toContain('TypeScript');
    expect(document.getElementById('chips')?.textContent).toContain('JavaScript');
  });
});

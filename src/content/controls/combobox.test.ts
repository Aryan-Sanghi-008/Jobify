/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fillComboboxSync,
  fillMultiSelectSearchSync,
  findMatchingOption,
} from '@/content/controls/combobox';

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

describe('combobox controls', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockVisibleLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('findMatchingOption matches visible option text', () => {
    document.body.innerHTML = `
      <div role="listbox">
        <div role="option">Bachelor of Science</div>
      </div>
    `;

    const option = findMatchingOption('Bachelor');
    expect(option?.textContent).toContain('Bachelor of Science');
  });

  it('fillComboboxSync selects an option from a searchable combobox', () => {
    document.body.innerHTML = `
      <div role="combobox">
        <input type="text" aria-label="Degree" />
        <div role="option">Master of Science</div>
      </div>
    `;

    const combobox = document.querySelector('[role="combobox"]') as HTMLElement;
    const input = combobox.querySelector('input') as HTMLInputElement;
    const option = combobox.querySelector('[role="option"]') as HTMLElement;
    option.addEventListener('click', () => {
      input.value = 'Master of Science';
    });

    const filled = fillComboboxSync(combobox, 'Master of Science');

    expect(filled).toBe(true);
    expect(input.value).toBe('Master of Science');
  });

  it('fillMultiSelectSearchSync adds skill chips', () => {
    document.body.innerHTML = `
      <section>
        <h2>Skills</h2>
        <input type="text" aria-label="Type to Add Skills" />
        <div role="option">TypeScript</div>
        <div id="chips"></div>
      </section>
    `;

    const section = document.querySelector('section') as HTMLElement;
    const chips = document.getElementById('chips') as HTMLElement;

    document.querySelectorAll('[role="option"]').forEach((option) => {
      option.addEventListener('click', () => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = option.textContent?.trim() ?? '';
        chips.appendChild(chip);
      });
    });

    const filledCount = fillMultiSelectSearchSync(section, ['TypeScript']);

    expect(filledCount).toBe(1);
    expect(chips.textContent).toContain('TypeScript');
  });
});

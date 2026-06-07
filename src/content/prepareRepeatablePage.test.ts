/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillFields } from '@/content/filler';
import {
  isRepeatablePagePrepared,
  isRepeatableSectionPrepared,
  prepareRepeatablePage,
  resetRepeatablePagePreparedForTests,
} from '@/content/prepareRepeatablePage';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, flattenProfile } from '@/shared/storage';
import type { FormField } from '@/shared/types';

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

describe('prepareRepeatablePage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockVisibleLayout();
    resetRepeatablePagePreparedForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetRepeatablePagePreparedForTests();
  });

  it('fills experience, education, and skills in order for generic portals', async () => {
    document.body.innerHTML = `
      <div id="log"></div>
      <section>
        <h2>Work Experience</h2>
        <div id="experience-entries">
          <section>
            <h3>Work Experience 1</h3>
            <input aria-label="Job Title" />
          </section>
        </div>
        <button type="button" id="add-experience">Add Another</button>
      </section>
      <section>
        <h2>Education</h2>
        <button type="button" id="add-education">Add</button>
        <div id="education-entries"></div>
      </section>
      <section>
        <h2>Skills</h2>
        <div id="chips"></div>
        <input type="text" aria-label="Type to Add Skills" />
        <div role="option">TypeScript</div>
        <div role="option">React</div>
      </section>
    `;

    const log = document.getElementById('log') as HTMLElement;
    const experienceEntries = document.getElementById('experience-entries') as HTMLElement;
    const educationEntries = document.getElementById('education-entries') as HTMLElement;
    const chips = document.getElementById('chips') as HTMLElement;

    document.getElementById('add-experience')?.addEventListener('click', () => {
      const index = experienceEntries.querySelectorAll('section').length + 1;
      const block = document.createElement('section');
      block.innerHTML = `<h3>Work Experience ${index}</h3><input aria-label="Job Title" />`;
      experienceEntries.appendChild(block);
    });

    document.getElementById('add-education')?.addEventListener('click', () => {
      const index = educationEntries.querySelectorAll('section').length + 1;
      const block = document.createElement('section');
      block.innerHTML = `<h3>Education ${index}</h3><input aria-label="School" />`;
      educationEntries.appendChild(block);
    });

    document.querySelectorAll('[role="option"]').forEach((option) => {
      option.addEventListener('click', () => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = option.textContent?.trim() ?? '';
        chips.appendChild(chip);
      });
    });

    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Engineer',
          company: 'Acme',
          startDate: '2020-01',
          endDate: '2023-01',
          current: false,
          description: '',
        },
        {
          title: 'Lead',
          company: 'Beta',
          startDate: '2018-01',
          endDate: '2020-01',
          current: false,
          description: '',
        },
      ],
      education: [
        {
          institution: 'State University',
          degree: 'BS',
          field: 'CS',
          graduationYear: 2018,
          percentage: '85',
        },
      ],
      skills: ['TypeScript', 'React'],
    };

    const promise = prepareRepeatablePage(profile, 'generic', document, {
      shouldRun: () => true,
      fillExperienceEntry: async (container, entry) => {
        log.textContent += `exp:${entry.title};`;
        const input = container.querySelector('input[aria-label="Job Title"]');
        if (input instanceof HTMLInputElement) {
          input.value = entry.title;
        }
        return 1;
      },
      fillEducationEntry: async (container, entry) => {
        log.textContent += `edu:${entry.institution};`;
        const input = container.querySelector('input[aria-label="School"]');
        if (input instanceof HTMLInputElement) {
          input.value = entry.institution;
        }
        return 1;
      },
    });

    await vi.runAllTimersAsync();
    await promise;

    expect(isRepeatablePagePrepared()).toBe(true);
    expect(log.textContent).toContain('exp:Engineer');
    expect(log.textContent).toContain('exp:Lead');
    expect(log.textContent).toContain('edu:State University');
    expect(chips.textContent).toContain('TypeScript');
    expect(chips.textContent).toContain('React');
  });

  it('marks per-section flags independently when only experience is filled', async () => {
    document.body.innerHTML = `
      <section>
        <h2>Work Experience</h2>
        <section>
          <h3>Work Experience 1</h3>
          <input aria-label="Job Title" />
        </section>
      </section>
    `;

    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Engineer',
          company: 'Acme',
          startDate: '2020-01',
          endDate: '2023-01',
          current: false,
          description: '',
        },
      ],
      education: [
        {
          institution: 'State University',
          degree: 'BS',
          field: 'CS',
          graduationYear: 2018,
          percentage: '85',
        },
      ],
      skills: [],
    };

    const promise = prepareRepeatablePage(profile, 'generic', document, {
      shouldRun: () => true,
      fillExperienceEntry: async (container, entry) => {
        const input = container.querySelector('input[aria-label="Job Title"]');
        if (input instanceof HTMLInputElement) {
          input.value = entry.title;
        }
        return 1;
      },
      fillEducationEntry: async () => 0,
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(isRepeatableSectionPrepared('experience')).toBe(true);
    expect(isRepeatableSectionPrepared('education')).toBe(false);
    expect(isRepeatablePagePrepared()).toBe(true);
  });

  it('does not mark prepare complete when no fields were filled', async () => {
    document.body.innerHTML = `
      <section>
        <h2>Work Experience</h2>
      </section>
    `;

    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Engineer',
          company: 'Acme',
          startDate: '2020-01',
          endDate: '2023-01',
          current: false,
          description: '',
        },
      ],
      education: [],
      skills: [],
    };

    const promise = prepareRepeatablePage(profile, 'generic', document, {
      shouldRun: () => true,
      fillExperienceEntry: async () => 0,
      fillEducationEntry: async () => 0,
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(isRepeatablePagePrepared()).toBe(false);
  });

  it('skips generic repeatable field fills after prepare completes', async () => {
    document.body.innerHTML = `
      <section>
        <h2>Work Experience</h2>
        <section>
          <h3>Work Experience 1</h3>
          <input aria-label="Job Title" />
        </section>
      </section>
    `;

    const profile = {
      ...DEFAULT_PROFILE,
      experience: [
        {
          title: 'Prepared',
          company: 'Acme',
          startDate: '2020-01',
          endDate: '2023-01',
          current: false,
          description: '',
        },
      ],
      education: [],
      skills: [],
    };

    const promise = prepareRepeatablePage(profile, 'generic');
    await vi.runAllTimersAsync();
    await promise;

    const input = document.querySelector('input[aria-label="Job Title"]') as HTMLInputElement;
    const field: FormField = {
      element: input,
      label: 'Work Experience 1 > Job Title',
      type: 'text',
      sectionType: 'experience',
      sectionIndex: 0,
      profileKey: 'title',
      confidence: 1,
      filled: false,
      unknown: false,
    };

    input.value = 'Prepared';
    const result = fillFields([field], flattenProfile(profile), DEFAULT_SETTINGS, profile);
    expect(isRepeatablePagePrepared()).toBe(true);
    expect(result.skipped).toBe(1);
    expect(result.filled).toBe(0);
    expect(input.value).toBe('Prepared');
  });
});

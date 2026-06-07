/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureEntryCount,
  fillRepeatableEntriesSequential,
  getEntryContainers,
  waitForAddButtonEnabled,
  waitForEntryValidation,
} from '@/content/repeatableSections';

const FAST_DELAYS = {
  delays: {
    entrySettle: 0,
    addClick: 0,
    betweenSections: 0,
    skillItem: 0,
  },
  addButtonTimeoutMs: 3000,
  entryReadyTimeoutMs: 3000,
};

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

describe('repeatableSections', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockVisibleLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getEntryContainers discovers Workday UXI id-based entries', () => {
    document.body.innerHTML = `
      <div data-automation-id="applyFlowMyExpPage">
        <input id="workExperience-24--jobTitle" />
        <input id="workExperience-24--companyName" />
        <input id="workExperience-88--jobTitle" />
        <input id="workExperience-88--companyName" />
      </div>
    `;

    const containers = getEntryContainers('experience');
    expect(containers).toHaveLength(2);
  });

  it('getEntryContainers discovers entries from visible Work Experience 1 labels', () => {
    document.body.innerHTML = `
      <section>
        <h2>Work Experience</h2>
        <div><span>Work Experience 1</span><input aria-label="Job Title" /></div>
        <div><span>Work Experience 2</span><input aria-label="Job Title" /></div>
      </section>
    `;

    const containers = getEntryContainers('experience');
    expect(containers).toHaveLength(2);
  });

  it('getEntryContainers returns blocks by numbered headings', () => {
    document.body.innerHTML = `
      <section>
        <h3>Work Experience 1</h3>
        <input aria-label="Job Title" />
      </section>
      <section>
        <h3>Work Experience 2</h3>
        <input aria-label="Job Title" />
      </section>
    `;

    const containers = getEntryContainers('experience');
    expect(containers).toHaveLength(2);
  });

  it('getEntryContainers uses the education section root before numbered headings exist', () => {
    document.body.innerHTML = `
      <section>
        <h2>Education</h2>
        <input aria-label="School" />
      </section>
    `;

    expect(getEntryContainers('education')).toHaveLength(1);
  });

  it('ensureEntryCount clicks Add until desired blocks exist', async () => {
    document.body.innerHTML = `
      <section>
        <h2>Work Experience</h2>
        <button type="button" id="add">Add</button>
        <div id="entries">
          <section>
            <h3>Work Experience 1</h3>
          </section>
        </div>
      </section>
    `;

    const entries = document.getElementById('entries') as HTMLElement;
    document.getElementById('add')?.addEventListener('click', () => {
      const index = entries.children.length + 1;
      const block = document.createElement('section');
      block.innerHTML = `<h3>Work Experience ${index}</h3>`;
      entries.appendChild(block);
    });

    await ensureEntryCount('experience', 2);

    expect(getEntryContainers('experience')).toHaveLength(2);
  });

  it('fillRepeatableEntriesSequential unlocks gated Add buttons after filling', async () => {
    document.body.innerHTML = `
      <section>
        <h2>Work Experience</h2>
        <div id="entries">
          <section>
            <h3>Work Experience 1</h3>
            <input id="job1" aria-label="Job Title" />
          </section>
        </div>
        <button type="button" id="add" disabled>Add Another</button>
      </section>
    `;

    const entries = document.getElementById('entries') as HTMLElement;
    const addButton = document.getElementById('add') as HTMLButtonElement;
    const job1 = document.getElementById('job1') as HTMLInputElement;

    job1.addEventListener('input', () => {
      addButton.disabled = job1.value.trim().length === 0;
    });

    addButton.addEventListener('click', () => {
      const index = entries.querySelectorAll('section').length + 1;
      const block = document.createElement('section');
      block.innerHTML = `<h3>Work Experience ${index}</h3><input aria-label="Job Title" />`;
      entries.appendChild(block);
    });

    const profileEntries = [
      { title: 'Engineer', company: 'Acme' },
      { title: 'Lead', company: 'Beta' },
    ];

    const filled = await fillRepeatableEntriesSequential(
      'experience',
      profileEntries,
      (container, entry) => {
        const input = container.querySelector('input[aria-label="Job Title"]');
        if (input instanceof HTMLInputElement) {
          input.value = entry.title;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      },
      FAST_DELAYS,
    );

    expect(filled).toBe(2);
    expect(getEntryContainers('experience')).toHaveLength(2);
  });

  it('fillRepeatableEntriesSequential triggers Add for index 1 when only one entry exists', async () => {
    document.body.innerHTML = `
      <section>
        <h2>Work Experience</h2>
        <div id="entries">
          <section>
            <h3>Work Experience 1</h3>
            <input aria-label="Job Title" />
          </section>
        </div>
        <button type="button" id="add">Add Another</button>
      </section>
    `;

    const entries = document.getElementById('entries') as HTMLElement;
    document.getElementById('add')?.addEventListener('click', () => {
      const index = entries.querySelectorAll('section').length + 1;
      const block = document.createElement('section');
      block.innerHTML = `<h3>Work Experience ${index}</h3><input aria-label="Job Title" />`;
      entries.appendChild(block);
    });

    const filled = await fillRepeatableEntriesSequential(
      'experience',
      [{ title: 'First' }, { title: 'Second' }],
      (container, entry) => {
        const input = container.querySelector('input[aria-label="Job Title"]');
        if (input instanceof HTMLInputElement) {
          input.value = entry.title;
        }
      },
      FAST_DELAYS,
    );

    expect(filled).toBe(2);
    expect(getEntryContainers('experience')).toHaveLength(2);
  });

  it('waitForEntryValidation resolves when present fields are filled', async () => {
    document.body.innerHTML = `
      <section>
        <h3>Work Experience 1</h3>
        <input id="job1" aria-label="Job Title" value="Engineer" />
      </section>
    `;

    const validated = await waitForEntryValidation('experience', 0, 1000);
    expect(validated).toBe(true);
  });

  it('waitForAddButtonEnabled resolves after button becomes enabled', async () => {
    vi.useFakeTimers();

    document.body.innerHTML = `
      <section>
        <h2>Work Experience</h2>
        <input id="job1" aria-label="Job Title" />
        <button type="button" id="add" disabled>Add Another</button>
      </section>
    `;

    const addButton = document.getElementById('add') as HTMLButtonElement;
    const job1 = document.getElementById('job1') as HTMLInputElement;

    const promise = waitForAddButtonEnabled('experience', 5000);

    await vi.advanceTimersByTimeAsync(300);
    job1.value = 'Engineer';
    job1.dispatchEvent(new Event('input', { bubbles: true }));
    addButton.disabled = false;

    await vi.advanceTimersByTimeAsync(200);
    const button = await promise;

    expect(button?.id).toBe('add');
    vi.useRealTimers();
  });
});

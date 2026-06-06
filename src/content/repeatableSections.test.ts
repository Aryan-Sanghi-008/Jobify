/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureEntryCount,
  getEntryContainers,
} from '@/content/repeatableSections';

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

  it('ensureEntryCount clicks Add until desired blocks exist', async () => {
    document.body.innerHTML = `
      <section>
        <h2>Work Experience</h2>
        <button type="button" id="add">Add</button>
        <div id="entries"></div>
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
});

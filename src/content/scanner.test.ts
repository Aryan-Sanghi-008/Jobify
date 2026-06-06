/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SCAN_FIELDS,
  scanPageFieldsWithMeta,
} from '@/content/scanner';

function mockVisibleLayout(): void {
  vi.stubGlobal('location', { href: 'https://example.com/jobs/1' });

  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1280,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 800,
  });

  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        display: 'block',
        visibility: 'visible',
        opacity: '1',
        getPropertyValue: () => '',
      }) as unknown as CSSStyleDeclaration,
  );

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

function appendLabeledInput(
  parent: ParentNode,
  index: number,
  labelText = `Field ${index}`,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.id = `field-${index}`;
  input.name = `field-${index}`;
  input.setAttribute('aria-label', labelText);
  parent.appendChild(input);
  return input;
}

describe('scanPageFieldsWithMeta', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockVisibleLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('limits scanning to MAX_SCAN_FIELDS when page has many inputs', () => {
    for (let index = 0; index < MAX_SCAN_FIELDS + 10; index += 1) {
      appendLabeledInput(document.body, index);
    }

    const result = scanPageFieldsWithMeta();

    expect(result.totalCandidates).toBeGreaterThan(MAX_SCAN_FIELDS);
    expect(result.excessiveFieldCount).toBe(true);
    expect(result.fields.length).toBeLessThanOrEqual(MAX_SCAN_FIELDS);
  });

  it('adds composite labels and section context for repeatable blocks', () => {
    document.body.innerHTML = `
      <section>
        <h3>Work Experience 1</h3>
        <input type="text" aria-label="Job Title" />
      </section>
    `;

    const result = scanPageFieldsWithMeta();

    expect(result.fields[0]?.label).toBe('Work Experience 1 > Job Title');
    expect(result.fields[0]?.sectionType).toBe('experience');
    expect(result.fields[0]?.sectionIndex).toBe(0);
  });

  it('scopes queries to an explicit container root', () => {
    const form = document.createElement('form');
    const outside = document.createElement('div');
    document.body.append(form, outside);

    appendLabeledInput(form, 1, 'Inside Form');
    appendLabeledInput(outside, 2, 'Outside Form');

    const result = scanPageFieldsWithMeta(form);

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]?.label).toBe('Inside Form');
    expect(result.excessiveFieldCount).toBe(false);
  });
});

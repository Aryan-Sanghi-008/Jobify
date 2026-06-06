/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fillAriaRadioGroup, fillNativeRadioGroup, fillRadioControl } from '@/content/controls/radio';

describe('radio controls', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fillNativeRadioGroup selects a native radio option', () => {
    document.body.innerHTML = `
      <label><input type="radio" name="relocate" value="yes" /> Yes</label>
      <label><input type="radio" name="relocate" value="no" /> No</label>
    `;

    const firstRadio = document.querySelector('input[type="radio"]') as HTMLInputElement;
    const filled = fillNativeRadioGroup(firstRadio, 'yes');

    expect(filled).toBe(true);
    expect((document.querySelector('input[value="yes"]') as HTMLInputElement).checked).toBe(true);
  });

  it('fillAriaRadioGroup selects an ARIA radio option', () => {
    document.body.innerHTML = `
      <div role="radiogroup">
        <div role="radio" aria-checked="false">Yes</div>
        <div role="radio" aria-checked="false">No</div>
      </div>
    `;

    document.querySelectorAll('[role="radio"]').forEach((radio) => {
      radio.addEventListener('click', () => {
        document.querySelectorAll('[role="radio"]').forEach((option) => {
          option.setAttribute('aria-checked', 'false');
        });
        radio.setAttribute('aria-checked', 'true');
      });
    });

    const firstRadio = document.querySelector('[role="radio"]') as HTMLElement;
    const filled = fillAriaRadioGroup(firstRadio, 'No');

    expect(filled).toBe(true);
    expect(document.querySelectorAll('[role="radio"]')[1]?.getAttribute('aria-checked')).toBe('true');
  });

  it('fillRadioControl routes to ARIA radios', () => {
    document.body.innerHTML = `
      <div role="radiogroup">
        <div role="radio" aria-checked="false">Yes</div>
      </div>
    `;

    document.querySelector('[role="radio"]')?.addEventListener('click', (event) => {
      const radio = event.currentTarget as HTMLElement;
      radio.setAttribute('aria-checked', 'true');
    });

    const radio = document.querySelector('[role="radio"]') as HTMLElement;
    expect(fillRadioControl(radio, 'Yes')).toBe(true);
  });
});

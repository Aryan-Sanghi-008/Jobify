/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AutoLogger,
  isApplicationSubmitted,
  type AutoLoggerDeps,
} from '@/content/autoLogger';

const sendMessage = vi.fn();

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

function setPageText(text: string): void {
  document.body.innerHTML = `<main>${text}</main>`;
  Object.defineProperty(document.body, 'innerText', {
    configurable: true,
    get: () => text,
  });
}

function createDeps(overrides: Partial<AutoLoggerDeps> = {}): AutoLoggerDeps {
  return {
    getCoverLetterUsed: () => 'template-1',
    extractJobInfo: () => ({
      company: 'Acme Corp',
      role: 'Software Engineer',
      portal: 'greenhouse',
      url: 'https://boards.greenhouse.io/acme/jobs/123',
    }),
    ...overrides,
  };
}

describe('isApplicationSubmitted', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockVisibleLayout();
    history.replaceState({}, '', '/');
  });

  it('detects thank-you URL patterns', () => {
    history.replaceState({}, '', '/thank-you');
    expect(isApplicationSubmitted()).toBe(true);
  });

  it('detects Greenhouse confirmation URL', () => {
    history.replaceState({}, '', '/jobs/123/confirmation');
    expect(isApplicationSubmitted()).toBe(true);
  });

  it('detects success text on the page', () => {
    setPageText('Thank you for applying to this role.');
    expect(isApplicationSubmitted()).toBe(true);
  });

  it('detects Lever thank-you heading', () => {
    document.body.innerHTML = '<h1>Thank you</h1>';
    expect(isApplicationSubmitted()).toBe(true);
  });

  it('detects success text inside a modal', () => {
    document.body.innerHTML =
      '<div class="modal">Application submitted successfully</div>';
    expect(isApplicationSubmitted()).toBe(true);
  });
});

describe('AutoLogger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"></div>';
    mockVisibleLayout();
    history.replaceState({}, '', '/');
    sendMessage.mockReset();

    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          id: 'test-extension',
          sendMessage,
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sends LOG_APPLICATION with the expected payload shape', async () => {
    setPageText('Application submitted');
    const onLogged = vi.fn();
    const logger = new AutoLogger(createDeps({ onLogged }));

    logger.startWatching();
    await vi.advanceTimersByTimeAsync(300);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'LOG_APPLICATION',
      payload: expect.objectContaining({
        company: 'Acme Corp',
        role: 'Software Engineer',
        portal: 'greenhouse',
        url: 'https://boards.greenhouse.io/acme/jobs/123',
        status: 'applied',
        coverLetterUsed: 'template-1',
        appliedAt: expect.any(Number),
        id: expect.any(String),
      }),
    });
    expect(onLogged).toHaveBeenCalledTimes(1);
  });

  it('does not fire twice on the same page session', async () => {
    setPageText('Application submitted');
    const logger = new AutoLogger(createDeps());

    logger.startWatching();
    await vi.advanceTimersByTimeAsync(300);

    setPageText('Application submitted again');
    await vi.advanceTimersByTimeAsync(300);

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('skips logging when company and role are both empty', async () => {
    setPageText('Application submitted');
    const logger = new AutoLogger(
      createDeps({
        extractJobInfo: () => ({
          company: '',
          role: '',
          portal: 'generic',
          url: 'https://example.com/thank-you',
        }),
      }),
    );

    logger.startWatching();
    await vi.advanceTimersByTimeAsync(300);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

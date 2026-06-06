import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FormStateMachine,
  type FormStateMachineDeps,
} from '@/content/formStateMachine';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '@/shared/storage';
import type { FillResult, FormField, FormStatePayload } from '@/shared/types';

let observerOnNewPage: ((fields: FormField[]) => void) | null = null;

vi.mock('@/content/observer', () => ({
  FormObserver: class MockFormObserver {
    constructor(
      onNewPage: (fields: FormField[]) => void,
      _onFormComplete: () => void,
    ) {
      observerOnNewPage = onNewPage;
    }

    start(): void {}
    stop(): void {}
    checkNow(): void {}
  },
}));

function makeField(label: string): FormField {
  return {
    element: {} as HTMLElement,
    label,
    type: 'text',
    confidence: 0,
    filled: false,
    unknown: false,
  };
}

function emptyResult(overrides: Partial<FillResult> = {}): FillResult {
  return {
    filled: 0,
    skipped: 0,
    unknown: [],
    errors: [],
    ...overrides,
  };
}

function createMachine(overrides: Partial<FormStateMachineDeps> = {}) {
  const broadcasts: FormStatePayload[] = [];
  const nextButton = { click: vi.fn() } as unknown as HTMLButtonElement;

  const deps: FormStateMachineDeps = {
    scanFields: vi.fn(() => [makeField('Email')]),
    matchAndFill: vi.fn(() => emptyResult({ filled: 2 })),
    findNextButton: vi.fn(() => null),
    clickNext: vi.fn(),
    notifyComplete: vi.fn(),
    broadcastState: vi.fn((payload) => {
      broadcasts.push(payload);
    }),
    ...overrides,
  };

  const machine = new FormStateMachine(deps);

  return { machine, broadcasts, nextButton, deps };
}

describe('FormStateMachine', () => {
  beforeEach(() => {
    observerOnNewPage = null;
    vi.clearAllMocks();
  });

  it('transitions IDLE to WAITING_FOR_USER when unknown fields are detected', async () => {
    const { machine, broadcasts } = createMachine({
      matchAndFill: vi.fn(() =>
        emptyResult({
          filled: 1,
          unknown: [makeField('Custom question')],
        }),
      ),
    });

    const states: string[] = [];
    machine.onStateChange((state) => {
      states.push(state);
    });

    machine.start(DEFAULT_PROFILE, DEFAULT_SETTINGS);
    await vi.waitFor(() => {
      expect(machine.state).toBe('WAITING_FOR_USER');
    });

    expect(states).toEqual(['SCANNING', 'FILLING', 'WAITING_FOR_USER']);
    expect(machine.totalFilled).toBe(1);
    expect(machine.totalUnknown).toHaveLength(1);
    expect(broadcasts[broadcasts.length - 1]?.totalUnknown).toEqual(['Custom question']);
  });

  it('navigates to the next page when no unknowns and pause is disabled', async () => {
    const clickNext = vi.fn();
    const { machine, nextButton } = createMachine({
      findNextButton: vi.fn(() => nextButton),
      clickNext,
    });

    machine.start(DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, pauseBeforeSubmit: false });
    await vi.waitFor(() => {
      expect(machine.state).toBe('NAVIGATING');
    });

    expect(clickNext).toHaveBeenCalledWith(nextButton);
  });

  it('waits for user on the last page when pauseBeforeSubmit is enabled', async () => {
    const { machine } = createMachine({
      findNextButton: vi.fn(() => null),
    });

    machine.start(DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, pauseBeforeSubmit: true });
    await vi.waitFor(() => {
      expect(machine.state).toBe('WAITING_FOR_USER');
    });
  });

  it('completes when there are no unknowns and no next button', async () => {
    const notifyComplete = vi.fn();
    const { machine } = createMachine({
      findNextButton: vi.fn(() => null),
      notifyComplete,
    });

    machine.start(DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, pauseBeforeSubmit: false });
    await vi.waitFor(() => {
      expect(machine.state).toBe('COMPLETE');
    });

    expect(notifyComplete).toHaveBeenCalledTimes(1);
  });

  it('resumes from WAITING_FOR_USER via continue and navigates', async () => {
    const clickNext = vi.fn();
    let hasNextButton = false;
    const { machine, nextButton } = createMachine({
      matchAndFill: vi.fn(() =>
        emptyResult({
          filled: 1,
          unknown: [makeField('Visa status')],
        }),
      ),
      findNextButton: vi.fn(() => (hasNextButton ? nextButton : null)),
      clickNext,
    });

    machine.start(DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, pauseBeforeSubmit: false });
    await vi.waitFor(() => {
      expect(machine.state).toBe('WAITING_FOR_USER');
    });

    hasNextButton = true;
    machine.continue();

    await vi.waitFor(() => {
      expect(machine.state).toBe('NAVIGATING');
    });
  });

  it('completes when continue is called after pause on last page', async () => {
    const notifyComplete = vi.fn();
    const { machine } = createMachine({
      findNextButton: vi.fn(() => null),
      notifyComplete,
    });

    machine.start(DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, pauseBeforeSubmit: true });
    await vi.waitFor(() => {
      expect(machine.state).toBe('WAITING_FOR_USER');
    });

    machine.continue();

    expect(machine.state).toBe('COMPLETE');
    expect(notifyComplete).toHaveBeenCalledTimes(1);
  });

  it('rescans after observer detects a new page while navigating', async () => {
    const scanFields = vi
      .fn()
      .mockReturnValueOnce([makeField('Page 1')])
      .mockReturnValueOnce([makeField('Page 2')]);
    const matchAndFill = vi
      .fn()
      .mockReturnValueOnce(emptyResult({ filled: 1 }))
      .mockReturnValueOnce(emptyResult({ filled: 2 }));
    const findNextButton = vi
      .fn()
      .mockReturnValueOnce({ click: vi.fn() } as unknown as HTMLButtonElement)
      .mockReturnValueOnce(null);
    const { machine } = createMachine({
      scanFields,
      matchAndFill,
      findNextButton,
    });

    machine.start(DEFAULT_PROFILE, { ...DEFAULT_SETTINGS, pauseBeforeSubmit: false });
    await vi.waitFor(() => {
      expect(machine.state).toBe('NAVIGATING');
    });

    observerOnNewPage?.([makeField('Page 2')]);

    await vi.waitFor(() => {
      expect(machine.state).toBe('COMPLETE');
    });

    expect(machine.pageNumber).toBe(2);
    expect(machine.totalFilled).toBe(3);
  });

  it('transitions to ERROR when scan fails', async () => {
    const { machine, broadcasts } = createMachine({
      scanFields: vi.fn(() => {
        throw new Error('Scan failed');
      }),
    });

    machine.start(DEFAULT_PROFILE, DEFAULT_SETTINGS);
    await vi.waitFor(() => {
      expect(machine.state).toBe('ERROR');
    });

    expect(broadcasts[broadcasts.length - 1]?.errors).toContain('Scan failed');
  });

  it('resets to IDLE on stop', async () => {
    const { machine } = createMachine({
      matchAndFill: vi.fn(() =>
        emptyResult({
          filled: 1,
          unknown: [makeField('Question')],
        }),
      ),
    });

    machine.start(DEFAULT_PROFILE, DEFAULT_SETTINGS);
    await vi.waitFor(() => {
      expect(machine.state).toBe('WAITING_FOR_USER');
    });

    machine.stop();

    expect(machine.state).toBe('IDLE');
    expect(machine.pageNumber).toBe(1);
    expect(machine.totalFilled).toBe(0);
    expect(machine.totalUnknown).toHaveLength(0);
  });
});

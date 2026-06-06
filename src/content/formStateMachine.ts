import { FormObserver } from '@/content/observer';
import type {
  AppSettings,
  FillResult,
  FormField,
  FormState,
  FormStatePayload,
  UserProfile,
} from '@/shared/types';

export interface FormStateMachineDeps {
  scanFields: () => FormField[];
  matchAndFill: (fields: FormField[]) => FillResult;
  findNextButton: () => HTMLButtonElement | null;
  clickNext: (button: HTMLButtonElement) => void;
  notifyComplete: () => void;
  broadcastState: (payload: FormStatePayload) => void;
}

type StateChangeCallback = (state: FormState, data: FormStatePayload) => void;

function mergeUnknownFields(
  current: FormField[],
  incoming: FormField[],
): FormField[] {
  const seen = new Set(current.map((field) => field.label));
  const merged = [...current];

  for (const field of incoming) {
    if (!seen.has(field.label)) {
      seen.add(field.label);
      merged.push(field);
    }
  }

  return merged;
}

export class FormStateMachine {
  state: FormState = 'IDLE';
  pageNumber = 1;
  totalFilled = 0;
  totalUnknown: FormField[] = [];

  private readonly deps: FormStateMachineDeps;
  private observer: FormObserver | null = null;
  private settings: AppSettings | null = null;
  private pausedOnLastPage = false;
  private errors: string[] = [];
  private stateChangeCallbacks: StateChangeCallback[] = [];

  constructor(deps: FormStateMachineDeps) {
    this.deps = deps;
  }

  onStateChange(callback: StateChangeCallback): void {
    this.stateChangeCallbacks.push(callback);
  }

  start(profile: UserProfile, settings: AppSettings): void {
    void profile;
    this.stop();
    this.settings = settings;
    this.pageNumber = 1;
    this.totalFilled = 0;
    this.totalUnknown = [];
    this.errors = [];
    this.pausedOnLastPage = false;
    this.startObserver();
    void this.runPageCycle();
  }

  continue(): void {
    if (this.state !== 'WAITING_FOR_USER' || !this.settings) {
      return;
    }

    if (this.pausedOnLastPage) {
      this.transitionTo('COMPLETE');
      this.deps.notifyComplete();
      this.stopObserver();
      return;
    }

    this.totalUnknown = [];
    this.transitionTo('FILLING');
    void this.evaluateAfterFill();
  }

  stop(): void {
    this.stopObserver();
    this.settings = null;
    this.pausedOnLastPage = false;
    this.errors = [];
    this.pageNumber = 1;
    this.totalFilled = 0;
    this.totalUnknown = [];

    if (this.state !== 'IDLE') {
      this.transitionTo('IDLE');
    } else {
      this.state = 'IDLE';
    }
  }

  checkNow(): void {
    this.observer?.checkNow();
  }

  private startObserver(): void {
    this.stopObserver();
    this.observer = new FormObserver(
      (fields) => {
        void this.handleNewPage(fields);
      },
      () => {
        this.handleFormComplete();
      },
    );
    this.observer.start();
  }

  private stopObserver(): void {
    this.observer?.stop();
    this.observer = null;
  }

  private async runPageCycle(): Promise<void> {
    if (!this.settings) {
      return;
    }

    try {
      this.transitionTo('SCANNING');
      const fields = this.deps.scanFields();

      this.transitionTo('FILLING');
      const result = this.deps.matchAndFill(fields);
      this.totalFilled += result.filled;
      this.totalUnknown = mergeUnknownFields(this.totalUnknown, result.unknown);
      this.errors = [...this.errors, ...result.errors];

      await this.evaluateAfterFill(result);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async evaluateAfterFill(result?: FillResult): Promise<void> {
    if (!this.settings) {
      return;
    }

    const unknownCount = result?.unknown.length ?? this.totalUnknown.length;
    const nextButton = this.deps.findNextButton();

    if (unknownCount > 0) {
      this.pausedOnLastPage = false;
      this.transitionTo('WAITING_FOR_USER');
      return;
    }

    if (this.settings.pauseBeforeSubmit && !nextButton) {
      this.pausedOnLastPage = true;
      this.transitionTo('WAITING_FOR_USER');
      return;
    }

    if (nextButton && !this.settings.pauseBeforeSubmit) {
      this.transitionTo('NAVIGATING');
      this.deps.clickNext(nextButton);
      return;
    }

    this.transitionTo('COMPLETE');
    this.deps.notifyComplete();
    this.stopObserver();
  }

  private async handleNewPage(fields: FormField[]): Promise<void> {
    if (this.state !== 'NAVIGATING' || !this.settings) {
      return;
    }

    void fields;

    try {
      this.pageNumber += 1;
      this.pausedOnLastPage = false;
      await this.runPageCycle();
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleFormComplete(): void {
    if (this.state === 'IDLE' || this.state === 'COMPLETE' || this.state === 'ERROR') {
      return;
    }

    this.transitionTo('COMPLETE');
    this.deps.notifyComplete();
    this.stopObserver();
  }

  private handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.errors = [...this.errors, message];
    this.transitionTo('ERROR');
    this.stopObserver();
  }

  private buildPayload(): FormStatePayload {
    return {
      state: this.state,
      pageNumber: this.pageNumber,
      totalFilled: this.totalFilled,
      totalUnknown: this.totalUnknown.map((field) => field.label),
      errors: this.errors,
    };
  }

  private transitionTo(nextState: FormState): void {
    this.state = nextState;
    const payload = this.buildPayload();
    this.deps.broadcastState(payload);

    for (const callback of this.stateChangeCallbacks) {
      callback(nextState, payload);
    }
  }
}

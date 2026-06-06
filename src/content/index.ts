import { AutoLogger } from '@/content/autoLogger';
import { fillFieldWithValue, fillFields } from '@/content/filler';
import { FormStateMachine } from '@/content/formStateMachine';
import { matchFields } from '@/content/matcher';
import {
  scanForCoverLetterField,
  scanForNextButton,
  scanPageFields,
} from '@/content/scanner';
import { Logger } from '@/shared/logger';
import {
  assertRuntimeValid,
  createRateLimiter,
  validateContentMessage,
} from '@/shared/security';
import {
  flattenProfile,
  getCoverLetters,
  getLearnedFields,
  getProfile,
  getSettings,
  learnField,
} from '@/shared/storage';
import type {
  AppSettings,
  ContentScriptMessage,
  FillCoverLetterMessage,
  FillCoverLetterResponse,
  FillSingleFieldMessage,
  FillSingleFieldResponse,
  FlatProfile,
  FormField,
  FormStatePayload,
  LearnedField,
  LearnFieldMappingMessage,
  PageInfoResponse,
  PortalName,
  TriggerAutofillResponse,
  UserProfile,
} from '@/shared/types';
import {
  detectPortal,
  extractCompanyFromPage,
  extractJobTitleFromPage,
  interpolateCoverLetter,
  normalizeLabel,
  simulateUserInput,
} from '@/shared/utils';

const triggerAutofillLimiter = createRateLimiter({
  maxRequests: 3,
  windowMs: 30_000,
});

(function initJobAutofill(): void {
  const globalWindow = window as Window & {
    __jobAutofillInitialized?: boolean;
  };

  if (globalWindow.__jobAutofillInitialized) {
    return;
  }

  globalWindow.__jobAutofillInitialized = true;

  let lastProfile: UserProfile | null = null;
  let lastFlatProfile: FlatProfile | null = null;
  let lastSettings: AppSettings | null = null;
  let lastLearnedFields: Record<string, LearnedField> = {};
  let lastCoverLetterTemplateId: string | undefined;

  function broadcastFormState(payload: FormStatePayload): void {
    try {
      assertRuntimeValid();
      void chrome.runtime.sendMessage({
        type: 'FORM_STATE_CHANGED',
        payload,
      });
    } catch (error) {
      Logger.warn('Content', 'Failed to broadcast form state', error);
    }
  }

  const autoLogger = new AutoLogger({
    getCoverLetterUsed: () => lastCoverLetterTemplateId,
    extractJobInfo: () => ({
      company: extractCompanyFromPage(),
      role: extractJobTitleFromPage(),
      portal: detectPortal(window.location.href),
      url: window.location.href,
    }),
  });

  const formStateMachine = new FormStateMachine({
    scanFields: () => scanPageFields(),
    matchAndFill: (fields: FormField[]) => {
      if (!lastProfile || !lastFlatProfile || !lastSettings) {
        throw new Error('Autofill context is not initialized');
      }

      const matchedFields = matchFields(fields, lastProfile, lastLearnedFields);
      return fillFields(matchedFields, lastFlatProfile, lastSettings);
    },
    findNextButton: () => scanForNextButton(),
    clickNext: (button: HTMLButtonElement) => {
      button.click();
    },
    notifyComplete: () => {},
    broadcastState: broadcastFormState,
  });

  function showUserToast(message: string): void {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:2147483647',
      'max-width:320px',
      'padding:12px 16px',
      'border-radius:8px',
      'background:#111827',
      'color:#F9FAFB',
      'font:14px/1.4 system-ui,sans-serif',
      'box-shadow:0 10px 25px rgba(0,0,0,0.25)',
    ].join(';');

    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3000);
  }

  async function handleTriggerAutofill(): Promise<TriggerAutofillResponse> {
    assertRuntimeValid();

    if (triggerAutofillLimiter.isLimited()) {
      Logger.warn('Content', 'TRIGGER_AUTOFILL rate limit exceeded');
      return {
        filled: 0,
        skipped: 0,
        unknown: [],
        errors: ['Autofill rate limit exceeded. Please wait before trying again.'],
      };
    }

    const [profile, settings, learnedFields] = await Promise.all([
      getProfile(),
      getSettings(),
      getLearnedFields(),
    ]);

    if (profile === null || profile.personal.email.trim() === '') {
      return { type: 'PROFILE_INCOMPLETE' };
    }

    lastProfile = profile;
    lastSettings = settings;
    lastLearnedFields = learnedFields;
    lastFlatProfile = flattenProfile(profile);

    formStateMachine.start(profile, settings);

    return { type: 'AUTOFILL_STARTED' };
  }

  function handleContinueAutofill(): { success: true } {
    formStateMachine.continue();
    return { success: true };
  }

  function handleStopAutofill(): { success: true } {
    formStateMachine.stop();
    return { success: true };
  }

  async function handleFillCoverLetter(
    message: FillCoverLetterMessage,
  ): Promise<FillCoverLetterResponse> {
    assertRuntimeValid();

    const field = scanForCoverLetterField();

    if (!(field instanceof HTMLTextAreaElement)) {
      return { success: false, field_found: false };
    }

    const [profile, settings, coverLetters] = await Promise.all([
      getProfile(),
      getSettings(),
      getCoverLetters(),
    ]);

    const templateId = message.templateId ?? settings.defaultCoverLetterId;
    const template =
      coverLetters.find((letter) => letter.id === templateId) ??
      coverLetters[0];

    if (!template) {
      return { success: false, field_found: true };
    }

    const content = interpolateCoverLetter(template.body, {
      company_name: extractCompanyFromPage(),
      job_title: extractJobTitleFromPage(),
      your_name: profile?.personal.fullName ?? '',
    });

    simulateUserInput(field, content);
    lastCoverLetterTemplateId = template.id;

    return { success: true, field_found: true };
  }

  function handleGetPageInfo(): PageInfoResponse {
    return {
      company: extractCompanyFromPage(),
      jobTitle: extractJobTitleFromPage(),
      portal: detectPortal(window.location.href),
    };
  }

  async function handleLearnFieldMapping(
    message: LearnFieldMappingMessage,
  ): Promise<{ success: true }> {
    assertRuntimeValid();

    await learnField(
      message.labelHash,
      message.profileKey,
      message.normalizedLabel,
      window.location.href,
    );
    lastLearnedFields = await getLearnedFields();
    showUserToast(`Saved mapping for "${message.profileKey}".`);
    return { success: true };
  }

  function findFieldByLabel(label: string): FormField | null {
    const normalizedTarget = normalizeLabel(label);
    const fields = scanPageFields();

    return (
      fields.find((field) => normalizeLabel(field.label) === normalizedTarget) ??
      null
    );
  }

  function handleFillSingleField(
    message: FillSingleFieldMessage,
  ): FillSingleFieldResponse {
    const field = findFieldByLabel(message.label);

    if (!field) {
      return { success: false, field_found: false };
    }

    const success = fillFieldWithValue(field, message.value);
    return { success, field_found: true };
  }

  function handleCheckFormProgress(): { success: true } {
    formStateMachine.checkNow();
    return { success: true };
  }

  async function handleContentMessage(
    message: ContentScriptMessage,
  ): Promise<unknown> {
    assertRuntimeValid();

    switch (message.type) {
      case 'TRIGGER_AUTOFILL':
        return handleTriggerAutofill();
      case 'CONTINUE_AUTOFILL':
        return handleContinueAutofill();
      case 'STOP_AUTOFILL':
        return handleStopAutofill();
      case 'FILL_COVER_LETTER':
        return handleFillCoverLetter(message);
      case 'GET_PAGE_INFO':
        return handleGetPageInfo();
      case 'LEARN_FIELD_MAPPING':
        return handleLearnFieldMapping(message);
      case 'FILL_SINGLE_FIELD':
        return handleFillSingleField(message);
      case 'CHECK_FORM_PROGRESS':
        return handleCheckFormProgress();
      default: {
        const exhaustiveCheck: never = message;
        throw new Error(`Unhandled content message: ${String(exhaustiveCheck)}`);
      }
    }
  }

  async function notifyPortalDetected(portal: PortalName): Promise<void> {
    if (portal === 'generic') {
      return;
    }

    try {
      assertRuntimeValid();
      await chrome.runtime.sendMessage({
        type: 'PORTAL_DETECTED',
        portal,
      });
    } catch (error) {
      Logger.warn('Content', 'Failed to notify portal detection', error);
    }
  }

  async function pingBackground(): Promise<void> {
    try {
      assertRuntimeValid();
      await chrome.runtime.sendMessage({ type: 'PING' });
    } catch (error) {
      Logger.warn('Content', 'Background ping failed', error);
    }
  }

  async function initialize(): Promise<void> {
    assertRuntimeValid();
    await Logger.refreshDebugMode();

    const portal = detectPortal(window.location.href);
    await pingBackground();
    await notifyPortalDetected(portal);
    autoLogger.startWatching();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) {
      return;
    }

    if (!validateContentMessage(message)) {
      sendResponse({
        success: false,
        error: 'Invalid message',
      });
      return;
    }

    void handleContentMessage(message)
      .then((response) => sendResponse(response))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });

    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }

    const nextSettings = changes.settings?.newValue as { debugMode?: boolean } | undefined;
    if (typeof nextSettings?.debugMode === 'boolean') {
      Logger.setDebugMode(nextSettings.debugMode);
    }
  });

  void initialize();
})();

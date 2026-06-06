import { AutoLogger } from '@/content/autoLogger';
import type { FormStateMachine } from '@/content/formStateMachine';
import { Logger } from '@/shared/logger';
import {
  assertRuntimeValid,
  createRateLimiter,
  validateContentMessage,
} from '@/shared/security';
import {
  flattenProfile,
  getAutofillData,
  getCoverLetters,
  getProfile,
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

const EXCESSIVE_FIELDS_WARNING =
  'This page has an unusual number of fields — autofill may be slow.';

const triggerAutofillLimiter = createRateLimiter({
  maxRequests: 3,
  windowMs: 30_000,
});

interface AutofillModules {
  scanPageFields: typeof import('@/content/scanner').scanPageFields;
  scanPageFieldsWithMeta: typeof import('@/content/scanner').scanPageFieldsWithMeta;
  scanForNextButton: typeof import('@/content/scanner').scanForNextButton;
  scanForCoverLetterField: typeof import('@/content/scanner').scanForCoverLetterField;
  matchFields: typeof import('@/content/matcher').matchFields;
  fillFields: typeof import('@/content/filler').fillFields;
  fillFieldWithValue: typeof import('@/content/filler').fillFieldWithValue;
  invalidateLearnedFieldsCache: typeof import('@/content/matcher').invalidateLearnedFieldsCache;
  FormStateMachine: typeof import('@/content/formStateMachine').FormStateMachine;
}

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
  let autofillModules: AutofillModules | null = null;
  let formStateMachine: FormStateMachine | null = null;
  let excessiveFieldsWarned = false;

  async function loadAutofillModules(): Promise<AutofillModules> {
    if (autofillModules) {
      return autofillModules;
    }

    const [scanner, filler, matcher, formStateMachineModule] = await Promise.all([
      import('@/content/scanner'),
      import('@/content/filler'),
      import('@/content/matcher'),
      import('@/content/formStateMachine'),
    ]);

    autofillModules = {
      scanPageFields: scanner.scanPageFields,
      scanPageFieldsWithMeta: scanner.scanPageFieldsWithMeta,
      scanForNextButton: scanner.scanForNextButton,
      scanForCoverLetterField: scanner.scanForCoverLetterField,
      matchFields: matcher.matchFields,
      fillFields: filler.fillFields,
      fillFieldWithValue: filler.fillFieldWithValue,
      invalidateLearnedFieldsCache: matcher.invalidateLearnedFieldsCache,
      FormStateMachine: formStateMachineModule.FormStateMachine,
    };

    return autofillModules;
  }

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

  async function ensureFormStateMachine(): Promise<FormStateMachine> {
    const modules = await loadAutofillModules();

    if (!formStateMachine) {
      formStateMachine = new modules.FormStateMachine({
        scanFields: () => {
          const scanResult = modules.scanPageFieldsWithMeta();

          if (scanResult.excessiveFieldCount && !excessiveFieldsWarned) {
            excessiveFieldsWarned = true;
            showUserToast(EXCESSIVE_FIELDS_WARNING);
          }

          return scanResult.fields;
        },
        matchAndFill: (fields: FormField[]) => {
          if (!lastProfile || !lastFlatProfile || !lastSettings) {
            throw new Error('Autofill context is not initialized');
          }

          const matchedFields = modules.matchFields(
            fields,
            lastProfile,
            lastLearnedFields,
          );
          return modules.fillFields(matchedFields, lastFlatProfile, lastSettings);
        },
        findNextButton: () => modules.scanForNextButton(),
        clickNext: (button: HTMLButtonElement) => {
          button.click();
        },
        notifyComplete: () => {},
        broadcastState: broadcastFormState,
      });
    }

    return formStateMachine;
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

  function deactivateAutofill(): void {
    formStateMachine?.stop();
    formStateMachine = null;
    excessiveFieldsWarned = false;
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

    const { profile, settings, learnedFields } = await getAutofillData();

    if (profile === null || profile.personal.email.trim() === '') {
      return { type: 'PROFILE_INCOMPLETE' };
    }

    lastProfile = profile;
    lastSettings = settings;
    lastLearnedFields = learnedFields;
    lastFlatProfile = flattenProfile(profile);
    excessiveFieldsWarned = false;

    const fsm = await ensureFormStateMachine();
    fsm.start(profile, settings);

    return { type: 'AUTOFILL_STARTED' };
  }

  async function handleContinueAutofill(): Promise<{ success: true }> {
    const fsm = await ensureFormStateMachine();
    fsm.continue();
    return { success: true };
  }

  function handleStopAutofill(): { success: true } {
    deactivateAutofill();
    return { success: true };
  }

  async function getPageContext(): Promise<{
    company: string;
    jobTitle: string;
  }> {
    const stored = await chrome.storage.session.get('pageContextByUrl');
    const overrides = (
      stored.pageContextByUrl as
        | Record<string, { company?: string; jobTitle?: string }>
        | undefined
    )?.[window.location.href];

    return {
      company: overrides?.company?.trim() || extractCompanyFromPage(),
      jobTitle: overrides?.jobTitle?.trim() || extractJobTitleFromPage(),
    };
  }

  async function handleFillCoverLetter(
    message: FillCoverLetterMessage,
  ): Promise<FillCoverLetterResponse> {
    assertRuntimeValid();

    const { scanForCoverLetterField } = await loadAutofillModules();
    const field = scanForCoverLetterField();

    if (!(field instanceof HTMLTextAreaElement)) {
      return { success: false, field_found: false };
    }

    const [profile, settings, coverLetters] = await Promise.all([
      getProfile(),
      getAutofillData().then((data) => data.settings),
      getCoverLetters(),
    ]);

    const templateId = message.templateId ?? settings.defaultCoverLetterId;
    const template =
      coverLetters.find((letter) => letter.id === templateId) ??
      coverLetters[0];

    if (!template) {
      return { success: false, field_found: true };
    }

    const pageContext = await getPageContext();
    const content = interpolateCoverLetter(template.body, {
      company_name: pageContext.company,
      job_title: pageContext.jobTitle,
      your_name: profile?.personal.fullName ?? '',
    });

    simulateUserInput(field, content);
    lastCoverLetterTemplateId = template.id;

    return { success: true, field_found: true };
  }

  async function handleGetPageInfo(): Promise<PageInfoResponse> {
    const pageContext = await getPageContext();

    return {
      company: pageContext.company,
      jobTitle: pageContext.jobTitle,
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

    const { learnedFields } = await getAutofillData();
    lastLearnedFields = learnedFields;

    const { invalidateLearnedFieldsCache } = await loadAutofillModules();
    invalidateLearnedFieldsCache();

    showUserToast(`Saved mapping for "${message.profileKey}".`);
    return { success: true };
  }

  async function findFieldByLabel(label: string): Promise<FormField | null> {
    const { scanPageFields } = await loadAutofillModules();
    const normalizedTarget = normalizeLabel(label);
    const fields = scanPageFields();

    return (
      fields.find((field) => normalizeLabel(field.label) === normalizedTarget) ??
      null
    );
  }

  async function handleFillSingleField(
    message: FillSingleFieldMessage,
  ): Promise<FillSingleFieldResponse> {
    const [field, { fillFieldWithValue }] = await Promise.all([
      findFieldByLabel(message.label),
      loadAutofillModules(),
    ]);

    if (!field) {
      return { success: false, field_found: false };
    }

    const success = fillFieldWithValue(field, message.value);
    return { success, field_found: true };
  }

  async function handleCheckFormProgress(): Promise<{ success: true }> {
    const fsm = await ensureFormStateMachine();
    fsm.checkNow();
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

  window.addEventListener('pagehide', () => {
    deactivateAutofill();
  });

  void initialize();
})();

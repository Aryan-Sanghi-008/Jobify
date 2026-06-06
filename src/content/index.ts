import { fillFieldWithValue, fillFields } from '@/content/filler';
import { matchFields } from '@/content/matcher';
import { FormObserver } from '@/content/observer';
import {
  scanForCoverLetterField,
  scanPageFields,
} from '@/content/scanner';
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
  ContentMessageType,
  ContentScriptMessage,
  FillCoverLetterMessage,
  FillCoverLetterResponse,
  FillResult,
  FillSingleFieldMessage,
  FillSingleFieldResponse,
  FlatProfile,
  FormField,
  LearnFieldMappingMessage,
  PageInfoResponse,
  PortalName,
  SerializableFillResult,
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

const CONTENT_MESSAGE_TYPES: ContentMessageType[] = [
  'TRIGGER_AUTOFILL',
  'FILL_COVER_LETTER',
  'GET_PAGE_INFO',
  'LEARN_FIELD_MAPPING',
  'FILL_SINGLE_FIELD',
  'CHECK_FORM_PROGRESS',
];

(function initJobAutofill(): void {
  const globalWindow = window as Window & {
    __jobAutofillInitialized?: boolean;
  };

  if (globalWindow.__jobAutofillInitialized) {
    return;
  }

  globalWindow.__jobAutofillInitialized = true;

  let formObserver: FormObserver | null = null;
  let lastProfile: UserProfile | null = null;
  let lastFlatProfile: FlatProfile | null = null;
  let lastSettings: AppSettings | null = null;
  let lastLearnedFields: Record<string, string> = {};

  function assertRuntimeValid(): void {
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function validateContentMessage(
    message: unknown,
  ): message is ContentScriptMessage {
    if (!isRecord(message) || typeof message.type !== 'string') {
      return false;
    }

    if (!CONTENT_MESSAGE_TYPES.includes(message.type as ContentMessageType)) {
      return false;
    }

    switch (message.type) {
      case 'TRIGGER_AUTOFILL':
      case 'GET_PAGE_INFO':
        return true;
      case 'FILL_COVER_LETTER':
        return (
          message.templateId === undefined ||
          typeof message.templateId === 'string'
        );
      case 'LEARN_FIELD_MAPPING':
        return (
          typeof message.labelHash === 'string' &&
          typeof message.profileKey === 'string'
        );
      case 'FILL_SINGLE_FIELD':
        return (
          typeof message.label === 'string' && typeof message.value === 'string'
        );
      case 'CHECK_FORM_PROGRESS':
        return true;
      default:
        return false;
    }
  }

  function serializeFillResult(result: FillResult): SerializableFillResult {
    return {
      filled: result.filled,
      skipped: result.skipped,
      unknown: result.unknown.map((field) => field.label),
      errors: result.errors,
    };
  }

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

  async function refillKnownFields(fields: FormField[]): Promise<void> {
    if (!lastProfile || !lastFlatProfile || !lastSettings) {
      return;
    }

    const matched = matchFields(fields, lastProfile, lastLearnedFields);
    const knownFields = matched.filter(
      (field) => !field.unknown && field.profileKey !== null,
    );

    if (knownFields.length === 0) {
      return;
    }

    fillFields(knownFields, lastFlatProfile, lastSettings);
  }

  function startFormObserver(): void {
    formObserver?.stop();
    formObserver = new FormObserver(
      (fields) => {
        void refillKnownFields(fields);
      },
      () => {
        try {
          assertRuntimeValid();
          void chrome.runtime.sendMessage({
            type: 'APPLICATION_COMPLETE',
            payload: {
              company: extractCompanyFromPage(),
              role: extractJobTitleFromPage(),
              portal: detectPortal(window.location.href),
              url: window.location.href,
            },
          });
        } catch (error) {
          console.warn('[JobAutofill Content] Failed to report completion:', error);
        }
      },
    );
    formObserver.start();
  }

  async function handleTriggerAutofill(): Promise<TriggerAutofillResponse> {
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

    const scannedFields = scanPageFields();
    const matchedFields = matchFields(scannedFields, profile, learnedFields);
    const result = fillFields(matchedFields, lastFlatProfile, settings);

    startFormObserver();

    return serializeFillResult(result);
  }

  async function handleFillCoverLetter(
    message: FillCoverLetterMessage,
  ): Promise<FillCoverLetterResponse> {
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
    await learnField(message.labelHash, message.profileKey);
    lastLearnedFields[message.labelHash] = message.profileKey;
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
    formObserver?.checkNow();
    return { success: true };
  }

  async function handleContentMessage(
    message: ContentScriptMessage,
  ): Promise<unknown> {
    switch (message.type) {
      case 'TRIGGER_AUTOFILL':
        return handleTriggerAutofill();
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
      console.warn('[JobAutofill Content] Failed to notify portal detection:', error);
    }
  }

  async function pingBackground(): Promise<void> {
    try {
      assertRuntimeValid();
      await chrome.runtime.sendMessage({ type: 'PING' });
    } catch (error) {
      console.warn('[JobAutofill Content] Background ping failed:', error);
    }
  }

  async function initialize(): Promise<void> {
    const portal = detectPortal(window.location.href);
    await pingBackground();
    await notifyPortalDetected(portal);
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

  void initialize();
})();

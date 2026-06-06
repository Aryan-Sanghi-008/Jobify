import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AutofillStartedResponse,
  FillCoverLetterResponse,
  FillSingleFieldResponse,
  FormStateChangedMessage,
  FormStatePayload,
  PageInfoResponse,
  PopupFillResult,
  PortalName,
  ProfileIncompleteResponse,
  TriggerAutofillResponse,
} from '@/shared/types';
import {
  buildPageInfoFromTabUrl,
  isAutofillablePage,
  isValidPageInfoResponse,
} from '@/shared/pageInfo';
import { saveLastFillResult } from '@/shared/storage';
import { hashString, normalizeLabel } from '@/shared/utils';

export interface UnknownFieldEntry {
  label: string;
  value: string;
  saveToProfile: boolean;
}

const MESSAGE_TIMEOUT_MS = 5000;
const PAGE_INFO_RETRY_DELAY_MS = 400;
const PAGE_INFO_MAX_ATTEMPTS = 4;
const ACTIVE_FORM_STATES = new Set<FormStatePayload['state']>([
  'SCANNING',
  'FILLING',
  'NAVIGATING',
]);

const ERROR_RESULT = (message: string): PopupFillResult => ({
  filled: 0,
  skipped: 0,
  unknown: [],
  errors: [message],
});

function isProfileIncompleteResponse(
  response: TriggerAutofillResponse,
): response is ProfileIncompleteResponse {
  return 'type' in response && response.type === 'PROFILE_INCOMPLETE';
}

function isAutofillStartedResponse(
  response: TriggerAutofillResponse,
): response is AutofillStartedResponse {
  return 'type' in response && response.type === 'AUTOFILL_STARTED';
}

function isFormStateChangedMessage(message: unknown): message is FormStateChangedMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'FORM_STATE_CHANGED' &&
    'payload' in message &&
    typeof message.payload === 'object' &&
    message.payload !== null
  );
}

function payloadToLastResult(payload: FormStatePayload): PopupFillResult {
  return {
    filled: payload.totalFilled,
    skipped: 0,
    unknown: payload.totalUnknown,
    errors: payload.errors,
  };
}

/**
 * Sends a message to a tab's content script with a 5-second timeout.
 */
export function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('Message timeout'));
    }, MESSAGE_TIMEOUT_MS);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      window.clearTimeout(timer);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response as T);
    });
  });
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function injectContentScript(tabId: number): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const files = manifest.content_scripts?.[0]?.js;

  if (!files?.length) {
    throw new Error('Content script not configured');
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchPageInfo(): Promise<PageInfoResponse | null> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_ACTIVE_TAB_PAGE_INFO',
    });
    if (isValidPageInfoResponse(response)) {
      return response;
    }
  } catch {
    // Fall back to direct tab messaging below.
  }

  for (let attempt = 0; attempt < PAGE_INFO_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await sendToActiveTab<unknown>({ type: 'GET_PAGE_INFO' });
      if (isValidPageInfoResponse(response)) {
        return response;
      }
    } catch {
      if (attempt < PAGE_INFO_MAX_ATTEMPTS - 1) {
        await delay(PAGE_INFO_RETRY_DELAY_MS);
      }
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    return buildPageInfoFromTabUrl(tab.url);
  }

  return null;
}

async function sendToActiveTab<T>(message: unknown): Promise<T> {
  const tabId = await getActiveTabId();

  if (tabId === null) {
    throw new Error('No active tab');
  }

  let lastError = new Error('Failed to reach content script');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await sendTabMessage<T>(tabId, message);
    } catch (error) {
      lastError = error instanceof Error ? error : lastError;

      try {
        await injectContentScript(tabId);
        await delay(250 * (attempt + 1));
      } catch {
        // Continue retrying the message even if injection fails.
      }
    }
  }

  throw lastError;
}

export interface UseExtensionResult {
  pageInfo: { company: string; jobTitle: string; portal: PortalName } | null;
  isJobPage: boolean;
  isFilling: boolean;
  formState: FormStatePayload | null;
  lastResult: PopupFillResult | null;
  triggerAutofill: () => Promise<void>;
  continueAutofill: () => Promise<void>;
  fillCoverLetter: (templateId: string) => Promise<void>;
  learnFieldMapping: (
    labelHash: string,
    profileKey: string,
    normalizedLabel: string,
  ) => Promise<void>;
  fillSingleField: (fieldLabel: string, value: string) => Promise<FillSingleFieldResponse>;
  checkFormProgress: () => Promise<void>;
  fillAllUnknownFields: (entries: UnknownFieldEntry[]) => Promise<void>;
}

export function useExtension(): UseExtensionResult {
  const [pageInfo, setPageInfo] = useState<PageInfoResponse | null>(null);
  const [formState, setFormState] = useState<FormStatePayload | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [lastResult, setLastResult] = useState<PopupFillResult | null>(null);

  const isJobPage = pageInfo !== null && isAutofillablePage(pageInfo);
  const isFilling =
    isStarting ||
    (formState !== null && ACTIVE_FORM_STATES.has(formState.state));

  const persistLastResult = useCallback((result: PopupFillResult) => {
    setLastResult(result);
    void saveLastFillResult(result);
  }, []);

  useEffect(() => {
    void fetchPageInfo().then((info) => setPageInfo(info));
  }, []);

  useEffect(() => {
    const handleRuntimeMessage = (message: unknown) => {
      if (!isFormStateChangedMessage(message)) {
        return;
      }

      const payload = message.payload;
      setFormState(payload);
      setIsStarting(false);

      if (
        payload.state === 'WAITING_FOR_USER' ||
        payload.state === 'COMPLETE' ||
        payload.state === 'ERROR'
      ) {
        persistLastResult(payloadToLastResult(payload));
      }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, [persistLastResult]);

  const triggerAutofill = useCallback(async () => {
    setIsStarting(true);
    setFormState(null);
    setLastResult(null);

    try {
      const response = await sendToActiveTab<TriggerAutofillResponse>({
        type: 'TRIGGER_AUTOFILL',
      });

      if (isProfileIncompleteResponse(response)) {
        persistLastResult(ERROR_RESULT('Profile incomplete — add your email in Profile'));
        setIsStarting(false);
        return;
      }

      if (!isAutofillStartedResponse(response)) {
        if (
          typeof response === 'object' &&
          response !== null &&
          'filled' in response &&
          'skipped' in response &&
          'unknown' in response &&
          'errors' in response
        ) {
          persistLastResult(response);
        } else {
          persistLastResult(ERROR_RESULT('Unexpected autofill response'));
        }
        setIsStarting(false);
      }
    } catch (error) {
      persistLastResult(
        ERROR_RESULT(error instanceof Error ? error.message : 'Unknown error'),
      );
      setIsStarting(false);
    }
  }, [persistLastResult]);

  const continueAutofill = useCallback(async () => {
    try {
      await sendToActiveTab<{ success: true }>({ type: 'CONTINUE_AUTOFILL' });
    } catch (error) {
      persistLastResult(
        ERROR_RESULT(error instanceof Error ? error.message : 'Failed to continue autofill'),
      );
    }
  }, [persistLastResult]);

  const fillCoverLetter = useCallback(async (templateId: string) => {
    try {
      await sendToActiveTab<FillCoverLetterResponse>({
        type: 'FILL_COVER_LETTER',
        templateId,
      });
    } catch {
      // Caller may handle via UI feedback in a later prompt.
    }
  }, []);

  const learnFieldMapping = useCallback(
    async (labelHash: string, profileKey: string, normalizedLabel: string) => {
      try {
        await sendToActiveTab<{ success: true }>({
          type: 'LEARN_FIELD_MAPPING',
          labelHash,
          profileKey,
          normalizedLabel,
        });
      } catch {
        // Caller may handle via UI feedback in a later prompt.
      }
    },
    [],
  );

  const fillSingleField = useCallback(async (fieldLabel: string, value: string) => {
    try {
      return await sendToActiveTab<FillSingleFieldResponse>({
        type: 'FILL_SINGLE_FIELD',
        label: fieldLabel,
        value,
      });
    } catch {
      return { success: false, field_found: false };
    }
  }, []);

  const checkFormProgress = useCallback(async () => {
    try {
      await sendToActiveTab<{ success: true }>({ type: 'CHECK_FORM_PROGRESS' });
    } catch {
      // Non-fatal if observer is inactive.
    }
  }, []);

  const fillAllUnknownFields = useCallback(
    async (entries: UnknownFieldEntry[]) => {
      for (const entry of entries) {
        if (!entry.value.trim()) {
          continue;
        }

        if (entry.saveToProfile) {
          await learnFieldMapping(
            hashString(normalizeLabel(entry.label)),
            entry.value.trim(),
            normalizeLabel(entry.label),
          );
        }

        await fillSingleField(entry.label, entry.value.trim());
      }

      await continueAutofill();
    },
    [continueAutofill, fillSingleField, learnFieldMapping],
  );

  return useMemo(
    () => ({
      pageInfo,
      isJobPage,
      isFilling,
      formState,
      lastResult,
      triggerAutofill,
      continueAutofill,
      fillCoverLetter,
      learnFieldMapping,
      fillSingleField,
      checkFormProgress,
      fillAllUnknownFields,
    }),
    [
      pageInfo,
      isJobPage,
      isFilling,
      formState,
      lastResult,
      triggerAutofill,
      continueAutofill,
      fillCoverLetter,
      learnFieldMapping,
      fillSingleField,
      checkFormProgress,
      fillAllUnknownFields,
    ],
  );
}

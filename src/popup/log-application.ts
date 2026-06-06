import { sanitizeString } from '@/shared/security';
import type { JobApplication, PortalName } from '@/shared/types';
import { detectPortal, generateId } from '@/shared/utils';

interface PendingManualLog {
  tabId: number;
  url: string;
  portal: PortalName;
  company: string;
  role: string;
}

function getFormElements(): {
  form: HTMLFormElement;
  companyInput: HTMLInputElement;
  roleInput: HTMLInputElement;
  submitButton: HTMLButtonElement;
  errorText: HTMLParagraphElement;
} {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root element not found');
  }

  root.innerHTML = `
    <form class="form">
      <h1>Log application</h1>
      <p class="hint">Add this job to your tracker.</p>
      <label>
        <span>Company</span>
        <input id="company" type="text" required />
      </label>
      <label>
        <span>Role</span>
        <input id="role" type="text" required />
      </label>
      <p id="error" class="error" hidden></p>
      <button id="submit" type="submit">Log application</button>
    </form>
  `;

  const style = document.createElement('style');
  style.textContent = `
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #fff;
      color: #111827;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
    h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: #6b7280;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      font-weight: 500;
      color: #374151;
    }
    input {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 14px;
    }
    input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 1px #3b82f6;
    }
    .error {
      margin: 0;
      font-size: 12px;
      color: #dc2626;
    }
    button {
      border: none;
      border-radius: 8px;
      background: #2563eb;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      padding: 10px 12px;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.7;
      cursor: default;
    }
  `;
  document.head.appendChild(style);

  const form = root.querySelector('form');
  const companyInput = root.querySelector('#company');
  const roleInput = root.querySelector('#role');
  const submitButton = root.querySelector('#submit');
  const errorText = root.querySelector('#error');

  if (
    !(form instanceof HTMLFormElement) ||
    !(companyInput instanceof HTMLInputElement) ||
    !(roleInput instanceof HTMLInputElement) ||
    !(submitButton instanceof HTMLButtonElement) ||
    !(errorText instanceof HTMLParagraphElement)
  ) {
    throw new Error('Form elements not found');
  }

  return { form, companyInput, roleInput, submitButton, errorText };
}

async function loadPendingManualLog(): Promise<PendingManualLog | null> {
  const stored = await chrome.storage.session.get('pendingManualLog');
  const pending = stored.pendingManualLog;

  if (
    !pending ||
    typeof pending !== 'object' ||
    typeof pending.tabId !== 'number' ||
    typeof pending.url !== 'string'
  ) {
    return null;
  }

  return {
    tabId: pending.tabId,
    url: pending.url,
    portal:
      typeof pending.portal === 'string'
        ? (pending.portal as PortalName)
        : detectPortal(pending.url),
    company: typeof pending.company === 'string' ? pending.company : '',
    role: typeof pending.role === 'string' ? pending.role : '',
  };
}

async function submitManualLog(
  pending: PendingManualLog,
  company: string,
  role: string,
): Promise<void> {
  const application: JobApplication = {
    id: generateId(),
    company: sanitizeString(company),
    role: sanitizeString(role),
    portal: pending.portal,
    url: pending.url,
    appliedAt: Date.now(),
    status: 'applied',
    notes: 'Logged manually from context menu',
  };

  const response = await chrome.runtime.sendMessage({
    type: 'LOG_APPLICATION',
    payload: application,
  });

  if (!response || response.success !== true) {
    throw new Error(
      typeof response?.error === 'string' ? response.error : 'Could not log application',
    );
  }

  await chrome.storage.session.remove('pendingManualLog');
  window.close();
}

async function initialize(): Promise<void> {
  const { form, companyInput, roleInput, submitButton, errorText } =
    getFormElements();
  const pending = await loadPendingManualLog();

  if (!pending) {
    errorText.hidden = false;
    errorText.textContent = 'No application details found. Close and try again.';
    submitButton.disabled = true;
    return;
  }

  companyInput.value = pending.company;
  roleInput.value = pending.role;
  companyInput.focus();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorText.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Logging…';

    void submitManualLog(pending, companyInput.value, roleInput.value).catch(
      (error: unknown) => {
        submitButton.disabled = false;
        submitButton.textContent = 'Log application';
        errorText.hidden = false;
        errorText.textContent =
          error instanceof Error ? error.message : 'Could not log application';
      },
    );
  });
}

void initialize();

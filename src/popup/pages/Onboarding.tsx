import { useState } from 'react';
import Spinner from '@/popup/components/Spinner';
import {
  validateCtc,
  validateEmail,
  validateNoticePeriod,
  validatePhone,
} from '@/shared/security';
import {
  DEFAULT_PROFILE,
  getProfile,
  saveCoverLetter,
  saveProfile,
  saveSettings,
} from '@/shared/storage';
import type { CoverLetterTemplate, UserProfile } from '@/shared/types';
import { generateId } from '@/shared/utils';

const TOTAL_STEPS = 4;

const STARTER_COVER_LETTER = `Dear Hiring Team at {{company_name}},

I'm excited to apply for the {{job_title}} position. With my background and passion for building great products, I believe I would be a strong fit for your team.

Thank you for your consideration.

Sincerely,
{{your_name}}`;

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-gray-700';
const ERROR_CLASS = 'mt-1 text-xs text-red-600';

interface ProfileDraft {
  email: string;
  fullName: string;
  phone: string;
  currentCTC: string;
  expectedCTC: string;
  noticePeriod: string;
}

interface CoverLetterDraft {
  name: string;
  body: string;
}

interface OnboardingProps {
  onComplete: () => void;
}

function parseNumberInput(value: string): number {
  if (value.trim() === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { firstName: '', lastName: '' };
  }

  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

function buildProfileFromDraft(draft: ProfileDraft): UserProfile {
  const { firstName, lastName } = splitFullName(draft.fullName);

  return {
    ...DEFAULT_PROFILE,
    personal: {
      ...DEFAULT_PROFILE.personal,
      email: draft.email.trim(),
      fullName: draft.fullName.trim(),
      firstName,
      lastName,
      phone: draft.phone.trim(),
    },
    professional: {
      ...DEFAULT_PROFILE.professional,
      currentCTC: parseNumberInput(draft.currentCTC),
      expectedCTC: parseNumberInput(draft.expectedCTC),
      noticePeriod: parseNumberInput(draft.noticePeriod),
    },
  };
}

function validateProfileDraft(draft: ProfileDraft): Record<string, string> {
  const errors: Record<string, string> = {};

  const emailError = validateEmail(draft.email);
  if (emailError) {
    errors.email = emailError;
  }

  if (!draft.fullName.trim()) {
    errors.fullName = 'Full name is required';
  }

  const phoneError = validatePhone(draft.phone);
  if (phoneError) {
    errors.phone = phoneError;
  }

  const currentCtc = parseNumberInput(draft.currentCTC);
  const currentCtcError = validateCtc(currentCtc, 'Current CTC');
  if (currentCtcError) {
    errors.currentCTC = currentCtcError;
  }

  const expectedCtc = parseNumberInput(draft.expectedCTC);
  const expectedCtcError = validateCtc(expectedCtc, 'Expected CTC');
  if (expectedCtcError) {
    errors.expectedCTC = expectedCtcError;
  }

  const noticePeriod = parseNumberInput(draft.noticePeriod);
  const noticeError = validateNoticePeriod(noticePeriod);
  if (noticeError) {
    errors.noticePeriod = noticeError;
  }

  return errors;
}

async function completeOnboarding(): Promise<void> {
  await saveSettings({ onboardingComplete: true });
}

interface ProgressIndicatorProps {
  step: number;
}

function ProgressIndicator({ step }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: TOTAL_STEPS }, (_, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === step;
        const isComplete = stepNumber < step;

        return (
          <div
            key={stepNumber}
            className={`h-2 rounded-full transition-all ${
              isActive
                ? 'w-8 bg-blue-600'
                : isComplete
                  ? 'w-2 bg-blue-400'
                  : 'w-2 bg-gray-200'
            }`}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    email: '',
    fullName: '',
    phone: '',
    currentCTC: '',
    expectedCTC: '',
    noticePeriod: '',
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [coverLetterDraft, setCoverLetterDraft] = useState<CoverLetterDraft>({
    name: 'Default cover letter',
    body: STARTER_COVER_LETTER,
  });
  const [coverLetterErrors, setCoverLetterErrors] = useState<{
    name?: string;
    body?: string;
  }>({});

  const updateProfileDraft = (updates: Partial<ProfileDraft>) => {
    setProfileDraft((current) => ({ ...current, ...updates }));
    setProfileErrors({});
  };

  const handleSaveProfile = async () => {
    const errors = validateProfileDraft(profileDraft);
    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      return;
    }

    setIsSaving(true);

    try {
      const existing = await getProfile();
      const profile = buildProfileFromDraft(profileDraft);

      if (existing) {
        profile.education = existing.education;
        profile.experience = existing.experience;
        profile.skills = existing.skills;
        profile.languages = existing.languages;
        profile.professional = {
          ...existing.professional,
          ...profile.professional,
        };
        profile.personal = {
          ...existing.personal,
          ...profile.personal,
        };
      }

      await saveProfile(profile);
      setStep(3);
    } catch {
      setProfileErrors({ email: 'Could not save profile. Check your entries.' });
    } finally {
      setIsSaving(false);
    }
  };

  const validateCoverLetterDraft = (): boolean => {
    const nextErrors: { name?: string; body?: string } = {};
    const trimmedName = coverLetterDraft.name.trim();
    const trimmedBody = coverLetterDraft.body.trim();

    if (!trimmedName) {
      nextErrors.name = 'Template name is required';
    }

    if (trimmedBody.length < 50) {
      nextErrors.body = 'Cover letter must be at least 50 characters';
    }

    setCoverLetterErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSaveCoverLetter = async () => {
    if (!validateCoverLetterDraft()) {
      return;
    }

    setIsSaving(true);

    try {
      const now = Date.now();
      const template: CoverLetterTemplate = {
        id: generateId(),
        name: coverLetterDraft.name.trim(),
        body: coverLetterDraft.body,
        createdAt: now,
        updatedAt: now,
      };

      await saveCoverLetter(template);
      await saveSettings({ defaultCoverLetterId: template.id });
      setStep(4);
    } catch {
      setCoverLetterErrors({ body: 'Could not save cover letter.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkipCoverLetter = () => {
    setStep(4);
  };

  const handleFinish = async () => {
    setIsSaving(true);

    try {
      await completeOnboarding();
      onComplete();
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenLinkedInJobs = async () => {
    setIsSaving(true);

    try {
      await chrome.tabs.create({ url: 'https://www.linkedin.com/jobs/' });
      await completeOnboarding();
      onComplete();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="popup-panel flex h-[600px] max-h-[600px] w-[380px] min-w-[360px] flex-col overflow-hidden">
      <header className="border-b border-gray-200 px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Jobify setup
          </p>
          <p className="text-xs text-gray-400">
            Step {step} of {TOTAL_STEPS}
          </p>
        </div>
        <ProgressIndicator step={step} />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Save hours on job applications
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Set up Jobify once and fly through application forms.
              </p>
            </div>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="text-blue-600">•</span>
                <span>Auto-fill any job form</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600">•</span>
                <span>
                  Works on LinkedIn, Naukri, Wellfound, Instahyre, and more
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600">•</span>
                <span>
                  Your data stays local — never sent to any server
                </span>
              </li>
            </ul>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Build your profile
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                The 6 fields that appear on every application.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                You can add more later.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className={LABEL_CLASS} htmlFor="onboarding-email">
                  Email
                </label>
                <input
                  id="onboarding-email"
                  type="email"
                  value={profileDraft.email}
                  onChange={(event) =>
                    updateProfileDraft({ email: event.target.value })
                  }
                  className={INPUT_CLASS}
                  placeholder="you@example.com"
                />
                {profileErrors.email ? (
                  <p className={ERROR_CLASS}>{profileErrors.email}</p>
                ) : null}
              </div>

              <div>
                <label className={LABEL_CLASS} htmlFor="onboarding-full-name">
                  Full name
                </label>
                <input
                  id="onboarding-full-name"
                  type="text"
                  value={profileDraft.fullName}
                  onChange={(event) =>
                    updateProfileDraft({ fullName: event.target.value })
                  }
                  className={INPUT_CLASS}
                  placeholder="Jane Doe"
                />
                {profileErrors.fullName ? (
                  <p className={ERROR_CLASS}>{profileErrors.fullName}</p>
                ) : null}
              </div>

              <div>
                <label className={LABEL_CLASS} htmlFor="onboarding-phone">
                  Phone
                </label>
                <input
                  id="onboarding-phone"
                  type="tel"
                  value={profileDraft.phone}
                  onChange={(event) =>
                    updateProfileDraft({ phone: event.target.value })
                  }
                  className={INPUT_CLASS}
                  placeholder="+91 98765 43210"
                />
                {profileErrors.phone ? (
                  <p className={ERROR_CLASS}>{profileErrors.phone}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS} htmlFor="onboarding-current-ctc">
                    Current CTC (LPA)
                  </label>
                  <input
                    id="onboarding-current-ctc"
                    type="number"
                    min="0"
                    step="0.1"
                    value={profileDraft.currentCTC}
                    onChange={(event) =>
                      updateProfileDraft({ currentCTC: event.target.value })
                    }
                    className={INPUT_CLASS}
                    placeholder="12"
                  />
                  {profileErrors.currentCTC ? (
                    <p className={ERROR_CLASS}>{profileErrors.currentCTC}</p>
                  ) : null}
                </div>

                <div>
                  <label
                    className={LABEL_CLASS}
                    htmlFor="onboarding-expected-ctc"
                  >
                    Expected CTC (LPA)
                  </label>
                  <input
                    id="onboarding-expected-ctc"
                    type="number"
                    min="0"
                    step="0.1"
                    value={profileDraft.expectedCTC}
                    onChange={(event) =>
                      updateProfileDraft({ expectedCTC: event.target.value })
                    }
                    className={INPUT_CLASS}
                    placeholder="18"
                  />
                  {profileErrors.expectedCTC ? (
                    <p className={ERROR_CLASS}>{profileErrors.expectedCTC}</p>
                  ) : null}
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS} htmlFor="onboarding-notice">
                  Notice period (days)
                </label>
                <input
                  id="onboarding-notice"
                  type="number"
                  min="0"
                  value={profileDraft.noticePeriod}
                  onChange={(event) =>
                    updateProfileDraft({ noticePeriod: event.target.value })
                  }
                  className={INPUT_CLASS}
                  placeholder="30"
                />
                {profileErrors.noticePeriod ? (
                  <p className={ERROR_CLASS}>{profileErrors.noticePeriod}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Add a cover letter
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Use variables like {'{{company_name}}'} and {'{{job_title}}'} —
                we&apos;ll fill them in per application.
              </p>
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="onboarding-cover-name">
                Template name
              </label>
              <input
                id="onboarding-cover-name"
                type="text"
                value={coverLetterDraft.name}
                onChange={(event) => {
                  setCoverLetterDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }));
                  setCoverLetterErrors({});
                }}
                className={INPUT_CLASS}
              />
              {coverLetterErrors.name ? (
                <p className={ERROR_CLASS}>{coverLetterErrors.name}</p>
              ) : null}
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="onboarding-cover-body">
                Cover letter
              </label>
              <textarea
                id="onboarding-cover-body"
                value={coverLetterDraft.body}
                onChange={(event) => {
                  setCoverLetterDraft((current) => ({
                    ...current,
                    body: event.target.value,
                  }));
                  setCoverLetterErrors({});
                }}
                rows={10}
                className={`${INPUT_CLASS} resize-y`}
              />
              {coverLetterErrors.body ? (
                <p className={ERROR_CLASS}>{coverLetterErrors.body}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                You&apos;re ready!
              </h2>
              <p className="mt-2 text-sm text-gray-600">Go apply for a job!</p>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
              <li>Open a job listing</li>
              <li>Click the extension icon</li>
              <li>Hit Auto-fill</li>
            </ol>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-gray-200 px-4 py-4">
        {step === 1 ? (
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Get started
          </button>
        ) : null}

        {step === 2 ? (
          <button
            type="button"
            onClick={() => void handleSaveProfile()}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
          >
            {isSaving ? (
              <>
                <Spinner size="sm" className="text-white" />
                <span>Saving…</span>
              </>
            ) : (
              <span>Save and continue</span>
            )}
          </button>
        ) : null}

        {step === 3 ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handleSaveCoverLetter()}
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
            >
              {isSaving ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  <span>Saving…</span>
                </>
              ) : (
                <span>Save and continue</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleSkipCoverLetter}
              disabled={isSaving}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-70"
            >
              Skip for now
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handleOpenLinkedInJobs()}
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
            >
              {isSaving ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  <span>Opening…</span>
                </>
              ) : (
                <span>Open LinkedIn Jobs</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={isSaving}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-70"
            >
              Close
            </button>
          </div>
        ) : null}
      </footer>
    </div>
  );
}

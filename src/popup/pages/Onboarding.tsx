import { useRef, useState, type ChangeEvent } from 'react';
import Spinner from '@/popup/components/Spinner';
import {
  ensureProfileLibrary,
  parseFlexibleProfileImport,
  replaceActiveProfileFromImport,
} from '@/shared/profileLibrary';
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
const REQUIRED_MARK_CLASS = 'ml-0.5 text-red-600';

const ONBOARDING_PROFILE_FIELDS: Array<keyof ProfileDraft> = [
  'email',
  'fullName',
  'phone',
  'currentCTC',
  'expectedCTC',
  'noticePeriod',
];

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

function profileToDraft(profile: UserProfile): ProfileDraft {
  return {
    email: profile.personal.email.trim(),
    fullName: profile.personal.fullName.trim(),
    phone: profile.personal.phone.trim(),
    currentCTC:
      profile.professional.currentCTC > 0
        ? String(profile.professional.currentCTC)
        : '',
    expectedCTC:
      profile.professional.expectedCTC > 0
        ? String(profile.professional.expectedCTC)
        : '',
    noticePeriod: String(profile.professional.noticePeriod),
  };
}

function validateOnboardingProfileDraft(
  draft: ProfileDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};

  const emailError = validateEmail(draft.email);
  if (emailError) {
    errors.email = emailError;
  }

  if (!draft.fullName.trim()) {
    errors.fullName = 'Full name is required';
  }

  if (!draft.phone.trim()) {
    errors.phone = 'Phone is required';
  } else {
    const phoneError = validatePhone(draft.phone);
    if (phoneError) {
      errors.phone = phoneError;
    }
  }

  if (!draft.currentCTC.trim()) {
    errors.currentCTC = 'Current CTC is required';
  } else {
    const currentCtcError = validateCtc(
      parseNumberInput(draft.currentCTC),
      'Current CTC',
    );
    if (currentCtcError) {
      errors.currentCTC = currentCtcError;
    }
  }

  if (!draft.expectedCTC.trim()) {
    errors.expectedCTC = 'Expected CTC is required';
  } else {
    const expectedCtcError = validateCtc(
      parseNumberInput(draft.expectedCTC),
      'Expected CTC',
    );
    if (expectedCtcError) {
      errors.expectedCTC = expectedCtcError;
    }
  }

  if (!draft.noticePeriod.trim()) {
    errors.noticePeriod = 'Notice period is required';
  } else {
    const noticeError = validateNoticePeriod(parseNumberInput(draft.noticePeriod));
    if (noticeError) {
      errors.noticePeriod = noticeError;
    }
  }

  return errors;
}

function isOnboardingProfileComplete(draft: ProfileDraft): boolean {
  return Object.keys(validateOnboardingProfileDraft(draft)).length === 0;
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

function RequiredMark({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }

  return (
    <span className={REQUIRED_MARK_CLASS} aria-hidden="true">
      *
    </span>
  );
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const profileImportInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [mandatoryFields, setMandatoryFields] = useState<Set<keyof ProfileDraft>>(
    () => new Set(ONBOARDING_PROFILE_FIELDS),
  );
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
    setProfileDraft((current) => {
      const next = { ...current, ...updates };
      setProfileErrors((errors) => {
        const nextErrors = { ...errors };
        for (const field of Object.keys(updates) as Array<keyof ProfileDraft>) {
          delete nextErrors[field];
        }
        return nextErrors;
      });
      setMandatoryFields((currentMandatory) => {
        const nextMandatory = new Set(currentMandatory);
        for (const field of Object.keys(updates) as Array<keyof ProfileDraft>) {
          nextMandatory.delete(field);
        }
        return nextMandatory;
      });
      return next;
    });
  };

  const handleImportProfileFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const partial = parseFlexibleProfileImport(parsed);

      if (!partial) {
        setImportError(
          'Invalid profile file. Include at least one supported section.',
        );
        return;
      }

      if (!partial.profile) {
        setImportError('Import must include profile data to continue setup.');
        return;
      }

      await ensureProfileLibrary();
      await replaceActiveProfileFromImport(partial);

      const draft = profileToDraft(partial.profile);

      if (isOnboardingProfileComplete(draft)) {
        await completeOnboarding();
        onComplete();
        return;
      }

      const errors = validateOnboardingProfileDraft(draft);
      setProfileDraft(draft);
      setProfileErrors(errors);
      setMandatoryFields(
        new Set(Object.keys(errors) as Array<keyof ProfileDraft>),
      );
      setStep(2);
    } catch {
      setImportError('Could not read or parse the profile file.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveProfile = async () => {
    const errors = validateOnboardingProfileDraft(profileDraft);
    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      setMandatoryFields(
        new Set(Object.keys(errors) as Array<keyof ProfileDraft>),
      );
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
      <input
        ref={profileImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleImportProfileFile(event)}
      />

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
                <span>
                  Auto-fill job forms — including Workday, Greenhouse, and Lever
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600">•</span>
                <span>
                  Handles searchable dropdowns, repeatable experience/education
                  sections, and radio groups
                </span>
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
                  Remembers tricky answers with learned fields over time
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600">•</span>
                <span>
                  Track applications, discover roles, and view analytics in the
                  extension
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600">•</span>
                <span>
                  Save and switch between multiple profiles — import JSON
                  bundles in Settings
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600">•</span>
                <span>
                  Your data stays local — never sent to any server
                </span>
              </li>
            </ul>
            {importError ? (
              <p className="text-xs text-red-600">{importError}</p>
            ) : null}
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
                You can add more later, or{' '}
                <button
                  type="button"
                  onClick={() => profileImportInputRef.current?.click()}
                  disabled={isImporting}
                  className="font-medium text-blue-600 hover:text-blue-700 disabled:opacity-70"
                >
                  import an existing JSON profile
                </button>
                .
              </p>
              {mandatoryFields.size > 0 && mandatoryFields.size < ONBOARDING_PROFILE_FIELDS.length ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Some details were missing from your import. Complete the
                  required fields below to continue.
                </p>
              ) : null}
              {importError ? (
                <p className="mt-2 text-xs text-red-600">{importError}</p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div>
                <label className={LABEL_CLASS} htmlFor="onboarding-email">
                  Email
                  <RequiredMark show={mandatoryFields.has('email')} />
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
                  <RequiredMark show={mandatoryFields.has('fullName')} />
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
                  <RequiredMark show={mandatoryFields.has('phone')} />
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
                    <RequiredMark show={mandatoryFields.has('currentCTC')} />
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
                    <RequiredMark show={mandatoryFields.has('expectedCTC')} />
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
                  <RequiredMark show={mandatoryFields.has('noticePeriod')} />
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
              <li>Hit Auto-fill — or press Alt+Shift+F on the page</li>
            </ol>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Good to know
              </p>
              <ul className="mt-2 space-y-2 text-sm text-gray-700">
                <li className="flex gap-2">
                  <span className="text-blue-600">•</span>
                  <span>
                    Saved profiles in Settings let you import JSON and switch
                    identities without re-entering data
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600">•</span>
                  <span>
                    Use Tracker to log applications and Discover to browse
                    matching roles
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600">•</span>
                  <span>
                    Unknown form fields can be saved as learned fields and
                    auto-filled next time
                  </span>
                </li>
              </ul>
            </div>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-gray-200 px-4 py-4">
        {step === 1 ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Get started
            </button>
            <button
              type="button"
              onClick={() => profileImportInputRef.current?.click()}
              disabled={isImporting}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-70"
            >
              {isImporting ? (
                <>
                  <Spinner size="sm" className="text-gray-500" />
                  <span>Importing…</span>
                </>
              ) : (
                <span>Import existing profile</span>
              )}
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={isSaving || isImporting}
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
              onClick={() => profileImportInputRef.current?.click()}
              disabled={isSaving || isImporting}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-70"
            >
              {isImporting ? (
                <>
                  <Spinner size="sm" className="text-gray-500" />
                  <span>Importing…</span>
                </>
              ) : (
                <span>Import existing profile</span>
              )}
            </button>
          </div>
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

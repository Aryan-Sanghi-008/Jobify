import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import Spinner from '@/popup/components/Spinner';
import { useToast } from '@/popup/components/Toast';
import { DEFAULT_PROFILE, getProfile, saveProfile } from '@/shared/storage';
import type {
  EducationEntry,
  ExperienceEntry,
  UserProfile,
} from '@/shared/types';

type SectionId =
  | 'personal'
  | 'professional'
  | 'education'
  | 'experience'
  | 'skills';

type FieldErrors = Record<string, string>;

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'personal', label: 'Personal Info' },
  { id: 'professional', label: 'Professional Info' },
  { id: 'education', label: 'Education' },
  { id: 'experience', label: 'Experience' },
  { id: 'skills', label: 'Skills & Languages' },
];

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-gray-700';
const ERROR_CLASS = 'mt-1 text-xs text-red-600';

function mergeProfile(stored: UserProfile | null): UserProfile {
  if (!stored) {
    return structuredClone(DEFAULT_PROFILE);
  }

  return {
    personal: { ...DEFAULT_PROFILE.personal, ...stored.personal },
    professional: { ...DEFAULT_PROFILE.professional, ...stored.professional },
    education: stored.education ?? [],
    experience: stored.experience ?? [],
    skills: stored.skills ?? [],
    languages: stored.languages ?? [],
  };
}

function validateEmail(value: string): string | null {
  if (!value.trim()) {
    return 'Email is required';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return 'Enter a valid email address';
  }

  return null;
}

function validateOptionalUrl(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'URL must start with http:// or https://';
    }
    return null;
  } catch {
    return 'Enter a valid URL';
  }
}

function validateNonNegativeNumber(
  value: number,
  label: string,
  allowZero = true,
): string | null {
  if (Number.isNaN(value)) {
    return `${label} must be a number`;
  }

  if (value < 0) {
    return `${label} cannot be negative`;
  }

  if (!allowZero && value === 0) {
    return `${label} must be greater than 0`;
  }

  return null;
}

function validateGraduationYear(value: number): string | null {
  const numberError = validateNonNegativeNumber(value, 'Graduation year');
  if (numberError) {
    return numberError;
  }

  if (value !== 0 && (value < 1950 || value > 2100)) {
    return 'Enter a valid graduation year';
  }

  return null;
}

function parsePreferredLocations(text: string): string[] {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createEducationEntry(): EducationEntry {
  return {
    degree: '',
    field: '',
    institution: '',
    graduationYear: 0,
    percentage: '',
  };
}

function createExperienceEntry(): ExperienceEntry {
  return {
    title: '',
    company: '',
    startDate: '',
    endDate: '',
    current: false,
    description: '',
  };
}

function formatNumberInput(value: number): string {
  return value === 0 ? '' : String(value);
}

function parseNumberInput(value: string): number {
  if (value.trim() === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

interface FormFieldProps {
  label: string;
  error?: string;
  children: ReactNode;
}

function FormField({ label, error, children }: FormFieldProps) {
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      {children}
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  );
}

interface TagInputProps {
  label: string;
  tags: string[];
  placeholder: string;
  onChange: (tags: string[]) => void;
  onPersist: (tags: string[]) => void;
}

function TagInput({ label, tags, placeholder, onChange, onPersist }: TagInputProps) {
  const [draft, setDraft] = useState('');

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || tags.includes(trimmed)) {
      return;
    }

    const next = [...tags, trimmed];
    onChange(next);
    onPersist(next);
  };

  const removeTag = (tag: string) => {
    const next = tags.filter((item) => item !== tag);
    onChange(next);
    onPersist(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag(draft);
      setDraft('');
    }
  };

  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <div className="rounded-md border border-gray-300 px-2 py-2 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="rounded-full text-blue-500 hover:text-blue-800"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (draft.trim()) {
                addTag(draft);
                setDraft('');
              }
            }}
            placeholder={placeholder}
            className="min-w-[120px] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none focus:ring-0"
          />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">Press Enter to add</p>
    </div>
  );
}

interface AccordionSectionProps {
  id: SectionId;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function AccordionSection({
  label,
  isOpen,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <section className="border-b border-gray-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
      >
        <span>{label}</span>
        <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {isOpen ? <div className="space-y-4 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    () => new Set(['personal']),
  );
  const [preferredLocationsText, setPreferredLocationsText] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const profileRef = useRef(profile);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  profileRef.current = profile;

  const updateProfile = useCallback((updater: (current: UserProfile) => UserProfile) => {
    setProfile((current) => {
      const next = updater(current);
      profileRef.current = next;
      return next;
    });
  }, []);

  const clearFieldError = useCallback((fieldKey: string) => {
    setErrors((current) => {
      if (!(fieldKey in current)) {
        return current;
      }

      const { [fieldKey]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const persistProfile = useCallback(async () => {
    await saveProfile(profileRef.current);
    showToast('Saved', 'success');
  }, [showToast]);

  const handleValidatedBlur = useCallback(
    async (fieldKey: string, error: string | null) => {
      if (error) {
        setErrors((current) => ({ ...current, [fieldKey]: error }));
        return;
      }

      clearFieldError(fieldKey);
      await persistProfile();
    },
    [clearFieldError, persistProfile],
  );

  useEffect(() => {
    void (async () => {
      const stored = await getProfile();
      const merged = mergeProfile(stored);
      setProfile(merged);
      profileRef.current = merged;
      setPreferredLocationsText(merged.professional.preferredLocations.join(', '));
      setIsLoading(false);
    })();
  }, []);

  const toggleSection = (sectionId: SectionId) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const updatePersonal = (key: keyof UserProfile['personal'], value: string) => {
    updateProfile((current) => ({
      ...current,
      personal: { ...current.personal, [key]: value },
    }));
  };

  const updateProfessional = <K extends keyof UserProfile['professional']>(
    key: K,
    value: UserProfile['professional'][K],
  ) => {
    updateProfile((current) => ({
      ...current,
      professional: { ...current.professional, [key]: value },
    }));
  };

  const updateEducation = (
    index: number,
    key: keyof EducationEntry,
    value: EducationEntry[keyof EducationEntry],
  ) => {
    updateProfile((current) => ({
      ...current,
      education: current.education.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [key]: value } : entry,
      ),
    }));
  };

  const updateExperience = (
    index: number,
    key: keyof ExperienceEntry,
    value: ExperienceEntry[keyof ExperienceEntry],
  ) => {
    updateProfile((current) => ({
      ...current,
      experience: current.experience.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [key]: value } : entry,
      ),
    }));
  };

  const addEducation = async () => {
    updateProfile((current) => ({
      ...current,
      education: [...current.education, createEducationEntry()],
    }));
    await persistProfile();
  };

  const removeEducation = async (index: number) => {
    updateProfile((current) => ({
      ...current,
      education: current.education.filter((_, entryIndex) => entryIndex !== index),
    }));
    await persistProfile();
  };

  const addExperience = async () => {
    updateProfile((current) => ({
      ...current,
      experience: [...current.experience, createExperienceEntry()],
    }));
    await persistProfile();
  };

  const removeExperience = async (index: number) => {
    updateProfile((current) => ({
      ...current,
      experience: current.experience.filter((_, entryIndex) => entryIndex !== index),
    }));
    await persistProfile();
  };

  const handleResumeSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrors((current) => ({
        ...current,
        resume: 'Only PDF files are supported',
      }));
      return;
    }

    clearFieldError('resume');

    // Phase 3: parse PDF with pdfjs-dist and populate profile fields.
    showToast('Resume parsed', 'success');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" className="text-blue-600" />
      </div>
    );
  }

  return (
    <div className="relative pb-4">
      <div className="border-b border-gray-200 px-4 py-3">
        <input
          ref={resumeInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => void handleResumeSelect(event)}
        />
        <button
          type="button"
          onClick={() => resumeInputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
        >
          Resume Upload (PDF)
        </button>
        {errors.resume ? <p className={`${ERROR_CLASS} mt-2`}>{errors.resume}</p> : null}
        <p className="mt-1 text-[11px] text-gray-500">
          Upload a PDF to auto-populate your profile (parser coming in Phase 3)
        </p>
      </div>

      {SECTIONS.map((section) => (
        <AccordionSection
          key={section.id}
          id={section.id}
          label={section.label}
          isOpen={openSections.has(section.id)}
          onToggle={() => toggleSection(section.id)}
        >
          {section.id === 'personal' ? (
            <div className="grid grid-cols-1 gap-3">
              <FormField label="Full Name" error={errors['personal.fullName']}>
                <input
                  type="text"
                  value={profile.personal.fullName}
                  onChange={(event) => updatePersonal('fullName', event.target.value)}
                  onBlur={() => void handleValidatedBlur('personal.fullName', null)}
                  className={INPUT_CLASS}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="First Name" error={errors['personal.firstName']}>
                  <input
                    type="text"
                    value={profile.personal.firstName}
                    onChange={(event) => updatePersonal('firstName', event.target.value)}
                    onBlur={() => void handleValidatedBlur('personal.firstName', null)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="Last Name" error={errors['personal.lastName']}>
                  <input
                    type="text"
                    value={profile.personal.lastName}
                    onChange={(event) => updatePersonal('lastName', event.target.value)}
                    onBlur={() => void handleValidatedBlur('personal.lastName', null)}
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>
              <FormField label="Email" error={errors['personal.email']}>
                <input
                  type="email"
                  value={profile.personal.email}
                  onChange={(event) => updatePersonal('email', event.target.value)}
                  onBlur={() =>
                    void handleValidatedBlur(
                      'personal.email',
                      validateEmail(profileRef.current.personal.email),
                    )
                  }
                  className={INPUT_CLASS}
                />
              </FormField>
              <FormField label="Phone" error={errors['personal.phone']}>
                <input
                  type="tel"
                  value={profile.personal.phone}
                  onChange={(event) => updatePersonal('phone', event.target.value)}
                  onBlur={() => void handleValidatedBlur('personal.phone', null)}
                  className={INPUT_CLASS}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="City" error={errors['personal.city']}>
                  <input
                    type="text"
                    value={profile.personal.city}
                    onChange={(event) => updatePersonal('city', event.target.value)}
                    onBlur={() => void handleValidatedBlur('personal.city', null)}
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField label="State" error={errors['personal.state']}>
                  <input
                    type="text"
                    value={profile.personal.state}
                    onChange={(event) => updatePersonal('state', event.target.value)}
                    onBlur={() => void handleValidatedBlur('personal.state', null)}
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>
              <FormField label="Country" error={errors['personal.country']}>
                <input
                  type="text"
                  value={profile.personal.country}
                  onChange={(event) => updatePersonal('country', event.target.value)}
                  onBlur={() => void handleValidatedBlur('personal.country', null)}
                  className={INPUT_CLASS}
                />
              </FormField>
              <FormField label="LinkedIn URL" error={errors['personal.linkedinUrl']}>
                <input
                  type="url"
                  value={profile.personal.linkedinUrl}
                  onChange={(event) => updatePersonal('linkedinUrl', event.target.value)}
                  onBlur={() =>
                    void handleValidatedBlur(
                      'personal.linkedinUrl',
                      validateOptionalUrl(profileRef.current.personal.linkedinUrl),
                    )
                  }
                  className={INPUT_CLASS}
                  placeholder="https://linkedin.com/in/..."
                />
              </FormField>
              <FormField label="GitHub URL" error={errors['personal.githubUrl']}>
                <input
                  type="url"
                  value={profile.personal.githubUrl}
                  onChange={(event) => updatePersonal('githubUrl', event.target.value)}
                  onBlur={() =>
                    void handleValidatedBlur(
                      'personal.githubUrl',
                      validateOptionalUrl(profileRef.current.personal.githubUrl),
                    )
                  }
                  className={INPUT_CLASS}
                  placeholder="https://github.com/..."
                />
              </FormField>
              <FormField label="Portfolio URL" error={errors['personal.portfolioUrl']}>
                <input
                  type="url"
                  value={profile.personal.portfolioUrl}
                  onChange={(event) => updatePersonal('portfolioUrl', event.target.value)}
                  onBlur={() =>
                    void handleValidatedBlur(
                      'personal.portfolioUrl',
                      validateOptionalUrl(profileRef.current.personal.portfolioUrl),
                    )
                  }
                  className={INPUT_CLASS}
                  placeholder="https://"
                />
              </FormField>
            </div>
          ) : null}

          {section.id === 'professional' ? (
            <div className="grid grid-cols-1 gap-3">
              <FormField label="Current Job Title" error={errors['professional.currentTitle']}>
                <input
                  type="text"
                  value={profile.professional.currentTitle}
                  onChange={(event) =>
                    updateProfessional('currentTitle', event.target.value)
                  }
                  onBlur={() => void handleValidatedBlur('professional.currentTitle', null)}
                  className={INPUT_CLASS}
                />
              </FormField>
              <FormField label="Current Company" error={errors['professional.currentCompany']}>
                <input
                  type="text"
                  value={profile.professional.currentCompany}
                  onChange={(event) =>
                    updateProfessional('currentCompany', event.target.value)
                  }
                  onBlur={() => void handleValidatedBlur('professional.currentCompany', null)}
                  className={INPUT_CLASS}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Total Years of Experience"
                  error={errors['professional.totalYearsExp']}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={formatNumberInput(profile.professional.totalYearsExp)}
                    onChange={(event) =>
                      updateProfessional(
                        'totalYearsExp',
                        parseNumberInput(event.target.value),
                      )
                    }
                    onBlur={() =>
                      void handleValidatedBlur(
                        'professional.totalYearsExp',
                        validateNonNegativeNumber(
                          profileRef.current.professional.totalYearsExp,
                          'Years of experience',
                        ),
                      )
                    }
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField
                  label="Notice Period (days)"
                  error={errors['professional.noticePeriod']}
                >
                  <input
                    type="number"
                    min="0"
                    value={formatNumberInput(profile.professional.noticePeriod)}
                    onChange={(event) =>
                      updateProfessional(
                        'noticePeriod',
                        parseNumberInput(event.target.value),
                      )
                    }
                    onBlur={() =>
                      void handleValidatedBlur(
                        'professional.noticePeriod',
                        validateNonNegativeNumber(
                          profileRef.current.professional.noticePeriod,
                          'Notice period',
                        ),
                      )
                    }
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Current CTC (LPA)"
                  error={errors['professional.currentCTC']}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formatNumberInput(profile.professional.currentCTC)}
                    onChange={(event) =>
                      updateProfessional('currentCTC', parseNumberInput(event.target.value))
                    }
                    onBlur={() =>
                      void handleValidatedBlur(
                        'professional.currentCTC',
                        validateNonNegativeNumber(
                          profileRef.current.professional.currentCTC,
                          'Current CTC',
                        ),
                      )
                    }
                    className={INPUT_CLASS}
                  />
                </FormField>
                <FormField
                  label="Expected CTC (LPA)"
                  error={errors['professional.expectedCTC']}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formatNumberInput(profile.professional.expectedCTC)}
                    onChange={(event) =>
                      updateProfessional('expectedCTC', parseNumberInput(event.target.value))
                    }
                    onBlur={() =>
                      void handleValidatedBlur(
                        'professional.expectedCTC',
                        validateNonNegativeNumber(
                          profileRef.current.professional.expectedCTC,
                          'Expected CTC',
                        ),
                      )
                    }
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>
              <FormField
                label="Work Authorization"
                error={errors['professional.workAuthorization']}
              >
                <input
                  type="text"
                  value={profile.professional.workAuthorization}
                  onChange={(event) =>
                    updateProfessional('workAuthorization', event.target.value)
                  }
                  onBlur={() =>
                    void handleValidatedBlur('professional.workAuthorization', null)
                  }
                  className={INPUT_CLASS}
                  placeholder="e.g. Authorized to work in India"
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={profile.professional.willingToRelocate}
                  onChange={(event) => {
                    updateProfessional('willingToRelocate', event.target.checked);
                  }}
                  onBlur={() => void handleValidatedBlur('professional.willingToRelocate', null)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Willing to Relocate
              </label>
              <FormField
                label="Preferred Locations"
                error={errors['professional.preferredLocations']}
              >
                <input
                  type="text"
                  value={preferredLocationsText}
                  onChange={(event) => setPreferredLocationsText(event.target.value)}
                  onBlur={() => {
                    const locations = parsePreferredLocations(preferredLocationsText);
                    updateProfile((current) => ({
                      ...current,
                      professional: {
                        ...current.professional,
                        preferredLocations: locations,
                      },
                    }));
                    void handleValidatedBlur('professional.preferredLocations', null);
                  }}
                  className={INPUT_CLASS}
                  placeholder="Bangalore, Remote, Mumbai"
                />
                <p className="mt-1 text-[11px] text-gray-500">Comma-separated list</p>
              </FormField>
            </div>
          ) : null}

          {section.id === 'education' ? (
            <div className="space-y-4">
              {profile.education.length === 0 ? (
                <p className="text-sm text-gray-500">No education entries yet.</p>
              ) : null}
              {profile.education.map((entry, index) => (
                <div
                  key={`education-${index}`}
                  className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Education {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => void removeEducation(index)}
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                  <FormField label="Degree" error={errors[`education.${index}.degree`]}>
                    <input
                      type="text"
                      value={entry.degree}
                      onChange={(event) =>
                        updateEducation(index, 'degree', event.target.value)
                      }
                      onBlur={() =>
                        void handleValidatedBlur(`education.${index}.degree`, null)
                      }
                      className={INPUT_CLASS}
                    />
                  </FormField>
                  <FormField label="Field of Study" error={errors[`education.${index}.field`]}>
                    <input
                      type="text"
                      value={entry.field}
                      onChange={(event) => updateEducation(index, 'field', event.target.value)}
                      onBlur={() =>
                        void handleValidatedBlur(`education.${index}.field`, null)
                      }
                      className={INPUT_CLASS}
                    />
                  </FormField>
                  <FormField label="Institution" error={errors[`education.${index}.institution`]}>
                    <input
                      type="text"
                      value={entry.institution}
                      onChange={(event) =>
                        updateEducation(index, 'institution', event.target.value)
                      }
                      onBlur={() =>
                        void handleValidatedBlur(`education.${index}.institution`, null)
                      }
                      className={INPUT_CLASS}
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      label="Graduation Year"
                      error={errors[`education.${index}.graduationYear`]}
                    >
                      <input
                        type="number"
                        min="0"
                        value={formatNumberInput(entry.graduationYear)}
                        onChange={(event) =>
                          updateEducation(
                            index,
                            'graduationYear',
                            parseNumberInput(event.target.value),
                          )
                        }
                        onBlur={() =>
                          void handleValidatedBlur(
                            `education.${index}.graduationYear`,
                            validateGraduationYear(
                              profileRef.current.education[index]?.graduationYear ?? 0,
                            ),
                          )
                        }
                        className={INPUT_CLASS}
                      />
                    </FormField>
                    <FormField
                      label="Percentage / CGPA"
                      error={errors[`education.${index}.percentage`]}
                    >
                      <input
                        type="text"
                        value={entry.percentage}
                        onChange={(event) =>
                          updateEducation(index, 'percentage', event.target.value)
                        }
                        onBlur={() =>
                          void handleValidatedBlur(`education.${index}.percentage`, null)
                        }
                        className={INPUT_CLASS}
                      />
                    </FormField>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => void addEducation()}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Add Education
              </button>
            </div>
          ) : null}

          {section.id === 'experience' ? (
            <div className="space-y-4">
              {profile.experience.length === 0 ? (
                <p className="text-sm text-gray-500">No experience entries yet.</p>
              ) : null}
              {profile.experience.map((entry, index) => (
                <div
                  key={`experience-${index}`}
                  className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Experience {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => void removeExperience(index)}
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                  <FormField label="Job Title" error={errors[`experience.${index}.title`]}>
                    <input
                      type="text"
                      value={entry.title}
                      onChange={(event) => updateExperience(index, 'title', event.target.value)}
                      onBlur={() =>
                        void handleValidatedBlur(`experience.${index}.title`, null)
                      }
                      className={INPUT_CLASS}
                    />
                  </FormField>
                  <FormField label="Company" error={errors[`experience.${index}.company`]}>
                    <input
                      type="text"
                      value={entry.company}
                      onChange={(event) =>
                        updateExperience(index, 'company', event.target.value)
                      }
                      onBlur={() =>
                        void handleValidatedBlur(`experience.${index}.company`, null)
                      }
                      className={INPUT_CLASS}
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Start Date" error={errors[`experience.${index}.startDate`]}>
                      <input
                        type="text"
                        value={entry.startDate}
                        onChange={(event) =>
                          updateExperience(index, 'startDate', event.target.value)
                        }
                        onBlur={() =>
                          void handleValidatedBlur(`experience.${index}.startDate`, null)
                        }
                        className={INPUT_CLASS}
                        placeholder="YYYY-MM"
                      />
                    </FormField>
                    <FormField label="End Date" error={errors[`experience.${index}.endDate`]}>
                      <input
                        type="text"
                        value={entry.endDate}
                        disabled={entry.current}
                        onChange={(event) =>
                          updateExperience(index, 'endDate', event.target.value)
                        }
                        onBlur={() =>
                          void handleValidatedBlur(`experience.${index}.endDate`, null)
                        }
                        className={INPUT_CLASS}
                        placeholder="YYYY-MM"
                      />
                    </FormField>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={entry.current}
                      onChange={(event) => {
                        const isCurrent = event.target.checked;
                        updateProfile((current) => ({
                          ...current,
                          experience: current.experience.map((item, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...item,
                                  current: isCurrent,
                                  endDate: isCurrent ? '' : item.endDate,
                                }
                              : item,
                          ),
                        }));
                      }}
                      onBlur={() =>
                        void handleValidatedBlur(`experience.${index}.current`, null)
                      }
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Currently Working Here
                  </label>
                  <FormField label="Description" error={errors[`experience.${index}.description`]}>
                    <textarea
                      value={entry.description}
                      rows={3}
                      onChange={(event) =>
                        updateExperience(index, 'description', event.target.value)
                      }
                      onBlur={() =>
                        void handleValidatedBlur(`experience.${index}.description`, null)
                      }
                      className={INPUT_CLASS}
                    />
                  </FormField>
                </div>
              ))}
              <button
                type="button"
                onClick={() => void addExperience()}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Add Experience
              </button>
            </div>
          ) : null}

          {section.id === 'skills' ? (
            <div className="space-y-4">
              <TagInput
                label="Skills"
                tags={profile.skills}
                placeholder="Add a skill"
                onChange={(skills) => updateProfile((current) => ({ ...current, skills }))}
                onPersist={() => void persistProfile()}
              />
              <TagInput
                label="Languages"
                tags={profile.languages}
                placeholder="Add a language"
                onChange={(languages) =>
                  updateProfile((current) => ({ ...current, languages }))
                }
                onPersist={() => void persistProfile()}
              />
            </div>
          ) : null}
        </AccordionSection>
      ))}
    </div>
  );
}

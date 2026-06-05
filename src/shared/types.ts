/** Supported job portal and ATS identifiers used for detection and logging. */
export type PortalName =
  | 'linkedin'
  | 'naukri'
  | 'wellfound'
  | 'instahyre'
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'generic';

/** Pipeline status for a logged job application. */
export type ApplicationStatus =
  | 'applied'
  | 'seen'
  | 'interview'
  | 'rejected'
  | 'offer';

/** HTML form control type detected by the content-script scanner. */
export type FormFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'select'
  | 'textarea'
  | 'file'
  | 'radio'
  | 'checkbox'
  | 'date';

/** Popup UI color scheme preference. */
export type Theme = 'light' | 'dark' | 'system';

/** Personal contact and identity details for job applications. */
export interface PersonalInfo {
  /** Full legal or display name as it should appear on applications. */
  fullName: string;
  /** Given / first name. */
  firstName: string;
  /** Family / last name. */
  lastName: string;
  /** Primary email address for applications and recruiter contact. */
  email: string;
  /** Phone number including country code when applicable. */
  phone: string;
  /** Current city of residence. */
  city: string;
  /** State, province, or region of residence. */
  state: string;
  /** Country of residence. */
  country: string;
  /** Full URL to the candidate's LinkedIn profile. */
  linkedinUrl: string;
  /** Full URL to the candidate's GitHub profile. */
  githubUrl: string;
  /** Full URL to a personal portfolio or project website. */
  portfolioUrl: string;
  /** Full URL to the candidate's Twitter/X profile. */
  twitterUrl: string;
}

/** Current employment details and compensation expectations. */
export interface ProfessionalInfo {
  /** Current job title or designation. */
  currentTitle: string;
  /** Name of the current employer. */
  currentCompany: string;
  /** Total years of relevant professional experience. */
  totalYearsExp: number;
  /** Notice period in days before the candidate can join a new employer. */
  noticePeriod: number;
  /** Current annual compensation in lakhs per annum (LPA). */
  currentCTC: number;
  /** Expected annual compensation in lakhs per annum (LPA). */
  expectedCTC: number;
  /** Work authorization or visa status (e.g. "Authorized to work in India"). */
  workAuthorization: string;
  /** Whether the candidate is open to relocating for the role. */
  willingToRelocate: boolean;
  /** Preferred work locations for new roles. */
  preferredLocations: string[];
}

/** A single education entry from the candidate's academic history. */
export interface EducationEntry {
  /** Degree or qualification earned (e.g. "B.Tech", "MBA"). */
  degree: string;
  /** Field of study or major. */
  field: string;
  /** Name of the school, college, or university. */
  institution: string;
  /** Year of graduation or expected graduation. */
  graduationYear: number;
  /** Percentage, CGPA, or grade (e.g. "85%", "8.5 CGPA"). */
  percentage: string;
}

/** A single work experience entry from the candidate's employment history. */
export interface ExperienceEntry {
  /** Job title held at this employer. */
  title: string;
  /** Company or organization name. */
  company: string;
  /** Start date in YYYY-MM or free-text form as entered by the user. */
  startDate: string;
  /** End date in YYYY-MM or free-text form; empty if currently employed here. */
  endDate: string;
  /** Whether this is the candidate's current role. */
  current: boolean;
  /** Role summary, responsibilities, and achievements. */
  description: string;
}

/** Complete candidate profile used for autofill and cover letter generation. */
export interface UserProfile {
  /** Personal contact and identity information. */
  personal: PersonalInfo;
  /** Current employment, compensation, and work preferences. */
  professional: ProfessionalInfo;
  /** Academic qualifications, ordered with most recent first. */
  education: EducationEntry[];
  /** Employment history, ordered with most recent first. */
  experience: ExperienceEntry[];
  /** Technical and professional skills. */
  skills: string[];
  /** Spoken and written languages. */
  languages: string[];
}

/** A reusable cover letter template with placeholder variables. */
export interface CoverLetterTemplate {
  /** Unique identifier for this template. */
  id: string;
  /** Human-readable template name (e.g. "Frontend roles", "Startup roles"). */
  name: string;
  /** Cover letter body; supports {{company_name}}, {{job_title}}, {{your_name}} placeholders. */
  body: string;
  /** Unix timestamp (ms) when the template was created. */
  createdAt: number;
  /** Unix timestamp (ms) when the template was last updated. */
  updatedAt: number;
}

/** A single job application tracked by the extension. */
export interface JobApplication {
  /** Unique identifier for this application record. */
  id: string;
  /** Company or employer name. */
  company: string;
  /** Job title or role applied for. */
  role: string;
  /** Portal or ATS where the application was submitted. */
  portal: PortalName;
  /** URL of the job listing or application page. */
  url: string;
  /** Unix timestamp (ms) when the application was submitted or logged. */
  appliedAt: number;
  /** Current stage in the application pipeline. */
  status: ApplicationStatus;
  /** ID of the cover letter template used, if any. */
  coverLetterUsed?: string;
  /** Free-form notes about this application. */
  notes?: string;
}

/**
 * Flat key-value map derived from UserProfile for field matching.
 * Array fields are represented as comma-separated strings; education and
 * experience use the first entry in each array.
 */
export interface FlatProfile {
  /** Full legal or display name. */
  fullName: string;
  /** Given / first name. */
  firstName: string;
  /** Family / last name. */
  lastName: string;
  /** Primary email address. */
  email: string;
  /** Phone number. */
  phone: string;
  /** Current city of residence. */
  city: string;
  /** State, province, or region. */
  state: string;
  /** Country of residence. */
  country: string;
  /** LinkedIn profile URL. */
  linkedinUrl: string;
  /** GitHub profile URL. */
  githubUrl: string;
  /** Portfolio or personal website URL. */
  portfolioUrl: string;
  /** Twitter/X profile URL. */
  twitterUrl: string;
  /** Current job title or designation. */
  currentTitle: string;
  /** Current employer name. */
  currentCompany: string;
  /** Total years of relevant experience. */
  totalYearsExp: number;
  /** Notice period in days. */
  noticePeriod: number;
  /** Current CTC in LPA. */
  currentCTC: number;
  /** Expected CTC in LPA. */
  expectedCTC: number;
  /** Work authorization or visa status. */
  workAuthorization: string;
  /** Whether open to relocation. */
  willingToRelocate: boolean;
  /** Preferred locations as a comma-separated string. */
  preferredLocations: string;
  /** Skills as a comma-separated string. */
  skills: string;
  /** Languages as a comma-separated string. */
  languages: string;
  /** Degree from the first education entry. */
  degree: string;
  /** Field of study from the first education entry. */
  field: string;
  /** Institution from the first education entry. */
  institution: string;
  /** Graduation year from the first education entry. */
  graduationYear: number;
  /** Percentage or CGPA from the first education entry. */
  percentage: string;
  /** Job title from the first experience entry. */
  title: string;
  /** Company from the first experience entry. */
  company: string;
  /** Start date from the first experience entry. */
  startDate: string;
  /** End date from the first experience entry. */
  endDate: string;
  /** Whether the first experience entry is the current role. */
  current: boolean;
  /** Description from the first experience entry. */
  description: string;
}

/** A detected form field on a job application page (content script only). */
export interface FormField {
  /** DOM element reference; not serializable across extension contexts. */
  element: HTMLElement;
  /** Human-readable label extracted from the page. */
  label: string;
  /** Detected input control type. */
  type: FormFieldType;
  /** Matched FlatProfile key, if the matcher found a mapping. */
  profileKey?: keyof FlatProfile;
  /** Match confidence score from 0 (none) to 1 (certain). */
  confidence: number;
  /** Whether the field has been filled by the extension. */
  filled: boolean;
  /** Whether the matcher could not map this field to profile data. */
  unknown: boolean;
}

/** User-configurable extension behavior and appearance. */
export interface AppSettings {
  /** Automatically trigger autofill when a job portal page loads. */
  autoFillOnLoad: boolean;
  /** Stop before clicking Next/Submit so the user can review. */
  pauseBeforeSubmit: boolean;
  /** Highlight unmatched fields in orange on the page. */
  highlightUnknownFields: boolean;
  /** ID of the default cover letter template, or null if none. */
  defaultCoverLetterId: string | null;
  /** Popup color scheme preference. */
  theme: Theme;
}

/** Complete shape of all data persisted in chrome.storage.local. */
export interface StorageSchema {
  /** Candidate profile, or null before initial setup. */
  profile: UserProfile | null;
  /** Saved cover letter templates. */
  coverLetters: CoverLetterTemplate[];
  /** Logged job applications. */
  applications: JobApplication[];
  /** Learned label-hash to FlatProfile-key mappings from user corrections. */
  learnedFields: Record<string, string>;
  /** Extension behavior and UI settings. */
  settings: AppSettings;
}

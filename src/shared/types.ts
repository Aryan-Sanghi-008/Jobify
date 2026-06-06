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
  | 'date'
  | 'multiselect';

/** Repeatable form section type detected by the scanner. */
export type FormSectionType = 'experience' | 'education' | 'skills';

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
  /** Cover letter body; supports {{company_name}}, {{job_title}}, {{your_name}}, {{your_email}}, {{your_phone}}, {{current_role}}, {{years_exp}}, {{top_skills}}, {{notice_period}}, {{linkedin}}, {{today_date}} placeholders. */
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
  /** Unix timestamp (ms) when status was last changed. */
  statusUpdatedAt?: number;
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

/** Profile keys used when matching fields, including non-profile file uploads. */
export type ProfileMatchKey = keyof FlatProfile | 'resumeFile';

/** A detected form field on a job application page (content script only). */
export interface FormField {
  /** DOM element reference; not serializable across extension contexts. */
  element: HTMLElement;
  /** Human-readable label extracted from the page. */
  label: string;
  /** Detected input control type. */
  type: FormFieldType;
  /** Matched profile key, if the matcher found a mapping. */
  profileKey?: ProfileMatchKey;
  /** Match confidence score from 0 (none) to 1 (certain). */
  confidence: number;
  /** Whether the field has been filled by the extension. */
  filled: boolean;
  /** Whether the matcher could not map this field to profile data. */
  unknown: boolean;
  /** User-saved literal answer from learned field mapping (non-profile key). */
  learnedLiteral?: string;
  /** Repeatable section this field belongs to, if detected. */
  sectionType?: FormSectionType;
  /** Zero-based index within a repeatable section (e.g. Work Experience 2 → 1). */
  sectionIndex?: number;
}

/** Summary returned after attempting to fill form fields on a page. */
export interface FillResult {
  /** Number of fields successfully filled. */
  filled: number;
  /** Number of fields skipped (file uploads, legal checkboxes, empty values). */
  skipped: number;
  /** Fields that could not be matched to profile data. */
  unknown: FormField[];
  /** Non-fatal errors encountered while filling fields. */
  errors: string[];
}

/** Serializable autofill summary sent over chrome.runtime (no DOM references). */
export interface SerializableFillResult {
  filled: number;
  skipped: number;
  unknown: string[];
  errors: string[];
}

/** Autofill result safe for popup state (unknown = field labels). */
export type PopupFillResult = SerializableFillResult;

/** Response when autofill cannot run because the profile is incomplete. */
export interface ProfileIncompleteResponse {
  type: 'PROFILE_INCOMPLETE';
}

/** Immediate ack when the form state machine starts autofill. */
export interface AutofillStartedResponse {
  type: 'AUTOFILL_STARTED';
}

/** Union of possible TRIGGER_AUTOFILL responses from the content script. */
export type TriggerAutofillResponse =
  | ProfileIncompleteResponse
  | AutofillStartedResponse
  | SerializableFillResult;

/** States for the multi-page form autofill state machine. */
export type FormState =
  | 'IDLE'
  | 'SCANNING'
  | 'FILLING'
  | 'WAITING_FOR_USER'
  | 'NAVIGATING'
  | 'COMPLETE'
  | 'ERROR';

/** Serializable snapshot broadcast to the popup on state changes. */
export interface FormStatePayload {
  state: FormState;
  pageNumber: number;
  totalFilled: number;
  totalUnknown: string[];
  errors: string[];
}

/** Broadcast from content script when form autofill state changes. */
export interface FormStateChangedMessage {
  type: 'FORM_STATE_CHANGED';
  payload: FormStatePayload;
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
  /** Enable verbose debug logging (no PII). */
  debugMode: boolean;
  /** Whether the first-run onboarding flow has been completed. */
  onboardingComplete: boolean;
  /** API key for AI cover letter generation, stored locally only. */
  apiKey: string | null;
  /** AI provider for cover letter generation, or null when disabled. */
  aiProvider: 'anthropic' | 'openai' | null;
}

/** Public job feed source identifier. */
export type JobFeedSource = 'remoteok' | 'arbeitnow' | 'adzuna';

/** User preferences for Discover job fetching. */
export interface JobPreferences {
  /** Target role keywords, e.g. "software engineer". */
  desiredRole: string;
  /** Preferred locations, e.g. ["remote", "Berlin"]. */
  preferredLocations: string[];
  /** Minimum salary in USD, or null for no filter. */
  minSalary: number | null;
  /** Adzuna application ID, or null when not configured. */
  adzunaAppId: string | null;
  /** Adzuna application key, or null when not configured. */
  adzunaAppKey: string | null;
  /** Adzuna country slug, e.g. "gb", "us", "in". */
  adzunaCountry: string;
}

/** A job listing fetched from a public feed. */
export interface DiscoveredJob {
  /** Stable hash of source + url. */
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  source: JobFeedSource;
  salaryMin: number | null;
  salaryMax: number | null;
  tags: string[];
  /** Truncated description for storage. */
  description: string;
  /** Unix timestamp (ms) when this job was fetched. */
  fetchedAt: number;
}

/** Metadata for discovered job cache. */
export interface DiscoveredJobsMeta {
  lastFetchedAt: number | null;
  lastError: string | null;
}

/** A community-contributed field mapping entry. */
export interface CommunityFieldEntry {
  /** Profile field key this label maps to. */
  profileKey: string;
  /** Normalized label variants for matching. */
  labels: string[];
  /** Portals where this mapping applies; empty means all portals. */
  portals: PortalName[];
  /** Community vote count for ranking confidence. */
  votes: number;
}

/** Community field mappings keyed by label hash. */
export type CommunityFieldsMap = Record<string, CommunityFieldEntry>;

/** Metadata for the cached community fields file. */
export interface CommunityFieldsMeta {
  lastFetchedAt: number | null;
  lastError: string | null;
  entryCount: number;
}

/** A user-taught field mapping with usage metadata. */
export interface LearnedField {
  /** ProfileMatchKey or literal user answer. */
  value: string;
  /** Normalized label text used for cross-site fuzzy matching. */
  normalizedLabel: string;
  /** Unix timestamp (ms) when the mapping was first saved. */
  learnedAt: number;
  /** Number of times autofill used this mapping. */
  timesUsed: number;
  /** Hostnames where this mapping was learned or used. */
  sites: string[];
}

/** A named, importable profile bundle stored in the profile library. */
export interface SavedProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  profile: UserProfile | null;
  coverLetters: CoverLetterTemplate[];
  applications: JobApplication[];
  learnedFields: Record<string, LearnedField>;
  jobPreferences: JobPreferences;
  settings: AppSettings;
  lastFillResult: SerializableFillResult | null;
}

/** Summary row for the saved profiles list in Settings. */
export interface SavedProfileSummary {
  id: string;
  name: string;
  email: string;
  updatedAt: number;
  isActive: boolean;
}

/** Preview of sections detected in a flexible profile import. */
export interface ProfileImportPreview {
  name: string;
  hasProfile: boolean;
  coverLetterCount: number;
  applicationCount: number;
  learnedFieldCount: number;
  hasSettings: boolean;
  hasJobPreferences: boolean;
  hasLastFillResult: boolean;
}

/** Complete shape of all data persisted in chrome.storage.local. */
export interface StorageSchema {
  /** Candidate profile, or null before initial setup. */
  profile: UserProfile | null;
  /** Saved cover letter templates. */
  coverLetters: CoverLetterTemplate[];
  /** Logged job applications. */
  applications: JobApplication[];
  /** Learned field mappings keyed by label hash and normalized label. */
  learnedFields: Record<string, LearnedField>;
  /** Extension behavior and UI settings. */
  settings: AppSettings;
  /** Most recent autofill summary for diagnostics (no field values). */
  lastFillResult: SerializableFillResult | null;
  /** Selector failure counts keyed by portal and selector key. */
  selectorHealth: Partial<Record<PortalName, Record<string, number>>>;
  /** Job search preferences for the Discover tab. */
  jobPreferences: JobPreferences;
  /** Cached job listings from public feeds. */
  discoveredJobs: DiscoveredJob[];
  /** Fetch metadata for discovered jobs. */
  discoveredJobsMeta: DiscoveredJobsMeta;
  /** Community-contributed field mappings. */
  communityFields: CommunityFieldsMap;
  /** Fetch metadata for community field mappings. */
  communityFieldsMeta: CommunityFieldsMeta;
  /** Named profile bundles for multi-profile switching. */
  savedProfiles: SavedProfile[];
  /** ID of the profile currently loaded into active storage keys. */
  activeProfileId: string | null;
}

/** Known runtime message types exchanged between extension contexts. */
export type MessageType =
  | 'GET_PROFILE'
  | 'SAVE_PROFILE'
  | 'LOG_APPLICATION'
  | 'LEARN_FIELD'
  | 'GET_SETTINGS'
  | 'PING'
  | 'PORTAL_DETECTED'
  | 'APPLICATION_COMPLETE'
  | 'FORM_STATE_CHANGED'
  | 'GENERATE_COVER_LETTER'
  | 'TEST_AI_CONNECTION'
  | 'GET_DISCOVERED_JOBS'
  | 'FETCH_DISCOVERED_JOBS'
  | 'AUTO_APPLY_JOB'
  | 'FETCH_COMMUNITY_FIELDS'
  | 'GET_COMMUNITY_FIELDS'
  | 'GET_ACTIVE_TAB_PAGE_INFO';

/** Message types handled by the content script. */
export type ContentMessageType =
  | 'TRIGGER_AUTOFILL'
  | 'CONTINUE_AUTOFILL'
  | 'STOP_AUTOFILL'
  | 'FILL_COVER_LETTER'
  | 'GET_PAGE_INFO'
  | 'LEARN_FIELD_MAPPING'
  | 'FILL_SINGLE_FIELD'
  | 'CHECK_FORM_PROGRESS';

/** Request to load the stored user profile. */
export interface GetProfileMessage {
  type: 'GET_PROFILE';
}

/** Request to persist an updated user profile. */
export interface SaveProfileMessage {
  type: 'SAVE_PROFILE';
  payload: UserProfile;
}

/** Request to log a submitted job application. */
export interface LogApplicationMessage {
  type: 'LOG_APPLICATION';
  payload: JobApplication;
}

/** Request to store a learned field label mapping. */
export interface LearnFieldMessage {
  type: 'LEARN_FIELD';
  labelHash: string;
  profileKey: string;
  normalizedLabel?: string;
  site?: string;
}

/** Request to load extension settings. */
export interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

/** Health-check ping from a content script. */
export interface PingMessage {
  type: 'PING';
}

/** Request page metadata for the user's active tab (popup bootstrap). */
export interface GetActiveTabPageInfoMessage {
  type: 'GET_ACTIVE_TAB_PAGE_INFO';
}

/** Notification that a job portal was detected on the active tab. */
export interface PortalDetectedMessage {
  type: 'PORTAL_DETECTED';
  portal: PortalName;
}

/** Notification from content script that a multi-page application form was submitted. */
export interface ApplicationCompleteMessage {
  type: 'APPLICATION_COMPLETE';
  payload: {
    company: string;
    role: string;
    portal: PortalName;
    url: string;
  };
}

/** Request to run autofill on the current page. */
export interface TriggerAutofillMessage {
  type: 'TRIGGER_AUTOFILL';
}

/** Request to resume autofill after user review. */
export interface ContinueAutofillMessage {
  type: 'CONTINUE_AUTOFILL';
}

/** Request to abort the autofill state machine. */
export interface StopAutofillMessage {
  type: 'STOP_AUTOFILL';
}

/** Request to fill the cover letter field on the current page. */
export interface FillCoverLetterMessage {
  type: 'FILL_COVER_LETTER';
  templateId?: string;
}

/** Request for company, role, and portal metadata from the current page. */
export interface GetPageInfoMessage {
  type: 'GET_PAGE_INFO';
}

/** Request to persist a user-corrected field mapping from the content script. */
export interface LearnFieldMappingMessage {
  type: 'LEARN_FIELD_MAPPING';
  labelHash: string;
  profileKey: string;
  normalizedLabel: string;
}

/** Request to fill a single field on the page by label. */
export interface FillSingleFieldMessage {
  type: 'FILL_SINGLE_FIELD';
  label: string;
  value: string;
}

/** Result of a single-field fill attempt. */
export interface FillSingleFieldResponse {
  success: boolean;
  field_found: boolean;
}

/** Request to re-check form progress after manual field fills. */
export interface CheckFormProgressMessage {
  type: 'CHECK_FORM_PROGRESS';
}

/** Page metadata returned by GET_PAGE_INFO. */
export interface PageInfoResponse {
  company: string;
  jobTitle: string;
  portal: PortalName;
  /** True when the page has at least one scannable application form field. */
  hasApplicationForm: boolean;
  /** Number of scannable form fields detected on the page. */
  formFieldCount: number;
}

/** Result of a cover letter fill attempt. */
export interface FillCoverLetterResponse {
  success: boolean;
  field_found: boolean;
}

/** Request to generate a cover letter via the configured AI provider. */
export interface GenerateCoverLetterMessage {
  type: 'GENERATE_COVER_LETTER';
  jobDescription: string;
}

/** Response from AI cover letter generation. */
export interface GenerateCoverLetterResponse {
  text?: string;
  error?: string;
}

/** Request to test an AI provider API key. */
export interface TestAiConnectionMessage {
  type: 'TEST_AI_CONNECTION';
  apiKey: string;
  provider: 'anthropic' | 'openai';
}

/** Response from AI connection test. */
export interface TestAiConnectionResponse {
  success: boolean;
  message: string;
}

/** Request to load cached discovered jobs. */
export interface GetDiscoveredJobsMessage {
  type: 'GET_DISCOVERED_JOBS';
}

/** Response with cached discovered jobs. */
export interface GetDiscoveredJobsResponse {
  jobs: DiscoveredJob[];
  meta: DiscoveredJobsMeta;
}

/** Request to manually refresh discovered jobs. */
export interface FetchDiscoveredJobsMessage {
  type: 'FETCH_DISCOVERED_JOBS';
}

/** Response from manual job fetch. */
export interface FetchDiscoveredJobsResponse {
  success: boolean;
  count: number;
  error?: string;
}

/** Request to open a job URL and trigger autofill. */
export interface AutoApplyJobMessage {
  type: 'AUTO_APPLY_JOB';
  url: string;
}

/** Response from auto-apply request. */
export interface AutoApplyJobResponse {
  success: boolean;
  error?: string;
}

/** Request to load cached community field mappings. */
export interface GetCommunityFieldsMessage {
  type: 'GET_COMMUNITY_FIELDS';
}

/** Response with cached community field mappings. */
export interface GetCommunityFieldsResponse {
  fields: CommunityFieldsMap;
  meta: CommunityFieldsMeta;
}

/** Request to manually refresh community field mappings. */
export interface FetchCommunityFieldsMessage {
  type: 'FETCH_COMMUNITY_FIELDS';
}

/** Response from community fields fetch. */
export interface FetchCommunityFieldsResponse {
  success: boolean;
  count: number;
  error?: string;
}

/** Discriminated union of all extension runtime messages. */
export type ExtensionMessage =
  | GetProfileMessage
  | SaveProfileMessage
  | LogApplicationMessage
  | LearnFieldMessage
  | GetSettingsMessage
  | PingMessage
  | PortalDetectedMessage
  | ApplicationCompleteMessage
  | FormStateChangedMessage
  | GenerateCoverLetterMessage
  | TestAiConnectionMessage
  | GetDiscoveredJobsMessage
  | FetchDiscoveredJobsMessage
  | AutoApplyJobMessage
  | GetCommunityFieldsMessage
  | FetchCommunityFieldsMessage
  | GetActiveTabPageInfoMessage;

/** Discriminated union of messages sent to the content script. */
export type ContentScriptMessage =
  | TriggerAutofillMessage
  | ContinueAutofillMessage
  | StopAutofillMessage
  | FillCoverLetterMessage
  | GetPageInfoMessage
  | LearnFieldMappingMessage
  | FillSingleFieldMessage
  | CheckFormProgressMessage;

/** Error response returned when a message handler fails. */
export interface MessageErrorResponse {
  success: false;
  error: string;
}

/** Success response returned when a write operation completes. */
export interface MessageSuccessResponse {
  success: true;
}

/** Response returned by the PING handler. */
export interface PingResponse {
  alive: true;
}

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {
  EducationEntry,
  ExperienceEntry,
  PersonalInfo,
  ProfessionalInfo,
  UserProfile,
} from '@/shared/types';

GlobalWorkerOptions.workerSrc = workerUrl;

const LARGE_FILE_BYTES = 5 * 1024 * 1024;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX =
  /(?:\+91[\s-]?)?([6-9]\d{2}[\s-]?\d{3}[\s-]?\d{4}|\b[6-9]\d{9}\b)/;
const LINKEDIN_REGEX = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([\w-]+)/i;
const GITHUB_REGEX = /(?:https?:\/\/)?(?:www\.)?github\.com\/([\w-]+)/i;

const SECTION_HEADERS =
  /^(experience|work\s+experience|employment|education|projects?|certifications?|achievements?|summary|objective|contact|personal|professional)\b/i;

const DEGREE_REGEX =
  /\b(B\.?\s*Tech\.?|B\.?\s*E\.?|M\.?\s*Tech\.?|MBA|BCA|MCA|B\.?\s*Sc\.?)\b/i;

const MONTH_NAMES =
  'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';

const DATE_RANGE_REGEX = new RegExp(
  `(${MONTH_NAMES})\\s+(\\d{4})\\s*[-–—]\\s*(?:(${MONTH_NAMES})\\s+(\\d{4})|(\\d{4})|(Present|Current))`,
  'gi',
);

const TITLE_CASE_NAME_REGEX = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/;
const ALL_CAPS_NAME_REGEX = /^[A-Z]+(?:\s+[A-Z]+){1,3}$/;

export interface ParseResumeResult extends Partial<UserProfile> {
  _error?: string;
  _warning?: string;
}

function isPasswordProtectedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('password') || message.includes('passwordexception');
}

function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function isSkippableNameLine(line: string): boolean {
  if (EMAIL_REGEX.test(line) || PHONE_REGEX.test(line)) {
    return true;
  }

  if (/https?:\/\//i.test(line) || /linkedin\.com|github\.com/i.test(line)) {
    return true;
  }

  if (SECTION_HEADERS.test(line)) {
    return true;
  }

  if (/\d{4}/.test(line) && new RegExp(DATE_RANGE_REGEX.source, 'i').test(line)) {
    return true;
  }

  return false;
}

function splitName(fullName: string): Pick<PersonalInfo, 'fullName' | 'firstName' | 'lastName'> {
  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 0) {
    return { fullName: '', firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { fullName, firstName: parts[0], lastName: '' };
  }

  return {
    fullName,
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

export function extractEmail(text: string): string | undefined {
  const match = text.match(EMAIL_REGEX);
  return match?.[0];
}

export function extractPhone(text: string): string | undefined {
  const match = text.match(PHONE_REGEX);
  if (!match) {
    return undefined;
  }

  const digits = match[0].replace(/\D/g, '');
  const normalized = digits.length === 10 ? digits : digits.slice(-10);

  if (normalized.length !== 10 || !/^[6-9]/.test(normalized)) {
    return undefined;
  }

  return `+91${normalized}`;
}

export function extractLinkedInUrl(text: string): string | undefined {
  const match = text.match(LINKEDIN_REGEX);
  if (!match?.[1]) {
    return undefined;
  }

  return `https://linkedin.com/in/${match[1]}`;
}

export function extractGitHubUrl(text: string): string | undefined {
  const matches = [...text.matchAll(new RegExp(GITHUB_REGEX.source, 'gi'))];

  for (const match of matches) {
    const username = match[1]?.toLowerCase();
    if (!username || ['features', 'topics', 'collections', 'explore'].includes(username)) {
      continue;
    }

    return `https://github.com/${match[1]}`;
  }

  return undefined;
}

export function extractName(lines: string[]): Pick<PersonalInfo, 'fullName' | 'firstName' | 'lastName'> | undefined {
  for (const line of lines.slice(0, 10)) {
    if (isSkippableNameLine(line)) {
      continue;
    }

    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) {
      continue;
    }

    if (TITLE_CASE_NAME_REGEX.test(line) || ALL_CAPS_NAME_REGEX.test(line)) {
      const formatted =
        line === line.toUpperCase()
          ? words.map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')
          : line;

      return splitName(formatted);
    }
  }

  return undefined;
}

export function extractSkills(lines: string[]): string[] | undefined {
  const startIndex = lines.findIndex((line) => /^skills?\b/i.test(line));
  if (startIndex === -1) {
    return undefined;
  }

  const collected: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (SECTION_HEADERS.test(line)) {
      break;
    }

    const headerBody = line.replace(/^skills?\s*[:-]\s*/i, '').trim();
    const segments = headerBody.split(/[,•*;]|\s+-\s+/);

    for (const segment of segments) {
      const skill = segment.replace(/^[-•*]\s*/, '').trim();
      if (skill.length > 1 && skill.length < 60) {
        collected.push(skill);
      }
    }
  }

  const unique = [...new Set(collected.map((skill) => skill.trim()))].filter(Boolean);
  return unique.length > 0 ? unique : undefined;
}

function parseDateToken(month: string | undefined, year: string | undefined): string {
  if (!year) {
    return '';
  }

  if (!month) {
    return year;
  }

  const monthMap: Record<string, string> = {
    january: '01',
    jan: '01',
    february: '02',
    feb: '02',
    march: '03',
    mar: '03',
    april: '04',
    apr: '04',
    may: '05',
    june: '06',
    jun: '06',
    july: '07',
    jul: '07',
    august: '08',
    aug: '08',
    september: '09',
    sep: '09',
    sept: '09',
    october: '10',
    oct: '10',
    november: '11',
    nov: '11',
    december: '12',
    dec: '12',
  };

  const monthNumber = monthMap[month.toLowerCase()] ?? '01';
  return `${year}-${monthNumber}`;
}

function splitRoleAndCompany(candidate: string): { title: string; company: string } {
  const atMatch = candidate.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) {
    return { title: atMatch[1].trim(), company: atMatch[2].trim() };
  }

  const pipeParts = candidate.split(/\s*[|•]\s*/);
  if (pipeParts.length >= 2) {
    return { title: pipeParts[0].trim(), company: pipeParts[1].trim() };
  }

  const commaParts = candidate.split(',').map((part) => part.trim());
  if (commaParts.length >= 2) {
    return { title: commaParts[0], company: commaParts[1] };
  }

  return { title: '', company: candidate.trim() };
}

export function extractExperience(lines: string[]): {
  experience?: ExperienceEntry[];
  professional?: Partial<ProfessionalInfo>;
} {
  const entries: ExperienceEntry[] = [];
  const fullText = lines.join('\n');
  const matches = [...fullText.matchAll(DATE_RANGE_REGEX)];

  for (const match of matches) {
    const matchIndex = match.index ?? 0;
    const beforeText = fullText.slice(0, matchIndex).trim();
    const beforeLines = beforeText.split('\n').map((line) => line.trim()).filter(Boolean);
    const candidateLine = beforeLines[beforeLines.length - 1] ?? '';

    if (!candidateLine || SECTION_HEADERS.test(candidateLine)) {
      continue;
    }

    const startMonth = match[1];
    const startYear = match[2];
    const endMonth = match[3];
    const endYear = match[4] ?? match[5];
    const endPresent = match[6];

    const current = Boolean(endPresent);
    const { title, company } = splitRoleAndCompany(
      candidateLine.replace(new RegExp(DATE_RANGE_REGEX.source, 'i'), '').trim() || candidateLine,
    );

    if (!company && !title) {
      continue;
    }

    entries.push({
      title,
      company: company || title,
      startDate: parseDateToken(startMonth, startYear),
      endDate: current ? '' : parseDateToken(endMonth, endYear),
      current,
      description: '',
    });
  }

  const uniqueEntries = entries.filter(
    (entry, index, array) =>
      array.findIndex(
        (other) =>
          other.company.toLowerCase() === entry.company.toLowerCase() &&
          other.startDate === entry.startDate,
      ) === index,
  );

  if (uniqueEntries.length === 0) {
    return {};
  }

  const currentRole = uniqueEntries.find((entry) => entry.current) ?? uniqueEntries[0];
  const professional: Partial<ProfessionalInfo> = {};

  if (currentRole.company) {
    professional.currentCompany = currentRole.company;
  }

  if (currentRole.title) {
    professional.currentTitle = currentRole.title;
  }

  return { experience: uniqueEntries, professional };
}

export function extractEducation(lines: string[]): EducationEntry[] | undefined {
  const entries: EducationEntry[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const degreeMatch = line.match(DEGREE_REGEX);
    if (!degreeMatch) {
      continue;
    }

    const degree = degreeMatch[0].replace(/\s+/g, ' ').trim();
    const remainder = line.replace(degreeMatch[0], '').replace(/^[\s,:-]+/, '').trim();
    const nextLine = lines[index + 1] ?? '';
    const institution = remainder || (SECTION_HEADERS.test(nextLine) ? '' : nextLine);
    const yearMatch = (line + ' ' + nextLine).match(/\b(19|20)\d{2}\b/);

    if (!institution) {
      continue;
    }

    entries.push({
      degree,
      field: '',
      institution,
      graduationYear: yearMatch ? Number(yearMatch[0]) : 0,
      percentage: '',
    });
  }

  const uniqueEntries = entries.filter(
    (entry, index, array) =>
      array.findIndex(
        (other) =>
          other.institution.toLowerCase() === entry.institution.toLowerCase() &&
          other.degree.toLowerCase() === entry.degree.toLowerCase(),
      ) === index,
  );

  return uniqueEntries.length > 0 ? uniqueEntries : undefined;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n');
}

function buildProfileFromText(text: string): Partial<UserProfile> {
  const lines = normalizeLines(text);
  const result: Partial<UserProfile> = {};

  const email = extractEmail(text);
  const phone = extractPhone(text);
  const linkedinUrl = extractLinkedInUrl(text);
  const githubUrl = extractGitHubUrl(text);
  const name = extractName(lines);

  const personal: Partial<PersonalInfo> = {};
  if (email) personal.email = email;
  if (phone) personal.phone = phone;
  if (linkedinUrl) personal.linkedinUrl = linkedinUrl;
  if (githubUrl) personal.githubUrl = githubUrl;
  if (name) {
    personal.fullName = name.fullName;
    personal.firstName = name.firstName;
    personal.lastName = name.lastName;
  }

  if (Object.keys(personal).length > 0) {
    result.personal = personal as PersonalInfo;
  }

  const skills = extractSkills(lines);
  if (skills) {
    result.skills = skills;
  }

  const { experience, professional } = extractExperience(lines);
  if (experience) {
    result.experience = experience;
  }

  if (professional && Object.keys(professional).length > 0) {
    result.professional = professional as ProfessionalInfo;
  }

  const education = extractEducation(lines);
  if (education) {
    result.education = education;
  }

  return result;
}

function hasParsedData(parsed: Partial<UserProfile>): boolean {
  return Boolean(
    parsed.personal ||
      parsed.professional ||
      (parsed.skills && parsed.skills.length > 0) ||
      (parsed.education && parsed.education.length > 0) ||
      (parsed.experience && parsed.experience.length > 0) ||
      (parsed.languages && parsed.languages.length > 0),
  );
}

export async function parseResume(file: File): Promise<ParseResumeResult> {
  const result: ParseResumeResult = {};

  if (file.size > LARGE_FILE_BYTES) {
    result._warning = 'Large PDF (>5 MB) — parsing may be slow';
  }

  try {
    const text = await extractTextFromPdf(file);

    if (text.trim().length === 0) {
      return {
        ...result,
        _warning: result._warning
          ? `${result._warning}. No text found — this may be a scanned PDF`
          : 'No text found — this may be a scanned PDF',
      };
    }

    const parsed = buildProfileFromText(text);
    return { ...parsed, ...result };
  } catch (error) {
    if (isPasswordProtectedError(error)) {
      return { _error: 'Password protected PDF' };
    }

    return { _error: 'Could not read PDF' };
  }
}

function isEmptyString(value: string): boolean {
  return value.trim() === '';
}

function mergePersonal(current: PersonalInfo, parsed: Partial<PersonalInfo>): PersonalInfo {
  const merged = { ...current };

  for (const key of Object.keys(parsed) as Array<keyof PersonalInfo>) {
    const parsedValue = parsed[key];
    if (typeof parsedValue !== 'string' || isEmptyString(parsedValue)) {
      continue;
    }

    if (isEmptyString(merged[key])) {
      merged[key] = parsedValue;
    }
  }

  return merged;
}

function mergeProfessional(
  current: ProfessionalInfo,
  parsed: Partial<ProfessionalInfo>,
): ProfessionalInfo {
  return {
    currentTitle:
      isEmptyString(current.currentTitle) && parsed.currentTitle
        ? parsed.currentTitle
        : current.currentTitle,
    currentCompany:
      isEmptyString(current.currentCompany) && parsed.currentCompany
        ? parsed.currentCompany
        : current.currentCompany,
    totalYearsExp:
      current.totalYearsExp === 0 && parsed.totalYearsExp
        ? parsed.totalYearsExp
        : current.totalYearsExp,
    noticePeriod:
      current.noticePeriod === 0 && parsed.noticePeriod
        ? parsed.noticePeriod
        : current.noticePeriod,
    currentCTC:
      current.currentCTC === 0 && parsed.currentCTC ? parsed.currentCTC : current.currentCTC,
    expectedCTC:
      current.expectedCTC === 0 && parsed.expectedCTC
        ? parsed.expectedCTC
        : current.expectedCTC,
    workAuthorization:
      isEmptyString(current.workAuthorization) && parsed.workAuthorization
        ? parsed.workAuthorization
        : current.workAuthorization,
    willingToRelocate:
      !current.willingToRelocate && parsed.willingToRelocate
        ? parsed.willingToRelocate
        : current.willingToRelocate,
    preferredLocations:
      current.preferredLocations.length === 0 && parsed.preferredLocations
        ? parsed.preferredLocations
        : current.preferredLocations,
  };
}

function mergeStringArrays(current: string[], parsed: string[] | undefined): string[] {
  if (!parsed || parsed.length === 0) {
    return current;
  }

  const seen = new Set(current.map((item) => item.toLowerCase()));
  const merged = [...current];

  for (const item of parsed) {
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(normalized);
    }
  }

  return merged;
}

function mergeEducationEntries(
  current: EducationEntry[],
  parsed: EducationEntry[] | undefined,
): EducationEntry[] {
  if (!parsed || parsed.length === 0) {
    return current;
  }

  if (current.length === 0) {
    return parsed;
  }

  const existing = new Set(
    current.map((entry) => `${entry.institution.toLowerCase()}|${entry.degree.toLowerCase()}`),
  );

  const appended = parsed.filter((entry) => {
    const key = `${entry.institution.toLowerCase()}|${entry.degree.toLowerCase()}`;
    return !existing.has(key);
  });

  return [...current, ...appended];
}

function mergeExperienceEntries(
  current: ExperienceEntry[],
  parsed: ExperienceEntry[] | undefined,
): ExperienceEntry[] {
  if (!parsed || parsed.length === 0) {
    return current;
  }

  if (current.length === 0) {
    return parsed;
  }

  const existing = new Set(
    current.map((entry) => `${entry.company.toLowerCase()}|${entry.startDate}`),
  );

  const appended = parsed.filter((entry) => {
    const key = `${entry.company.toLowerCase()}|${entry.startDate}`;
    return !existing.has(key);
  });

  return [...current, ...appended];
}

export function mergeParsedProfile(
  current: UserProfile,
  parsed: ParseResumeResult,
): UserProfile {
  const { _error: _ignoredError, _warning: _ignoredWarning, ...profileData } = parsed;

  return {
    personal: profileData.personal
      ? mergePersonal(current.personal, profileData.personal)
      : current.personal,
    professional: profileData.professional
      ? mergeProfessional(current.professional, profileData.professional)
      : current.professional,
    education: mergeEducationEntries(current.education, profileData.education),
    experience: mergeExperienceEntries(current.experience, profileData.experience),
    skills: mergeStringArrays(current.skills, profileData.skills),
    languages: mergeStringArrays(current.languages, profileData.languages),
  };
}

export function parseResultHasData(parsed: ParseResumeResult): boolean {
  const { _error, _warning, ...profileData } = parsed;
  void _error;
  void _warning;
  return hasParsedData(profileData);
}

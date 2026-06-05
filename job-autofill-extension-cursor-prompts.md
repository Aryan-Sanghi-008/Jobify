# Job Autofill Chrome Extension — Complete Cursor Prompt Playbook

> **How to use this document**
> Work through prompts sequentially. Never skip a prompt. Each prompt assumes all previous ones are done. Paste each prompt verbatim into Cursor's AI chat (Cmd+L or Ctrl+L). After each prompt, verify the output compiles/runs before proceeding. If Cursor generates something unexpected, use the "Correction Prompt" provided at the end of each phase.

---

## Tech Stack Decision

| Layer | Choice | Why |
|---|---|---|
| Extension framework | **Manifest V3** (vanilla JS) | No build step, direct DOM access, least overhead |
| UI (popup) | **React 18 + Vite** | Fast dev, component reuse, HMR |
| Styling | **Tailwind CSS v3** | Utility-first, purged in prod, consistent design tokens |
| Storage | **Chrome Storage API** (local) | Built-in, encrypted by OS, no server needed |
| Resume parsing | **PDF.js** (Mozilla) | In-browser, no server, battle-tested |
| Field matching | **Fuse.js** | Lightweight fuzzy search, zero deps |
| Testing | **Vitest + Playwright** | Fast unit tests + E2E browser tests |
| Bundler | **Vite + CRXJS plugin** | HMR in extension dev, clean MV3 output |
| Language | **TypeScript** throughout | Catches bugs at compile time, better Cursor autocomplete |

---

## Project Structure (reference throughout)

```
job-autofill-extension/
├── src/
│   ├── background/          # Service worker
│   │   └── index.ts
│   ├── content/             # Content scripts (injected into pages)
│   │   ├── index.ts         # Entry, portal detection
│   │   ├── scanner.ts       # Generic field scanner
│   │   ├── filler.ts        # Field filling engine
│   │   ├── matcher.ts       # Fuzzy label→profile matching
│   │   ├── observer.ts      # MutationObserver for dynamic pages
│   │   ├── portals/         # Portal-specific modules
│   │   │   ├── linkedin.ts
│   │   │   ├── naukri.ts
│   │   │   ├── wellfound.ts
│   │   │   └── instahyre.ts
│   │   └── ats/             # ATS-specific modules
│   │       ├── greenhouse.ts
│   │       ├── lever.ts
│   │       └── workday.ts
│   ├── popup/               # React popup UI
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── pages/
│   │       ├── Profile.tsx
│   │       ├── CoverLetters.tsx
│   │       ├── Tracker.tsx
│   │       └── Settings.tsx
│   ├── shared/              # Shared across all contexts
│   │   ├── types.ts         # All TypeScript interfaces
│   │   ├── storage.ts       # Storage abstraction layer
│   │   ├── constants.ts     # Field name mappings, portal URLs
│   │   └── utils.ts         # Pure utility functions
│   └── assets/
├── public/
│   └── icons/
├── manifest.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## PHASE 1 — Project Scaffold & Core Architecture
**Goal:** Working extension shell that loads in Chrome with TypeScript, Vite, and all config correct.
**Duration:** ~2–3 hours
**Prompts:** 1–12

---

### Prompt 1 — Project Initialization

```
Create a new Chrome Extension (Manifest V3) project with the following exact setup:

Tech stack:
- TypeScript 5.x
- Vite 5.x with @crxjs/vite-plugin for Chrome extension support
- React 18 with react-dom
- Tailwind CSS v3
- Fuse.js for fuzzy matching
- pdfjs-dist (PDF.js) for resume parsing
- Vitest for unit testing

Project name: job-autofill-extension

Tasks:
1. Create package.json with all dependencies listed above. Use exact versions, not "latest".
2. Create vite.config.ts configured for @crxjs/vite-plugin pointing to manifest.json
3. Create manifest.json (MV3) with:
   - name: "Job Autofill"
   - version: "0.1.0"
   - permissions: ["storage", "activeTab", "scripting", "tabs"]
   - host_permissions: ["https://*/*", "http://*/*"]
   - background service_worker pointing to src/background/index.ts
   - content_scripts matching all URLs pointing to src/content/index.ts
   - action pointing to popup/index.html
4. Create tsconfig.json with strict mode, paths alias @ pointing to src/
5. Create tailwind.config.ts with content paths covering all src files
6. Create the full folder structure as specified below — empty files with just an export placeholder

Folder structure:
src/background/index.ts
src/content/index.ts
src/content/scanner.ts
src/content/filler.ts
src/content/matcher.ts
src/content/observer.ts
src/content/portals/linkedin.ts
src/content/portals/naukri.ts
src/content/portals/wellfound.ts
src/content/portals/instahyre.ts
src/content/ats/greenhouse.ts
src/content/ats/lever.ts
src/content/ats/workday.ts
src/popup/main.tsx
src/popup/App.tsx
src/popup/pages/Profile.tsx
src/popup/pages/CoverLetters.tsx
src/popup/pages/Tracker.tsx
src/popup/pages/Settings.tsx
src/shared/types.ts
src/shared/storage.ts
src/shared/constants.ts
src/shared/utils.ts

Do NOT write implementation yet — just scaffold with placeholder exports. The goal is a project that compiles with zero errors when you run `npm install && npm run build`.
```

---

### Prompt 2 — TypeScript Type System

```
We are building a Chrome Extension called "Job Autofill". All types live in src/shared/types.ts.

Write the complete TypeScript interfaces for this file. Do not import from anywhere else — this file has zero dependencies.

Define the following interfaces exactly:

1. UserProfile — everything about the user:
   - personal: { fullName, firstName, lastName, email, phone, city, state, country, linkedinUrl, githubUrl, portfolioUrl, twitterUrl }
   - professional: { currentTitle, currentCompany, totalYearsExp, noticePeriod (number, days), currentCTC (number, LPA), expectedCTC (number, LPA), workAuthorization, willingToRelocate (boolean), preferredLocations (string[]) }
   - education: Array of { degree, field, institution, graduationYear, percentage }
   - experience: Array of { title, company, startDate, endDate, current (boolean), description }
   - skills: string[]
   - languages: string[]

2. CoverLetterTemplate:
   - id: string
   - name: string (e.g. "Frontend roles", "Startup roles")
   - body: string (supports {{company_name}}, {{job_title}}, {{your_name}} placeholders)
   - createdAt: number (timestamp)
   - updatedAt: number

3. JobApplication — one applied job:
   - id: string
   - company: string
   - role: string
   - portal: PortalName (union type)
   - url: string
   - appliedAt: number
   - status: 'applied' | 'seen' | 'interview' | 'rejected' | 'offer'
   - coverLetterUsed?: string (template id)
   - notes?: string

4. PortalName — string union:
   'linkedin' | 'naukri' | 'wellfound' | 'instahyre' | 'greenhouse' | 'lever' | 'workday' | 'generic'

5. FormField — a detected field on a page:
   - element: HTMLElement (not serializable — only used in content script)
   - label: string
   - type: 'text' | 'email' | 'tel' | 'select' | 'textarea' | 'file' | 'radio' | 'checkbox' | 'date'
   - profileKey?: keyof FlatProfile (if matched)
   - confidence: number (0–1)
   - filled: boolean
   - unknown: boolean

6. FlatProfile — a flat key-value map derived from UserProfile for easy field matching:
   All UserProfile fields flattened to string keys → string | number | boolean values
   Example: 'fullName' → string, 'currentCTC' → number, etc.
   Write all keys explicitly (no Record<string, any>).

7. StorageSchema — the shape of everything in chrome.storage.local:
   - profile: UserProfile | null
   - coverLetters: CoverLetterTemplate[]
   - applications: JobApplication[]
   - learnedFields: Record<string, string> (label hash → profileKey mapping from user corrections)
   - settings: AppSettings

8. AppSettings:
   - autoFillOnLoad: boolean
   - pauseBeforeSubmit: boolean
   - highlightUnknownFields: boolean
   - defaultCoverLetterId: string | null
   - theme: 'light' | 'dark' | 'system'

Export all interfaces. Add JSDoc comments on every field explaining what it stores.
```

---

### Prompt 3 — Storage Abstraction Layer

```
Context: We are building a Chrome Extension "Job Autofill". 
File: src/shared/storage.ts
Dependencies: src/shared/types.ts (already written)

Write a complete, type-safe storage abstraction layer for Chrome's storage.local API.

Requirements:
1. All functions must be async and return typed Promises — never use chrome.storage callbacks.
2. Never use `any` type anywhere.
3. Handle chrome.storage.local.get returning undefined gracefully — always return a default value.
4. Export these functions:

   getProfile(): Promise<UserProfile | null>
   saveProfile(profile: UserProfile): Promise<void>
   
   getCoverLetters(): Promise<CoverLetterTemplate[]>
   saveCoverLetter(template: CoverLetterTemplate): Promise<void>
   deleteCoverLetter(id: string): Promise<void>
   
   getApplications(): Promise<JobApplication[]>
   logApplication(app: JobApplication): Promise<void>
   updateApplicationStatus(id: string, status: JobApplication['status']): Promise<void>
   
   getLearnedFields(): Promise<Record<string, string>>
   learnField(labelHash: string, profileKey: string): Promise<void>
   
   getSettings(): Promise<AppSettings>
   saveSettings(settings: Partial<AppSettings>): Promise<void>
   
   clearAllData(): Promise<void>

5. Add a DEFAULT_SETTINGS constant with sensible defaults:
   autoFillOnLoad: false (don't auto-fill without user clicking — security)
   pauseBeforeSubmit: true
   highlightUnknownFields: true
   defaultCoverLetterId: null
   theme: 'system'

6. Add a DEFAULT_PROFILE constant with all fields as empty strings / 0 / false / [].

7. Write a helper function flattenProfile(profile: UserProfile): FlatProfile that converts the nested UserProfile to the flat FlatProfile map used for field matching.

8. Add error handling: wrap all chrome.storage calls in try/catch. If storage fails, log the error with a prefix "[JobAutofill Storage]" and re-throw.

Do not use any external libraries. Pure TypeScript + Chrome extension APIs only.
```

---

### Prompt 4 — Constants & Field Mapping Dictionary

```
Context: Chrome Extension "Job Autofill".
File: src/shared/constants.ts
Dependencies: src/shared/types.ts

Write the constants file. This is the dictionary that makes field matching work.

1. PORTAL_URLS: Record<PortalName, string[]> — URL patterns for each portal:
   linkedin: ['linkedin.com/jobs', 'linkedin.com/in']
   naukri: ['naukri.com']
   wellfound: ['wellfound.com', 'angel.co']
   instahyre: ['instahyre.com']
   greenhouse: ['greenhouse.io', 'boards.greenhouse.io']
   lever: ['jobs.lever.co', 'lever.co']
   workday: ['myworkdayjobs.com', 'workday.com']
   generic: [] (fallback)

2. FIELD_LABEL_MAP: Record<keyof FlatProfile, string[]>
   This is the most important constant. For every profile key, list ALL the label variations you'd ever see on a job application form. Be exhaustive — include Indian job portal conventions too.
   
   Examples:
   fullName: ['full name', 'your name', 'applicant name', 'name', 'candidate name', 'first and last name']
   firstName: ['first name', 'given name', 'fname']
   lastName: ['last name', 'surname', 'family name', 'lname']
   email: ['email', 'email address', 'e-mail', 'work email', 'personal email']
   phone: ['phone', 'mobile', 'phone number', 'mobile number', 'contact number', 'whatsapp number']
   currentCTC: ['current ctc', 'current salary', 'current package', 'ctc', 'annual ctc', 'fixed ctc', 'cost to company']
   expectedCTC: ['expected ctc', 'expected salary', 'salary expectation', 'desired salary', 'expected package']
   noticePeriod: ['notice period', 'notice period (days)', 'notice period (weeks)', 'joining time', 'available from', 'earliest joining']
   totalYearsExp: ['years of experience', 'total experience', 'work experience', 'experience', 'years exp', 'relevant experience']
   currentTitle: ['current designation', 'current role', 'job title', 'current position', 'designation']
   currentCompany: ['current company', 'current employer', 'employer', 'company name', 'organisation']
   linkedinUrl: ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin link']
   githubUrl: ['github', 'github url', 'github profile', 'github link']
   portfolioUrl: ['portfolio', 'portfolio url', 'website', 'personal website']
   city: ['city', 'current city', 'location', 'current location']
   state: ['state', 'province']
   country: ['country', 'country of residence']
   willingToRelocate: ['willing to relocate', 'open to relocation', 'can relocate']
   workAuthorization: ['work authorization', 'work permit', 'visa status', 'right to work', 'authorized to work']
   
   Cover at least 20 profile keys, 5–10 label variations each.

3. ATS_SELECTORS: Record<string, { nextButton: string, submitButton: string, formContainer: string }> — CSS selectors for each ATS:
   greenhouse: { nextButton: 'button[type=submit]', submitButton: '#submit_app', formContainer: '#application_form' }
   lever: { ... }
   workday: { ... }
   linkedin: { nextButton: 'button[aria-label="Continue to next step"]', submitButton: 'button[aria-label="Submit application"]', formContainer: '.jobs-easy-apply-modal' }

4. UNKNOWN_FIELD_HIGHLIGHT_STYLE: string — inline CSS to highlight unknown fields in orange.

5. FILLED_FIELD_HIGHLIGHT_STYLE: string — inline CSS to subtly highlight filled fields in green (light, non-intrusive).

6. VERSION: string — '0.1.0'
```

---

### Prompt 5 — Utility Functions

```
Context: Chrome Extension "Job Autofill".
File: src/shared/utils.ts
Dependencies: src/shared/types.ts, src/shared/constants.ts

Write pure utility functions. Every function must be:
- Pure (no side effects)
- Fully typed (no any)
- Individually testable
- Documented with JSDoc

Functions to implement:

1. generateId(): string
   Returns a random UUID v4 string. Use crypto.randomUUID() if available, else fallback to Math.random() approach. No external library.

2. hashString(str: string): string
   Returns a simple, consistent hash of a string (used for labeling unknown fields). FNV-1a algorithm preferred. Max 8 chars output.

3. normalizeLabel(label: string): string
   Lowercases, trims, removes special characters, collapses multiple spaces. "Current CTC (in LPA):  " → "current ctc in lpa"

4. interpolateCoverLetter(template: string, vars: { company_name: string, job_title: string, your_name: string }): string
   Replaces {{company_name}}, {{job_title}}, {{your_name}} in the template string. Case-insensitive matching of placeholders.

5. extractCompanyFromPage(): string
   Reads document.title and common meta tags (og:site_name, og:title) to extract a company name. Returns empty string if not found.

6. extractJobTitleFromPage(): string
   Reads document.title, h1, and common job-title selectors to extract job title. Returns empty string if not found.

7. detectPortal(url: string): PortalName
   Given the current page URL, returns the matching PortalName using PORTAL_URLS constant. Returns 'generic' if no match.

8. isElementVisible(el: HTMLElement): boolean
   Returns true if element is in the viewport, not hidden, not display:none, not visibility:hidden, not zero dimensions.

9. waitForElement(selector: string, timeout?: number): Promise<HTMLElement>
   Returns a Promise that resolves with the element when it appears in DOM, rejects after timeout (default 5000ms). Uses MutationObserver internally, not polling.

10. simulateUserInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): void
    Sets element value AND dispatches input, change, and blur events so that React/Angular/Vue form frameworks detect the change. This is critical — naive el.value = x won't work on most modern job portals.

11. simulateSelectChange(el: HTMLSelectElement, value: string): boolean
    Tries to select an option by value, then by text content (case-insensitive). Returns true if successful, false if option not found.

12. formatCTC(value: number): string
    Formats a number as Indian LPA string: 1200000 → "12 LPA", 850000 → "8.5 LPA"

13. parseCTCInput(raw: string): number
    Parses "12 LPA", "12,00,000", "1200000", "12L" all to numeric value in rupees.

14. debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T
    Standard debounce implementation.
```

---

### Prompt 6 — Background Service Worker

```
Context: Chrome Extension "Job Autofill".
File: src/background/index.ts
Dependencies: src/shared/types.ts, src/shared/storage.ts, src/shared/utils.ts

Write the background service worker. MV3 service workers are ephemeral — never store state in memory.

Implement:

1. onInstalled listener:
   - On first install: initialize storage with DEFAULT_SETTINGS and empty profile/applications/coverLetters/learnedFields
   - On update: run a migration function (stub it — log "migration vX.X.X complete")
   - Open the popup/onboarding page on first install

2. Message handler (chrome.runtime.onMessage):
   Handle these message types (define a MessageType union in types.ts):
   
   - 'GET_PROFILE' → return await getProfile()
   - 'SAVE_PROFILE' → await saveProfile(message.payload), return { success: true }
   - 'LOG_APPLICATION' → await logApplication(message.payload), return { success: true }
   - 'LEARN_FIELD' → await learnField(message.labelHash, message.profileKey), return { success: true }
   - 'GET_SETTINGS' → return await getSettings()
   - 'PING' → return { alive: true } (used by content scripts to check if extension is active)

3. Tab update listener (chrome.tabs.onUpdated):
   When a tab completes loading on a job portal URL:
   - Detect the portal using detectPortal()
   - Send a 'PORTAL_DETECTED' message to the content script in that tab
   - Badge the extension icon with the portal abbreviation (e.g. "LI" for LinkedIn)

4. Error boundary: wrap all message handlers in try/catch. On error, return { success: false, error: error.message }.

5. Context invalidation guard: before any chrome API call in async code, check chrome.runtime.id is defined — if not, the service worker was invalidated.

Security rules to follow:
- Never eval() any string
- Never trust message.payload without type narrowing
- Always validate that sender.tab exists before sending tab messages
```

---

### Prompt 7 — Field Scanner (Core Engine Part 1)

```
Context: Chrome Extension "Job Autofill".
File: src/content/scanner.ts
Dependencies: src/shared/types.ts, src/shared/constants.ts, src/shared/utils.ts

This is the most important file in the project. Write it with extreme care.

The scanner reads all form fields on any page and returns structured FormField objects.

Export one main function:
  scanPageFields(): FormField[]

Implementation requirements:

1. Query all interactive form elements:
   - input (excluding type: hidden, submit, button, reset, image)
   - textarea
   - select
   - Elements with role="combobox", role="listbox", role="textbox"

2. For each element, extract its label using this priority order:
   a. Associated <label> via for/id linkage
   b. aria-label attribute
   c. aria-labelledby → find that element's text
   d. placeholder attribute
   e. Closest ancestor <label>
   f. Previous sibling text content (within 2 DOM levels)
   g. Parent's text content (trimmed, first 50 chars only)
   If none found: label = "unlabeled_field"

3. Determine field type from:
   - input type attribute
   - role attribute
   - Surrounding DOM structure
   - Placeholder text patterns

4. Filter out fields that are:
   - Not visible (use isElementVisible)
   - Already filled (el.value.trim() !== '' or el.checked)
   - Part of a CAPTCHA (detect by checking for common CAPTCHA selectors/class names: 'captcha', 'recaptcha', 'hcaptcha')
   - Hidden navigation fields (aria-hidden="true")

5. Return array of FormField objects. Sort by DOM order (use compareDocumentPosition).

Also export:
  scanForNextButton(): HTMLButtonElement | null
  Looks for "Next", "Continue", "Proceed" buttons (text-based + aria-label) that indicate multi-page form.

  scanForSubmitButton(): HTMLButtonElement | null  
  Looks for "Submit", "Apply Now", "Send Application" buttons.

  scanForCoverLetterField(): HTMLElement | null
  Looks for textarea with labels matching: "cover letter", "cover note", "message", "why are you interested", "why do you want to join"

Write defensive code. Every querySelector must be wrapped in try/catch. Never throw from this function — return [] on any error.
```

---

### Prompt 8 — Field Matcher (Core Engine Part 2)

```
Context: Chrome Extension "Job Autofill".
File: src/content/matcher.ts
Dependencies: src/shared/types.ts, src/shared/constants.ts, src/shared/utils.ts, src/shared/storage.ts
External: fuse.js (already installed)

Write the field matching engine that maps scanned FormField labels to UserProfile keys.

Export:
  matchFields(fields: FormField[], profile: UserProfile, learnedFields: Record<string, string>): FormField[]

Implementation:

1. Flatten the profile using flattenProfile() from storage.ts

2. Build a Fuse.js index from FIELD_LABEL_MAP:
   Create an array of { key: keyof FlatProfile, label: string } for every entry in FIELD_LABEL_MAP.
   Configure Fuse: { threshold: 0.3, keys: ['label'], includeScore: true }

3. For each FormField:
   a. Normalize its label using normalizeLabel()
   b. Check learnedFields first — if normalizeLabel(field.label) hash exists in learnedFields, use that mapping directly (confidence: 1.0)
   c. If not in learnedFields, run Fuse.js search
   d. If best match score < threshold (0.3): mark field.unknown = true, field.profileKey = undefined
   e. If match found: set field.profileKey, field.confidence = 1 - fuseScore

4. Special case handlers (exact match, no fuzzy needed):
   - If label contains "resume" or "cv" → type: 'file', profileKey: 'resumeFile'
   - If label contains "linkedin" → profileKey: 'linkedinUrl'
   - If label contains "github" → profileKey: 'githubUrl'
   - If label contains "portfolio" or "website" → profileKey: 'portfolioUrl'

5. Return the array of FormField with profileKey and confidence populated.

Also export:
  getProfileValue(profileKey: string, flatProfile: FlatProfile): string
  Returns the profile value for a key, formatted appropriately:
  - CTC values → formatted with formatCTC()
  - Boolean → 'Yes' / 'No'
  - Arrays → joined with ', '
  - Dates → 'YYYY-MM' format
  - undefined/null → empty string

Write unit tests for this file in src/content/matcher.test.ts using Vitest.
Test cases:
- "Current CTC (in LPA)" matches currentCTC
- "LinkedIn Profile URL" matches linkedinUrl
- "Why do you want to join us?" returns unknown:true
- Learned field mapping overrides fuzzy match
```

---

### Prompt 9 — Field Filler (Core Engine Part 3)

```
Context: Chrome Extension "Job Autofill".
File: src/content/filler.ts
Dependencies: src/shared/types.ts, src/shared/utils.ts

Write the field filler. This runs after matching and actually fills the DOM elements.

Export:
  fillFields(fields: FormField[], flatProfile: FlatProfile, settings: AppSettings): FillResult

Where FillResult is:
  { filled: number, skipped: number, unknown: FormField[], errors: string[] }

Implementation:

1. Iterate over matched fields (skip unknown ones — they get highlighted instead):

2. For each field type, use the appropriate fill strategy:

   TEXT / EMAIL / TEL / URL inputs:
   - Use simulateUserInput(el, value)
   - Add a small delay (50ms) between fills to avoid triggering anti-bot detection
   - After filling, verify el.value === value (some frameworks override)

   TEXTAREA:
   - Same as text, but check if there's a character/word limit (maxlength attribute or aria-describedby pointing to counter)
   - If limit exists, truncate value to fit

   SELECT:
   - Use simulateSelectChange(el, value)
   - If value not found in options, try to find closest match (e.g. "30 days" when profile has "30")
   - If still no match, add to errors list but continue

   RADIO groups:
   - Find all radios with the same name attribute
   - Match profile value to option labels (Yes/No/True/False, city names, etc.)
   - Click the matching one

   CHECKBOX:
   - For single checkboxes (e.g. "I agree to terms") — leave untouched, never auto-check agreement boxes
   - For boolean profile fields — click if profile value is true

   FILE inputs:
   - Skip (cannot be filled programmatically — browser security)
   - Add to skipped list with reason "File upload requires manual selection"

3. For UNKNOWN fields:
   - If settings.highlightUnknownFields is true: apply UNKNOWN_FIELD_HIGHLIGHT_STYLE
   - Scroll the first unknown field into view
   - Add to result.unknown array

4. For FILLED fields:
   - Apply FILLED_FIELD_HIGHLIGHT_STYLE (subtle green outline)
   - Set field.filled = true

5. Return FillResult summary.

Error handling:
- If filling an element throws, catch it, add to errors[], continue to next field
- Never throw from fillFields() — always return a result object
- Log all actions with prefix "[JobAutofill Filler]" for debugging

Performance: total fill operation should complete in under 500ms for typical 20-field form.
```

---

### Prompt 10 — DOM Observer (Multi-Page Handler)

```
Context: Chrome Extension "Job Autofill".
File: src/content/observer.ts
Dependencies: src/shared/types.ts, src/shared/utils.ts

Write a MutationObserver-based module that detects when new form pages load (for multi-page forms) and triggers re-scanning.

Export:
  class FormObserver {
    constructor(onNewPage: (fields: FormField[]) => void, onFormComplete: () => void)
    start(): void
    stop(): void
    isActive(): boolean
  }

Implementation:

1. Observe the document.body for:
   - childList + subtree changes (new DOM nodes = possible new form page)
   - Attribute changes on the form container

2. When a mutation fires:
   - Debounce by 300ms (don't fire on every keystroke)
   - Check if the set of visible form fields has meaningfully changed:
     * New fields appeared that weren't there before
     * Old fields disappeared (page navigation within SPA)
   - If changed: call onNewPage with newly scanned fields

3. Detect form completion:
   - Watch for success/confirmation messages: elements with text matching "application submitted", "thank you for applying", "we've received your application"
   - Watch for URL changes (pushState/replaceState) that indicate navigation away from form
   - When detected: call onFormComplete()

4. Override history methods to catch SPA navigation:
   const _pushState = history.pushState.bind(history)
   history.pushState = function(...args) { _pushState(...args); handleNavigation() }
   Same for replaceState.

5. Handle cleanup — stop() must:
   - Disconnect the MutationObserver
   - Restore history.pushState and history.replaceState to originals
   - Remove all event listeners added by this class

Do not use polling (setInterval). MutationObserver only.
```

---

### Prompt 11 — Content Script Entry Point

```
Context: Chrome Extension "Job Autofill".
File: src/content/index.ts
Dependencies: All content/ files and shared/ files

Write the content script entry point. This file is injected into every page.

Implementation:

1. On load:
   - Detect portal using detectPortal(window.location.href)
   - Ping background script to verify extension is active
   - If portal detected, set badge (message to background)
   - Listen for messages from popup and background

2. Message handlers (chrome.runtime.onMessage):
   
   'TRIGGER_AUTOFILL':
     a. Get profile and settings from storage
     b. If profile is null or profile.personal.email is empty: send 'PROFILE_INCOMPLETE' message back, stop
     c. Get learned fields from storage
     d. Scan fields: scanPageFields()
     e. Match fields: matchFields(scannedFields, profile, learnedFields)
     f. Fill fields: fillFields(matchedFields, flatProfile, settings)
     g. Send result back to popup: { filled, skipped, unknown, errors }
     h. Start FormObserver for multi-page handling
   
   'FILL_COVER_LETTER':
     a. Find cover letter field: scanForCoverLetterField()
     b. If found: get template, interpolate, fill using simulateUserInput
     c. Return { success, field_found }
   
   'GET_PAGE_INFO':
     Return { company: extractCompanyFromPage(), jobTitle: extractJobTitleFromPage(), portal: detectPortal(window.location.href) }
   
   'LEARN_FIELD_MAPPING':
     Call learnField() with payload. Confirm to user.

3. FormObserver callbacks:
   onNewPage: automatically re-fill new fields that appear (only auto-fill already-known fields; unknown fields still pause)
   onFormComplete: send 'APPLICATION_COMPLETE' to background with page info for auto-logging

4. Security:
   - Only accept messages from chrome.runtime (not from web pages)
   - Validate message structure before processing: check message.type is a known type
   - Never eval() message content
   - Never send DOM elements over message channel (not serializable)

5. Isolation: use an IIFE to avoid polluting global scope. Check if already initialized to prevent double-injection.
```

---

### Prompt 12 — Build Verification

```
Context: Chrome Extension "Job Autofill". All Phase 1 files are written.

Do the following:
1. Check that manifest.json is valid MV3 format
2. Verify all imports in every file resolve correctly (no missing modules)
3. Run TypeScript compiler check: ensure zero type errors across all files
4. Check that vite.config.ts correctly references manifest.json and all entry points
5. Verify the CRXJS plugin config is correct for MV3
6. Add a .gitignore with: node_modules/, dist/, .env, *.pem, *.crx
7. Add npm scripts to package.json:
   - "dev": vite build --watch (for development)
   - "build": vite build (for production)
   - "test": vitest run
   - "test:watch": vitest
   - "type-check": tsc --noEmit

Then write a README.md section titled "Development Setup" with:
- Prerequisites (Node 20+, Chrome 120+)
- Install: npm install
- Dev: npm run dev → then load unpacked extension from dist/ folder
- Test: npm test
- Build: npm run build

If any type errors exist, list them and fix them now before proceeding to Phase 2.
```

---

## PHASE 2 — Popup UI
**Goal:** Complete React popup with Profile editor, Cover Letters manager, and Application Tracker.
**Duration:** ~3–4 hours
**Prompts:** 13–25

---

### Prompt 13 — Popup App Shell

```
Context: Chrome Extension "Job Autofill". Phase 1 complete. Now building the popup UI.
File: src/popup/App.tsx + src/popup/main.tsx

The popup is a 380px wide React app (standard extension popup width).

Write App.tsx with:
1. Tab navigation: Profile | Cover Letters | Tracker | Settings
   - Tabs are icons + labels, fixed at bottom of popup
   - Use Tailwind for all styling
   - Active tab has a blue indicator
   
2. State: current tab (useState)

3. Lazy-load each page component (React.lazy + Suspense with a spinner fallback)

4. A top header bar showing:
   - Extension name "Job Autofill" (small, muted)
   - A status pill showing: "Profile complete" (green) or "Setup needed" (amber)
   - Status is derived by loading profile from storage on mount

5. An "Auto-fill this page" prominent button that:
   - Is only shown when a job portal is detected on the active tab
   - Sends 'TRIGGER_AUTOFILL' message to content script
   - Shows loading spinner while running
   - Shows result: "Filled 12 fields · 2 unknown" or error message
   - Detects active tab portal by sending 'GET_PAGE_INFO' to content script on popup open

Write main.tsx:
   Standard React 18 createRoot, imports App, imports global CSS.

Tailwind classes only — no inline styles, no CSS modules, no external UI libraries.
Use only React built-ins — no Zustand, Redux, or other state managers at this stage.
```

---

### Prompt 14 — Profile Page (Personal Info)

```
Context: Chrome Extension "Job Autofill". Popup shell exists (App.tsx done).
File: src/popup/pages/Profile.tsx

Write the Profile page. It is the most important page — users spend most time here on first setup.

Split into sections (accordion or tabs within the page):
  1. Personal Info
  2. Professional Info  
  3. Education
  4. Experience
  5. Skills & Languages

Section 1 — Personal Info fields:
  Full Name, First Name, Last Name, Email, Phone, City, State, Country, LinkedIn URL, GitHub URL, Portfolio URL

Section 2 — Professional Info fields:
  Current Job Title, Current Company, Total Years of Experience (number input),
  Notice Period (number, days), Current CTC (number, LPA), Expected CTC (number, LPA),
  Work Authorization (text), Willing to Relocate (checkbox), Preferred Locations (comma-separated text → stored as string[])

Section 3 — Education (dynamic list):
  Add/remove education entries. Each: Degree, Field of Study, Institution, Graduation Year, Percentage/CGPA.
  "Add Education" button adds a new entry.

Section 4 — Experience (dynamic list):
  Add/remove work experience entries. Each: Job Title, Company, Start Date, End Date, Currently Working Here (checkbox, disables End Date), Description (textarea).

Section 5 — Skills & Languages:
  Skills: tag-style input — type and press Enter to add, click X to remove
  Languages: same

Behaviour:
- Load existing profile from chrome.storage on mount
- Auto-save on blur of each field (not on keystroke — avoids excessive writes)
- Show a small "Saved" toast on successful save
- Validate: email format, URL format for LinkedIn/GitHub/Portfolio, non-negative numbers for CTC/experience
- Show validation errors inline below each field
- "Resume Upload" button at top: file picker for PDF only, on select: parse resume using PDF.js and auto-populate all fields (stub the parser for now — just show "Resume parsed" toast, actual parsing comes in Phase 3)

All Tailwind. Clean, professional form UI.
```

---

### Prompt 15 — Cover Letters Page

```
Context: Chrome Extension "Job Autofill". Profile page is done.
File: src/popup/pages/CoverLetters.tsx

Write the Cover Letters management page.

Layout:
- List of saved templates on the left (or top on mobile)
- Editor on the right (or below)

List panel:
- Shows each template's name
- Selected template highlighted
- "New Template" button
- Delete button (with confirmation) on hover

Editor panel:
- Template name input (e.g. "Frontend roles", "Startup apply", "Senior eng roles")
- Large textarea for the cover letter body
- Placeholder variables helper: show a small legend: {{company_name}} · {{job_title}} · {{your_name}}
- Clicking a variable tag in the legend inserts it at cursor position in textarea
- Character count displayed (most cover fields have 2000 char limits)

Live preview:
- Below the editor: a preview pane that shows the interpolated result using dummy values:
  company_name = "Acme Corp"
  job_title = "Senior Software Engineer"
  your_name = (pulled from stored profile.personal.fullName)
- Preview updates in real-time as user types

Actions:
- "Save Template" button → saves to chrome.storage via saveCoverLetter()
- "Set as Default" → updates settings.defaultCoverLetterId
- Templates marked as default show a small "Default" badge

On first open (no templates exist):
- Show a helpful empty state with a "Create your first template" button
- Pre-fill the editor with a starter template showing how placeholders work:
  "Dear Hiring Team at {{company_name}},\n\nI'm excited to apply for the {{job_title}} position..."

Validations: Name required. Body minimum 50 characters.
```

---

### Prompt 16 — Application Tracker Page

```
Context: Chrome Extension "Job Autofill". Cover letters page is done.
File: src/popup/pages/Tracker.tsx

Write the Application Tracker page.

Display all logged applications from chrome.storage in a list.

Each application card shows:
- Company name (bold) + Role title
- Portal badge (LinkedIn / Naukri / etc.) — color-coded
- Date applied (relative: "2 days ago", "Today")
- Status badge — color coded:
  applied (blue) | seen (purple) | interview (amber) | rejected (red) | offer (green)

Interactions:
- Click status badge → cycle to next status (applied → seen → interview → rejected → offer → applied)
- Or show a small dropdown with all statuses on click
- Click company name → open the application URL in a new tab
- Hover card → show "Add note" button
- "Add note" → inline editable textarea, saves on blur

Filters bar at top:
- Search: filter by company or role name
- Status filter: dropdown ("All", "Applied", "Interview", "Rejected", "Offer")
- Sort: "Newest first" / "Oldest first"

Summary stats at very top (3 small metric cards in a row):
- Total applied (number)
- Interview rate (% of applied that became interview)
- This week (number applied in last 7 days)

Empty state: "No applications yet. Start applying and they'll appear here automatically."

All filtering/sorting happens in component state (no storage reads). Load once on mount.
```

---

### Prompt 17 — Settings Page

```
Context: Chrome Extension "Job Autofill". Tracker page is done.
File: src/popup/pages/Settings.tsx

Write the Settings page.

Settings to display:

1. Auto-fill behaviour:
   - Toggle: "Auto-fill when page loads" (AppSettings.autoFillOnLoad) — OFF by default, show warning "May cause issues on some sites"
   - Toggle: "Pause before submitting" (AppSettings.pauseBeforeSubmit) — should be ON by default
   - Toggle: "Highlight unknown fields in orange" (AppSettings.highlightUnknownFields)

2. Cover Letter:
   - Dropdown: "Default cover letter template" — shows all saved templates by name

3. Appearance:
   - Radio group: Theme — Light / Dark / System

4. Data management:
   - "Export my data" button → export profile + cover letters + applications as JSON download
   - "Import data" button → file picker for JSON, import and overwrite storage
   - "Clear all data" button → confirmation dialog, then calls clearAllData()

5. About section:
   - Version number (from VERSION constant)
   - Link to GitHub (placeholder URL)
   - "Report an issue" link

Behaviour:
- All toggles/selects save immediately on change using saveSettings()
- No save button needed
- Show "Saved" indicator briefly after each change

Export/Import implementation:
- Export: JSON.stringify({ profile, coverLetters, applications, settings }) → Blob → download link
- Import: FileReader → parse JSON → validate structure → save to storage → reload page

Implement the JSON export and import fully (not as stubs).
```

---

### Prompt 18 — Popup Communication Layer

```
Context: Chrome Extension "Job Autofill". All popup pages are written.
File: src/popup/hooks/useExtension.ts (create this file)

Write a custom React hook that handles all communication between the popup and the extension (background + content scripts).

Export:
  useExtension(): {
    pageInfo: { company: string, jobTitle: string, portal: PortalName } | null
    isJobPage: boolean
    isFilling: boolean
    lastResult: FillResult | null
    triggerAutofill: () => Promise<void>
    fillCoverLetter: (templateId: string) => Promise<void>
    learnFieldMapping: (labelHash: string, profileKey: string) => Promise<void>
  }

Implementation:
1. On mount: query the active tab, send 'GET_PAGE_INFO' to content script, set pageInfo state
2. isJobPage: true when portal !== 'generic'
3. triggerAutofill():
   - Set isFilling = true
   - Send 'TRIGGER_AUTOFILL' to content script in active tab
   - Await response (use chrome.tabs.sendMessage with a Promise wrapper)
   - Set lastResult = response
   - Set isFilling = false
4. Handle the case where content script is not yet injected (tabs that were open before extension install):
   - Use chrome.scripting.executeScript to inject it first, then retry the message
5. All chrome API calls wrapped in try/catch. On error, set lastResult = { filled: 0, skipped: 0, unknown: [], errors: [error.message] }

Also write a utility:
  sendTabMessage<T>(tabId: number, message: unknown): Promise<T>
  Wraps chrome.tabs.sendMessage in a Promise with a 5s timeout.
```

---

### Prompt 19 — Unknown Fields UI (Learn Mode)

```
Context: Chrome Extension "Job Autofill". Popup UI is mostly done.

When triggerAutofill() returns unknown fields, the popup should help the user handle them.

Modify src/popup/App.tsx to add an "Unknown Fields" panel that appears below the auto-fill button when lastResult.unknown.length > 0.

Panel UI:
- Title: "X fields need your input"
- List each unknown field by its label (e.g. "Why are you interested in this role?", "Preferred work mode")
- For each unknown field:
  - Show the field label
  - A text input where user can type the answer
  - A "Save to profile" toggle — if ON, the answer gets learned for future forms
  - A "Fill this field" button → sends a targeted fill message to content script

Also add a global "Fill all above + continue" button that:
1. For each unknown field where user typed an answer:
   - If "Save to profile" is on: send LEARN_FIELD_MAPPING message
   - Fill the field on the page
2. Then re-trigger the form observer to check if form is ready to proceed

This creates a self-improving loop — the more the user uses the extension, the fewer unknowns appear.

Add to useExtension hook:
  fillSingleField(fieldLabel: string, value: string): Promise<void>
  Sends 'FILL_SINGLE_FIELD' message to content script with { label: string, value: string }.

Handle this message in src/content/index.ts:
  Find the field whose label matches, fill it with simulateUserInput.
```

---

### Prompt 20 — Popup Polish & Error States

```
Context: Chrome Extension "Job Autofill". All popup pages and hooks are written.

Add error handling and loading states throughout the popup.

1. Create src/popup/components/Toast.tsx:
   A toast notification system. API:
   showToast(message: string, type: 'success' | 'error' | 'info', duration?: number)
   
   Implementation: a fixed-position stack of toasts (bottom-right of popup). Auto-dismiss after duration (default 3000ms). Animate in/out with CSS transitions (Tailwind's transition classes).
   Export a useToast() hook and a <ToastContainer /> component.

2. Create src/popup/components/Spinner.tsx:
   A simple loading spinner component. Takes size prop ('sm' | 'md' | 'lg').

3. Create src/popup/components/ConfirmDialog.tsx:
   A simple confirmation dialog (for "Clear all data"). Takes: title, message, confirmLabel, onConfirm, onCancel.

4. Error boundaries:
   Wrap each page in an ErrorBoundary component that shows a friendly "Something went wrong. Please reload the extension." message instead of crashing.
   Write src/popup/components/ErrorBoundary.tsx as a class component (required for React error boundaries).

5. Loading state for initial data load:
   Show a skeleton loader (grey boxes using Tailwind animate-pulse) while profile/applications are loading from storage on first mount.

6. Empty states for all pages — if no profile filled, show a prominent "Complete your profile first" CTA that navigates to the Profile tab.

All components: typed props, no any.
```

---

### Prompt 21 — Popup Entry HTML + Icons

```
Context: Chrome Extension "Job Autofill".
Files: popup/index.html, public/icons/

1. Write popup/index.html:
   - Standard HTML5 boilerplate
   - Set width: 380px, min-height: 500px, max-height: 600px on body
   - Link to main.tsx (Vite handles bundling)
   - Set font: system-ui fallback (Tailwind default)
   - Dark mode: add class="dark" to <html> when settings.theme is 'dark'
   - No inline scripts (MV3 CSP forbids it)

2. Create placeholder SVG icons for the extension (16x16, 32x32, 48x48, 128x128):
   A simple briefcase SVG icon in brand blue (#3B82F6). Write the actual SVG code for each size.
   Save as: public/icons/icon16.svg, icon32.svg, icon48.svg, icon128.svg

3. Update manifest.json icons section to point to these files.

4. Add a popup min-width constraint: the popup should never be narrower than 360px.

5. Add Content Security Policy to manifest.json:
   "content_security_policy": {
     "extension_pages": "script-src 'self'; object-src 'self'"
   }
   This is required for MV3 security.
```

---

### Prompt 22 — Resume Parser Integration (PDF.js)

```
Context: Chrome Extension "Job Autofill".
File: src/popup/utils/resumeParser.ts (create this file)
External: pdfjs-dist (already installed)

Write a resume parser that extracts profile data from a PDF resume.

Export:
  parseResume(file: File): Promise<Partial<UserProfile>>

Implementation:

1. Load the PDF using PDF.js:
   - Set workerSrc to the pdfjs-dist worker (important for MV3 — use local copy, not CDN)
   - Extract text from all pages

2. From the extracted text, use regex patterns to extract:
   - Email: standard email regex
   - Phone: Indian phone formats (+91, 10-digit mobile)
   - LinkedIn URL: linkedin.com/in/... pattern
   - GitHub URL: github.com/... pattern
   - Name: First line of resume that's 2-4 words and all caps or title case (heuristic)
   - Skills: Look for a "Skills" section header, extract comma/bullet-separated items below it
   - Companies: Look for text patterns near date ranges (Month YYYY – Month YYYY or "Present")
   - Education: Look for degree keywords (B.Tech, B.E., M.Tech, MBA, BCA, MCA, B.Sc) + institution name

3. Return Partial<UserProfile> — only fields that were successfully extracted.

4. After parsing, merge with existing profile (don't overwrite fields that already have data).

Limitations to handle gracefully:
- Scanned PDFs (image-based): text extraction returns empty → return empty object with a warning
- Password-protected PDFs: PDF.js throws → catch and return { _error: 'Password protected PDF' }
- Very large PDFs (>5MB): warn but still process

Wire this into the Profile page:
  In Profile.tsx, the "Upload Resume" button already exists (stub from Prompt 14).
  Now connect it: on file select → parseResume(file) → merge result into form state → show toast "Resume parsed — please review and complete missing fields"
```

---

### Prompt 23 — Portal Module: LinkedIn

```
Context: Chrome Extension "Job Autofill".
File: src/content/portals/linkedin.ts
Dependencies: src/shared/types.ts, src/shared/utils.ts, src/content/scanner.ts, src/content/filler.ts

Write the LinkedIn-specific portal module.

LinkedIn has two apply flows. This module handles both.

Export:
  class LinkedInPortal {
    isApplicable(): boolean
    getApplyType(): 'easy-apply' | 'external-apply' | 'none'
    handleEasyApply(profile: UserProfile, settings: AppSettings): Promise<FillResult>
    getExternalApplyUrl(): string | null
    extractJobInfo(): { company: string, title: string, location: string }
  }

isApplicable(): Check if current URL matches linkedin.com/jobs/

getApplyType():
  - Look for button with aria-label="Easy Apply" → return 'easy-apply'
  - Look for button with aria-label="Apply" that opens external URL → return 'external-apply'
  - Otherwise 'none'

handleEasyApply():
  1. Click the Easy Apply button (find by aria-label)
  2. Wait for modal to appear: waitForElement('.jobs-easy-apply-modal', 3000)
  3. Scan fields in the modal only (scope querySelector to modal)
  4. Match and fill
  5. Check for "Next" button in modal: scanForNextButton() within modal scope
  6. If next button found and settings.pauseBeforeSubmit is false: click it, wait for next page, repeat
  7. If pauseBeforeSubmit is true: stop, return result, let user proceed manually
  8. Return FillResult

getExternalApplyUrl():
  Find the Apply button, return its href (the external URL the user will be redirected to)

extractJobInfo():
  Selectors for LinkedIn job page:
  - Title: '.jobs-unified-top-card__job-title' or h1
  - Company: '.jobs-unified-top-card__company-name' or '.topcard__org-name-link'
  - Location: '.jobs-unified-top-card__bullet'

Note: LinkedIn frequently changes selectors. Write them as constants at the top of the file so they're easy to update.
```

---

### Prompt 24 — Portal Module: Naukri

```
Context: Chrome Extension "Job Autofill".
File: src/content/portals/naukri.ts

Write the Naukri-specific portal module.

Export:
  class NaukriPortal {
    isApplicable(): boolean
    handleApply(profile: UserProfile, settings: AppSettings): Promise<FillResult>
    extractJobInfo(): { company: string, title: string, location: string }
  }

handleApply():
1. Find and click the Apply button:
   Selector: 'button[id="apply-button"]' or 'a.apply-button' or text "Apply"
2. Wait for apply form/modal to appear
3. Common Naukri-specific fields to handle:
   - Current CTC: input with label "Current CTC" (usually in lakhs) — fill with formatCTC(profile.professional.currentCTC) or the raw number
   - Expected CTC: same
   - Notice period: dropdown — match to options ("15 days or less", "1 Month", "2 Months", "3 Months") based on profile.professional.noticePeriod
   - Total experience: dropdown with year ranges ("0-1 years", "1-2 years", etc.)
4. Resume: Naukri has a "Use my Naukri resume" option (user is logged in) — click that radio button, don't try to upload
5. Cover note (if present): paste template
6. Return FillResult

Notice period dropdown matching logic:
  Profile value is in days. Match to Naukri's dropdown options:
  ≤15 → "15 days or less"
  16–30 → "1 Month"
  31–60 → "2 Months"
  61–90 → "3 Months"
  >90 → "More than 3 Months"

extractJobInfo():
  Selectors for Naukri job detail page (these change frequently — put in top-of-file constants):
  - Title: 'h1.styles_jd-header-title'
  - Company: 'a.styles_comp-name'
  - Location: '.styles_jhc__loc'
```

---

### Prompt 25 — ATS Module: Greenhouse & Lever

```
Context: Chrome Extension "Job Autofill".
Files: src/content/ats/greenhouse.ts, src/content/ats/lever.ts

Write ATS-specific modules for Greenhouse and Lever. These are the two most common ATS platforms.

GREENHOUSE (boards.greenhouse.io):

Export class GreenhouseATS:
  isApplicable(): Check URL contains 'greenhouse.io'
  
  handleApplication(profile: UserProfile, settings: AppSettings): Promise<FillResult>
  
  Greenhouse form structure:
  - Standard HTML form (not SPA) — one long page or a few sections
  - Fields have clear labels associated via <label for="...">
  - File upload for resume: id="resume" — skip, flag as manual
  - Cover letter: id="cover_letter" textarea
  - Custom questions: section with class "custom-fields" — scan these with generic scanner
  
  Use the generic scanner + filler for most fields.
  Greenhouse-specific overrides:
  - Phone field format: may expect "(xxx) xxx-xxxx" US format even for Indian companies — fill raw, let validation catch it
  - LinkedIn URL field: id="linkedin_profile"

LEVER (jobs.lever.co):

Export class LeverATS:
  isApplicable(): Check URL contains 'lever.co'
  
  handleApplication(profile: UserProfile, settings: AppSettings): Promise<FillResult>
  
  Lever form structure:
  - React-based SPA — fields are controlled components
  - Critical: must use simulateUserInput (React onChange simulation) or values won't register
  - Form is usually one long page
  - Fields: name, email, phone, org (current company), urls (linkedin, github, portfolio, others)
  - Resume: file upload — skip
  - Additional info (cover): textarea with id="additional"
  
  Lever-specific field IDs (hardcoded, they're consistent):
  name: input[name="name"]
  email: input[name="email"]
  phone: input[name="phone"]
  org: input[name="org"]
  linkedin: input[placeholder*="LinkedIn"]
  github: input[placeholder*="GitHub"]

Both classes should call the generic scanner for any fields not handled by their specific logic.
```

---

## PHASE 3 — Intelligence Layer
**Goal:** Self-learning field memory, cover letter variable system, per-portal detection.
**Duration:** ~2–3 hours
**Prompts:** 26–35

---

### Prompt 26 — Learned Fields Engine

```
Context: Chrome Extension "Job Autofill". Phase 2 complete.
Files: Modify src/content/matcher.ts, src/shared/storage.ts

Upgrade the field learning system.

Problem: When a user manually answers an unknown field and marks "Save to profile", we store a mapping of that field's label → profileKey. But we need this to work correctly across different sites with slightly different labels.

Changes to make:

1. In storage.ts, upgrade learnField():
   - Store BOTH the normalized label AND the hash as keys
   - Store with metadata: { profileKey: string, learnedAt: number, timesUsed: number, sites: string[] }
   - Update timesUsed and sites[] every time this mapping is used

2. In matcher.ts, upgrade the matching pipeline:
   New priority order:
   1. Exact learned field hash match (confidence 1.0)
   2. Normalized label exact match in FIELD_LABEL_MAP (confidence 1.0)
   3. Fuzzy match in FIELD_LABEL_MAP (confidence based on Fuse score)
   4. Fuzzy match in learned fields (normalize label, then fuzzy against all learned labels)
   5. Unknown (confidence 0)

3. Add a "confidence threshold" — if confidence < 0.5, treat as unknown even if a match was found (don't auto-fill with low-confidence guesses)

4. Export: getLearnedFieldStats(): Promise<{ totalLearned: number, mostUsed: { label: string, count: number }[] }>
   Used in Settings page to show "You've taught the extension 23 custom fields."

5. Add: exportLearnedFields(): Promise<Record<string, LearnedField>> and importLearnedFields(data)
   So users can share their learned field sets (useful for the future community feature).
```

---

### Prompt 27 — Cover Letter Variable Expander

```
Context: Chrome Extension "Job Autofill".
File: src/shared/coverLetterEngine.ts (create this file)

Write an enhanced cover letter interpolation engine.

Variables supported:
  {{company_name}} — from page extraction or manual input
  {{job_title}} — from page extraction
  {{your_name}} — from profile.personal.fullName
  {{your_email}} — from profile.personal.email
  {{your_phone}} — from profile.personal.phone
  {{current_role}} — from profile.professional.currentTitle
  {{years_exp}} — from profile.professional.totalYearsExp
  {{top_skills}} — first 3 skills from profile.skills, joined with ", "
  {{notice_period}} — from profile.professional.noticePeriod, formatted as "X days"
  {{linkedin}} — from profile.personal.linkedinUrl
  {{today_date}} — current date formatted as "June 5, 2026"

Export:
  expandCoverLetter(template: CoverLetterTemplate, profile: UserProfile, pageContext: { company: string, jobTitle: string }): string
  
  Implementation:
  - Replace all {{variable}} occurrences (case-insensitive, allow spaces inside braces)
  - If a variable has no value in profile (empty string), replace with [VARIABLE_NAME] so user knows what's missing
  - Never silently remove a variable — always indicate what was missing
  
  validateTemplate(template: string): { valid: boolean, missingVariables: string[], unknownVariables: string[] }
  - Returns which variables are used but not in supported list (typos)
  - Returns which profile fields are empty for variables used

  getPreviewValues(profile: UserProfile): Record<string, string>
  - Returns all variable → value mappings for preview display in popup
  - Uses "Acme Corp" and "Software Engineer" as company/jobTitle placeholders
```

---

### Prompt 28 — Multi-Page Form State Machine

```
Context: Chrome Extension "Job Autofill".
File: src/content/formStateMachine.ts (create this file)

Write a state machine that manages the multi-page form filling process.

States:
  IDLE → SCANNING → FILLING → WAITING_FOR_USER → NAVIGATING → COMPLETE → ERROR

Transitions:
  IDLE → SCANNING: trigger received from popup
  SCANNING → FILLING: scan complete, fields found
  FILLING → WAITING_FOR_USER: unknown fields detected, OR pauseBeforeSubmit=true on last page
  FILLING → NAVIGATING: no unknowns, next button found, pauseBeforeSubmit=false
  FILLING → COMPLETE: no unknowns, no next button (final page), auto-submit disabled
  NAVIGATING → SCANNING: next page loaded (observer fires)
  WAITING_FOR_USER → FILLING: user signals "continue" from popup
  Any → ERROR: exception thrown

Export:
  class FormStateMachine {
    state: FormState
    pageNumber: number
    totalFilled: number
    totalUnknown: FormField[]
    
    start(profile: UserProfile, settings: AppSettings): void
    continue(): void  // called when user clicks "Continue" from popup after reviewing unknowns
    stop(): void
    
    onStateChange(cb: (state: FormState, data: unknown) => void): void
  }

The state machine sends its state changes as messages to the popup so the popup can update its UI in real time.

Use this state machine in src/content/index.ts to orchestrate the autofill flow instead of ad-hoc logic.
```

---

### Prompt 29 — Site-Specific Selector Registry

```
Context: Chrome Extension "Job Autofill".
File: src/shared/selectorRegistry.ts (create this file)

Job portals change their DOM selectors frequently, breaking the extension. Centralise all selectors in one registry that is easy to update.

Write a SelectorRegistry class:

  class SelectorRegistry {
    getSelectors(portal: PortalName): PortalSelectors
    trySelectors(portal: PortalName, key: keyof PortalSelectors): Element | null
    // tries each selector in priority order, returns first match
  }

PortalSelectors interface:
  applyButton: string[]       // array of selectors, tried in order
  nextButton: string[]
  submitButton: string[]
  formContainer: string[]
  jobTitle: string[]
  companyName: string[]
  location: string[]
  easyApplyButton: string[]   // LinkedIn specific
  coverLetterField: string[]

Fill in real selectors for: linkedin, naukri, wellfound, instahyre, greenhouse, lever, workday.
Use arrays so if the first selector stops working, the second is tried automatically.

Add a fallback mechanism: if no portal-specific selector works, fall back to generic heuristics (button text matching, aria-label matching).

This makes the extension much more resilient to site updates.
```

---

### Prompt 30 — Auto-Logger & Application Tracker Backend

```
Context: Chrome Extension "Job Autofill".
File: src/content/autoLogger.ts (create this file)
Also modify: src/background/index.ts

When the extension detects a successful application submission, automatically log it.

Detection signals (any of these = application submitted):
  1. URL change to a "thank you" page (contains: "thank-you", "confirmation", "submitted", "success")
  2. New text appears on page matching: "application submitted", "thank you for applying", "we've received", "application received"
  3. Modal appears with success messaging
  4. Greenhouse: redirect to confirmation page at /confirmation
  5. Lever: "Thank you" h1 appears

Export:
  class AutoLogger {
    startWatching(): void
    stopWatching(): void
  }

On detection:
  1. Extract job info: { company, title, portal, url }
  2. Construct a JobApplication object:
     id: generateId()
     appliedAt: Date.now()
     status: 'applied'
     coverLetterUsed: the template id that was used (if any — pass this in from content/index.ts)
  3. Send 'LOG_APPLICATION' message to background
  4. Background saves to storage
  5. Send a success notification: chrome.notifications.create (basic type, "Application logged! Acme Corp - Senior Engineer")

Add to manifest.json permissions: "notifications"

Deduplication: before logging, check if an application with the same company + role was logged in the last 24 hours. If yes, skip (prevents double-logging from page refreshes).
```

---

### Prompt 31 — Workday ATS Module

```
Context: Chrome Extension "Job Autofill".
File: src/content/ats/workday.ts

Write the Workday ATS module. Workday is the hardest ATS to handle — it uses a complex React/Angular app with non-standard form controls.

Export class WorkdayATS:
  isApplicable(): boolean — URL contains 'myworkdayjobs.com' or 'workday.com'
  
  handleApplication(profile: UserProfile, settings: AppSettings): Promise<FillResult>

Workday-specific challenges and how to handle them:

1. Custom dropdown components (not <select>):
   Workday uses custom aria-expanded dropdowns. To fill them:
   a. Click the dropdown trigger (role="combobox" or role="listbox")
   b. Wait for options to appear
   c. Find the matching option by text
   d. Click it

2. Date fields: Workday uses separate month/day/year dropdowns
   Fill each separately.

3. Multi-step wizard: Workday applications are 4-8 steps
   Use FormStateMachine to navigate.

4. My Information section: standard fields — name, address, email, phone
5. My Experience section: work history and education entries — use profile arrays
6. Application questions: custom per-company — use generic scanner
7. Self Identify section: EEO questions — skip these entirely (never auto-fill demographic questions)

Write a specific helper:
  fillWorkdayDropdown(container: Element, value: string): Promise<boolean>
  That handles the custom Workday dropdown interaction.

Add 200ms delays between interactions (Workday's app needs time to update state).
```

---

### Prompt 32 — Security Hardening

```
Context: Chrome Extension "Job Autofill". Core features complete.

Apply security hardening across the entire codebase.

1. Content Script isolation:
   - Wrap all content script code in a closure to prevent global scope pollution
   - Check chrome.runtime.id at start of every async operation (service worker may have become invalid)
   - Add a message validation function: validateMessage(msg: unknown): msg is ExtensionMessage
     Check: msg is object, msg.type is string, msg.type is in known types list
     Reject any message that fails validation

2. Storage security:
   - Never store passwords or auth tokens
   - Add a storage size check: warn user if storage exceeds 4MB (chrome.storage.local limit is 5MB)
   - Sanitize all string values before storing: strip any <script> tags

3. XSS prevention in popup:
   - Never use dangerouslySetInnerHTML
   - The cover letter preview must use textContent, not innerHTML
   - All user-supplied text rendered via React (automatic escaping)

4. Input validation in popup forms:
   - Email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
   - Phone: allow digits, spaces, +, -, (, ) only
   - URLs: must start with https:// (or http:// for legacy)
   - CTC/salary fields: must be positive numbers, max 1000 (LPA)
   - Notice period: 0–365 days
   - Year: 1950–2030

5. Rate limiting:
   - Add a check: if TRIGGER_AUTOFILL received more than 3 times in 30 seconds, ignore subsequent requests (prevents runaway loops)

6. CSP compliance:
   - Audit all files: no eval(), no new Function(), no setTimeout(string)
   - External resources in popup: only load from known CDNs listed in CSP

Write a src/shared/security.ts file with: validateMessage(), sanitizeString(), validateProfile().
```

---

### Prompt 33 — Error Reporting & Debug Mode

```
Context: Chrome Extension "Job Autofill".
File: src/shared/logger.ts (create this file)

Write a logging system for debugging without exposing sensitive data.

Export:
  class Logger {
    static debug(module: string, message: string, data?: unknown): void
    static info(module: string, message: string, data?: unknown): void
    static warn(module: string, message: string, data?: unknown): void
    static error(module: string, message: string, error?: Error): void
  }

Rules:
- Only log when settings.debugMode is true (add debugMode: boolean to AppSettings)
- Prefix all logs: "[JobAutofill:MODULE]"
- Never log: email, phone, CTC values, cover letter content (these are PII)
- For UserProfile logs: only log which keys are filled, not their values
- Errors always logged regardless of debugMode

Add debug mode toggle to Settings page.

Also create a "diagnostic report" feature:
  generateDiagnosticReport(): Promise<string>
  Returns a JSON string with:
  - Extension version
  - Chrome version (navigator.userAgent parsed)
  - Profile completeness score (% of fields filled, NO values)
  - Number of cover letter templates
  - Number of applications logged
  - Learned fields count
  - Current portal detection result
  - Last fill result (anonymized)

Add "Copy diagnostic report" button to Settings page. User can paste this when reporting bugs.
```

---

### Prompt 34 — Performance Optimisation

```
Context: Chrome Extension "Job Autofill". Core features complete.

Optimise the extension for performance.

1. Lazy loading in content script:
   - The content script index.ts loads on EVERY page. Make it ultra-lightweight.
   - Import heavy modules (scanner, filler, matcher, PDF.js) only when TRIGGER_AUTOFILL message is received, not on page load.
   - Use dynamic import(): const { scanPageFields } = await import('./scanner')
   - This reduces initial page load impact to near zero.

2. Fuse.js index caching:
   - The Fuse.js index is rebuilt from FIELD_LABEL_MAP on every match call.
   - Cache it as a module-level singleton, rebuilt only when learnedFields changes.

3. Storage read batching:
   - In content/index.ts, when TRIGGER_AUTOFILL fires, read profile + settings + learnedFields in a single chrome.storage.local.get call rather than 3 separate calls.
   - Update storage.ts with: getAutofillData(): Promise<{ profile, settings, learnedFields }>

4. DOM query optimisation:
   - scanPageFields() currently queries ALL inputs. On some pages (Google Docs, complex SPAs), this can be thousands of elements.
   - Add a limit: if more than 50 form fields found, warn the user ("This page has an unusual number of fields — autofill may be slow.")
   - Use document.querySelectorAll with a scoped container when portal-specific (only query within formContainer).

5. Popup bundle size:
   - Run: npm run build and check dist/ sizes
   - Ensure no portal modules are bundled into the popup (they should be content-script only)
   - Tailwind purge should eliminate unused classes

6. Memory: in FormObserver, always call stop() when content script is about to be deactivated or when navigation away from job page is detected.
```

---

### Prompt 35 — Unit Tests (Phase 1-3 Coverage)

```
Context: Chrome Extension "Job Autofill". Phases 1-3 complete.
Files: src/**/*.test.ts

Write comprehensive unit tests using Vitest.

Test files to create:

1. src/shared/utils.test.ts:
   - normalizeLabel: 10 cases including edge cases (empty string, special chars, very long string)
   - interpolateCoverLetter: test all 3 variables, test missing variable, test unknown variable
   - detectPortal: all 7 portals + generic fallback
   - parseCTCInput: test "12 LPA", "12,00,000", "12L", "0", negative numbers
   - formatCTC: test 1200000 → "12 LPA", 850000 → "8.5 LPA", 0 → "0 LPA"

2. src/content/matcher.test.ts (already started in Prompt 8 — expand):
   - "Current CTC (in LPA)" → currentCTC (confidence > 0.8)
   - "LinkedIn Profile" → linkedinUrl
   - "Why do you want to join?" → unknown (no match)
   - Learned field takes priority over fuzzy match
   - Low-confidence match (< 0.5) treated as unknown

3. src/shared/storage.test.ts:
   - Mock chrome.storage.local
   - getProfile returns null when not set
   - saveProfile then getProfile returns same data
   - logApplication adds to array
   - updateApplicationStatus changes only the status field
   - clearAllData resets everything

4. src/shared/coverLetterEngine.test.ts:
   - All 10 variables expand correctly
   - Missing profile field replaced with [VARIABLE_NAME]
   - Unknown variable kept as-is with warning
   - validateTemplate catches typos

Mock chrome API: use vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(), set: vi.fn() } } })

Target: 80% coverage on src/shared/**, 70% on src/content/**
```

---

## PHASE 4 — Portal Expansion & Robustness
**Goal:** Wellfound + Instahyre modules, resilience improvements, selector update mechanism.
**Duration:** ~2 hours
**Prompts:** 36–45

---

### Prompt 36 — Wellfound & Instahyre Modules

```
Context: Chrome Extension "Job Autofill". Phase 3 complete.
Files: src/content/portals/wellfound.ts, src/content/portals/instahyre.ts

WELLFOUND (wellfound.com):

Export class WellfoundPortal:
  handleApplication(profile: UserProfile, settings: AppSettings): Promise<FillResult>
  extractJobInfo(): { company: string, title: string }

Wellfound specifics:
- Fields: name, email, phone, LinkedIn URL, GitHub URL, "Why are you interested?" textarea
- "Why interested?" → fill with first cover letter template's body (trimmed to 500 chars)
  or a short default: "I'm excited about [company]'s mission and believe my experience in [top skill] aligns well with the [job_title] role."
- Location: text input, fill with profile.personal.city
- Usually a single-page form — no pagination

Job info selectors (put in SelectorRegistry):
  Title: 'h1[class*="title"]' or page title
  Company: '.company-name' or og:site_name

INSTAHYRE (instahyre.com):

Export class InstahyrePortal:
  handleApplication(profile: UserProfile, settings: AppSettings): Promise<FillResult>
  extractJobInfo(): { company: string, title: string }

Instahyre specifics:
- Usually minimal form: current CTC, expected CTC, notice period
- These are dropdowns or text inputs
- Short cover message field (optional)
- Single-page, fast to fill

Both modules should use SelectorRegistry.trySelectors() for all DOM queries.
Both should return FillResult.
```

---

### Prompt 37 — Selector Self-Healing

```
Context: Chrome Extension "Job Autofill".
File: src/content/selectorHealer.ts (create this file)

When a known selector fails (returns null), attempt to find the element using heuristics.

Export:
  healSelector(portal: PortalName, selectorKey: keyof PortalSelectors, context?: Element): Element | null

Healing strategies (try in order):

1. Text-based search:
   For buttons: search all <button> and <a> elements for text matching the expected action
   applyButton candidates: text containing "apply", "submit application", "apply now"
   nextButton candidates: text containing "next", "continue", "proceed"
   submitButton candidates: text containing "submit", "apply"

2. Role-based search:
   Look for elements with role="button" and matching aria-label patterns

3. Structural heuristics:
   For formContainer: find the largest <form> element on the page
   For jobTitle: find the first <h1> on the page

4. If healing succeeds: log the healed selector for potential registry update

Also export:
  reportSelectorFailure(portal: PortalName, selectorKey: string): void
  Stores failures in chrome.storage for later analysis in Settings page.

  getSelectorHealth(): Promise<{ portal: PortalName, failures: Record<string, number> }[]>

In Settings page, add a "Selector Health" debug section (only visible when debugMode is on) showing which selectors have failed and how often.
```

---

### Prompt 38 — Keyboard Shortcuts

```
Context: Chrome Extension "Job Autofill".
Files: manifest.json, src/background/index.ts, src/popup/App.tsx

Add keyboard shortcuts for power users.

1. In manifest.json, add commands:
   "_execute_action" (built-in — opens popup): no change needed
   "trigger-autofill": suggested key Alt+Shift+F, description "Auto-fill current page"
   "open-tracker": suggested key Alt+Shift+T, description "Open application tracker"

2. In background/index.ts, handle chrome.commands.onCommand:
   "trigger-autofill":
     - Get active tab
     - Send TRIGGER_AUTOFILL to content script
     - Show notification with result

3. In popup: show keyboard shortcut hints next to the Auto-fill button:
   Small grey text: "Or press Alt+Shift+F"

4. Note in the UI: "Shortcuts can be customized at chrome://extensions/shortcuts"

Also add: when the popup opens, focus the "Auto-fill this page" button so user can press Enter immediately (keyboard-first UX).
```

---

### Prompt 39 — Onboarding Flow

```
Context: Chrome Extension "Job Autofill".
File: src/popup/pages/Onboarding.tsx (create this file)

Write a first-run onboarding experience shown after extension install.

Steps (4 steps, shown as a progress indicator):

Step 1 — Welcome:
  "Save hours on job applications"
  Bullet points: Auto-fill any job form, Works on LinkedIn, Naukri, Wellfound, Instahyre, and more. Your data stays local — never sent to any server.
  Button: "Get started"

Step 2 — Build your profile:
  Embed a minimal version of the Profile form: just email, fullName, phone, currentCTC, expectedCTC, noticePeriod.
  Label it "The 6 fields that appear on every application."
  "You can add more later."
  Button: "Save and continue"

Step 3 — Add a cover letter:
  Embed a minimal cover letter creator: just name + body.
  Pre-fill with a starter template.
  Button: "Save and continue" or "Skip for now"

Step 4 — You're ready:
  "Go apply for a job!"
  Instructions: "Open a job listing, click the extension icon, and hit Auto-fill."
  Button: "Open LinkedIn Jobs" (opens linkedin.com/jobs in new tab)
  Secondary: "Close"

Track onboarding completion in settings: settings.onboardingComplete = true
In App.tsx: if !settings.onboardingComplete, show Onboarding instead of main app.
```

---

### Prompt 40 — Data Export & Backup

```
Context: Chrome Extension "Job Autofill".
File: Already partially written in Settings.tsx (Prompt 17). Expand this now.

Write a complete backup/restore system.

Export format (JSON):
{
  version: "1.0",
  exportedAt: timestamp,
  profile: UserProfile,
  coverLetters: CoverLetterTemplate[],
  applications: JobApplication[],
  learnedFields: Record<string, LearnedField>,
  settings: AppSettings
}

In Settings.tsx, implement:

1. Export:
   - "Export my data" → JSON.stringify → Blob → createObjectURL → auto-download as "job-autofill-backup-YYYY-MM-DD.json"
   - Show file size in a small toast

2. Import:
   - File picker (accept=".json")
   - Parse JSON
   - Validate structure: check version field, check required top-level keys
   - If valid: show a preview dialog listing what will be imported (X applications, X cover letters, profile: yes/no)
   - "Confirm import" → save to storage
   - "Merge or replace?" — if existing data: ask user:
     Replace: overwrites everything
     Merge: merges applications list (dedup by id), merges learnedFields, merges coverLetters (dedup by id), keeps newer profile

3. Export just applications as CSV:
   - "Export applications as CSV" button
   - Columns: Company, Role, Portal, Status, Applied Date, Notes
   - Use encodeURIComponent and data: URI for download
   - This is useful for job search spreadsheets

Write the CSV export function in src/shared/utils.ts as:
  exportApplicationsToCSV(applications: JobApplication[]): string
```

---

### Prompt 41 — Context Menu Integration

```
Context: Chrome Extension "Job Autofill".
Files: manifest.json, src/background/index.ts

Add right-click context menu items for quick actions on job pages.

1. Add to manifest.json permissions: "contextMenus"

2. In background/index.ts onInstalled, create context menus:
   chrome.contextMenus.create({
     id: "autofill-page",
     title: "Auto-fill this application",
     contexts: ["page"],
     documentUrlPatterns: ["https://www.linkedin.com/*", "https://www.naukri.com/*", "https://wellfound.com/*", "https://www.instahyre.com/*", "https://*.greenhouse.io/*", "https://*.lever.co/*", "https://*.myworkdayjobs.com/*"]
   })
   
   chrome.contextMenus.create({
     id: "log-application",
     title: "Log this application manually",
     contexts: ["page"],
     documentUrlPatterns: (same as above)
   })

3. Handle chrome.contextMenus.onClicked:
   "autofill-page": send TRIGGER_AUTOFILL to active tab
   "log-application": open a small popup/notification asking for company name + role, then log it

4. Right-click on any text on a page → add:
   id: "use-as-company-name"
   title: "Use '%s' as company name"
   contexts: ["selection"]
   This lets users right-click the company name on any page and set it as context for cover letter interpolation.
```

---

### Prompt 42 — Popup UX Refinements

```
Context: Chrome Extension "Job Autofill". Most features complete.

Polish the popup UX.

1. Profile completion score:
   Calculate a score (0–100) based on how many profile fields are filled.
   Weight important fields higher: email (15pts), phone (10pts), currentCTC (10pts), expectedCTC (10pts), noticePeriod (10pts), fullName (10pts), linkedinUrl (5pts), experience entries (10pts), skills (5pts), education (5pts), etc.
   Show as a circular progress indicator at the top of Profile page.
   Color: red 0–40, amber 41–70, green 71–100.
   At 100%: show "Profile complete!" with a checkmark.

2. Smart field suggestions:
   When a profile field is empty, show a placeholder hint inside the input:
   currentCTC: "e.g. 12 (in LPA)"
   noticePeriod: "e.g. 30 (in days)"
   linkedinUrl: "e.g. https://linkedin.com/in/yourname"

3. Auto-fill button state:
   - Not on job page: button disabled, tooltip "Navigate to a job listing first"
   - On job page, profile incomplete: button amber, text "Complete profile first"
   - On job page, profile complete: button blue, "Auto-fill this page"
   - Filling in progress: button disabled, spinner, "Filling..."
   - Done: button green briefly, "Filled 12 fields!"

4. Keyboard navigation:
   All popup UI must be keyboard-navigable (Tab order, Enter to activate, Escape to close dialogs).

5. Popup height:
   The popup has max-height 600px. Add overflow-y: auto to content areas so it scrolls within the popup frame.
```

---

### Prompt 43 — E2E Tests with Playwright

```
Context: Chrome Extension "Job Autofill".
File: tests/e2e/ (create directory)

Write E2E tests using Playwright that load the actual extension.

Setup:
1. Install @playwright/test and playwright-chromium
2. Create playwright.config.ts:
   - Use chromium with extension loaded from dist/
   - Load extension using: args: ['--load-extension=dist/']

Test files:

tests/e2e/popup.spec.ts:
  - Opens extension popup
  - Verifies all 4 tabs are visible
  - Fills in profile fields and verifies save
  - Creates a cover letter template
  - Verifies application tracker shows empty state

tests/e2e/autofill.spec.ts:
  - Creates a test HTML page with a realistic job application form (set up as a local file server)
  - The test page has: name, email, phone, LinkedIn, current CTC, notice period fields
  - Triggers autofill via extension message
  - Verifies all fields were filled correctly
  - Tests unknown field highlighting

tests/e2e/multipage.spec.ts:
  - Creates a 3-page test form
  - Page 1: personal info, Page 2: professional info, Page 3: confirmation
  - Verifies extension navigates all 3 pages and fills each

Create the test HTML pages in tests/fixtures/:
  tests/fixtures/simple-form.html — 6 standard fields
  tests/fixtures/multipage/ — 3 HTML pages (page1.html, page2.html, page3.html) linked via Next buttons

Add npm script: "test:e2e": playwright test
```

---

### Prompt 44 — Manifest & Store Preparation

```
Context: Chrome Extension "Job Autofill".

Prepare for Chrome Web Store submission (not submitting yet — just making it compliant).

1. Update manifest.json for store compliance:
   - Add "description" (max 132 chars): "Auto-fill job applications on LinkedIn, Naukri, Wellfound, Instahyre and more. Save hours. Your data stays on your device."
   - Add "homepage_url": your GitHub repo URL (placeholder)
   - Add proper icons in all sizes (16, 32, 48, 128)
   - Ensure minimum_chrome_version: "120"

2. Write store listing assets (as markdown — for reference):
   - Short description (132 chars max)
   - Detailed description (formatted, with feature bullet points)
   - Privacy practices answers:
     * Does it collect user data? No
     * Does it use remote code? No
     * Does it use a server? No
   
3. Update popup's About section with:
   - Privacy policy text (inline, not a separate page): "All your data is stored locally on your device using Chrome's storage API. Nothing is ever sent to any server. We have no servers."
   - MIT license note

4. Add web_accessible_resources to manifest.json for PDF.js worker:
   "web_accessible_resources": [{ "resources": ["pdf.worker.min.js"], "matches": ["<all_urls>"] }]

5. Perform a final permission audit:
   - List every permission in manifest.json
   - For each: explain why it's needed in a comment above it
   - Remove any permissions not actually used
   - "tabs" needed for? "scripting" needed for? etc.
```

---

### Prompt 45 — Final QA Checklist Implementation

```
Context: Chrome Extension "Job Autofill". All phases nearly complete.

Perform a systematic QA pass.

1. Run TypeScript compiler: tsc --noEmit. Fix ALL type errors. Zero errors required.

2. Run tests: npm test. All tests must pass.

3. Load the extension in Chrome (unpacked from dist/) and test:
   a. Popup opens correctly
   b. Profile can be saved and reloaded
   c. Cover letter can be created and saved
   d. Navigate to linkedin.com/jobs → extension detects portal (check badge on icon)
   e. Click Auto-fill → fields fill correctly
   f. Unknown fields are highlighted in orange
   g. Application Tracker shows logged application after submission

4. Check for these common MV3 issues:
   - Service worker terminates — do all async operations complete within 30s?
   - Content script not injected on pre-existing tabs — is there fallback injection via scripting API?
   - chrome.storage quota — is there a size check?

5. Cross-browser: test in Brave (should work identically — it's Chromium-based)

6. Performance check:
   - Open DevTools on any page with extension loaded
   - Check memory usage: extension should add <5MB
   - Check that no console errors appear from the extension on non-job pages

7. Write a CHANGELOG.md file with version 0.1.0 entry listing all features.

Fix any issues found. Report what was fixed.
```

---

## PHASE 5 — Future Features (Roadmap Prompts)
**Goal:** AI cover letters, job discovery, sharing. Build these after Phase 4 is stable.
**Duration:** Variable
**Prompts:** 46–55

---

### Prompt 46 — AI Cover Letter Integration (When API Key Available)

```
Context: Chrome Extension "Job Autofill". Phase 4 complete. User now has an API key.
File: src/shared/aiEngine.ts (create this file)

Add optional AI-powered cover letter generation using the Anthropic Claude API.

This feature is OFF by default and only activates when user provides an API key in Settings.

1. Add to AppSettings: { apiKey: string | null, aiProvider: 'anthropic' | 'openai' | null }
   Store apiKey in chrome.storage.local (acceptable for extension local storage — never synced).

2. In Settings.tsx: add "AI Integration" section:
   - API key input (masked like a password field)
   - Provider selector: Anthropic / OpenAI
   - "Test connection" button
   - Save button

3. Write generateCoverLetter(jobDescription: string, profile: UserProfile, apiKey: string): Promise<string>
   
   For Anthropic:
   POST https://api.anthropic.com/v1/messages
   Headers: x-api-key: apiKey, anthropic-version: 2023-06-01
   Model: claude-haiku-3 (fast, cheap)
   Prompt: "Write a concise 3-paragraph cover letter for this job. Candidate profile: [profile summary]. Job description: [first 1000 chars of JD]. Rules: professional tone, specific to the role, under 300 words. Output only the cover letter body, no Subject line."

4. In the popup auto-fill flow: if AI is enabled and a cover letter field is found, auto-generate instead of using template.

5. Fallback: if API call fails (network error, invalid key, quota exceeded): fall back to template system silently, show a non-blocking toast "AI cover letter unavailable — using saved template."

Security: API key must never appear in logs. Validate it's in expected format before storing.
```

---

### Prompt 47 — Job Discovery Feed

```
Context: Chrome Extension "Job Autofill". Phase 4 complete.
File: src/popup/pages/Discover.tsx (create this file), src/background/jobFetcher.ts

Add a fifth tab "Discover" that shows matching jobs from public RSS/JSON feeds.

Job sources with public APIs/feeds (no auth required):
- Wellfound public job search: https://wellfound.com/jobs.json?query=ROLE (check if still available)
- Remoteok: https://remoteok.com/api (free JSON API)
- Arbeitnow: https://www.arbeitnow.com/api/job-board-api (free)
- GitHub Jobs alternative: Adzuna public API (requires free API key)

Implementation:
1. Add "Job Preferences" to Settings: desired role (text), preferred locations (array), min salary
2. Background service worker: every 4 hours, fetch jobs matching preferences from available sources
3. Store fetched jobs in chrome.storage.local (cap at 100 jobs, rotate oldest)
4. Discover tab: show fetched jobs as cards with "Auto-apply" button
5. "Auto-apply" opens the job URL in a new tab, then triggers autofill

Note: Fetch only from public sources. Never scrape authenticated portals — this is against their ToS. Declare all fetched URLs in manifest.json's host_permissions.

Add to manifest.json permissions: "alarms" (for periodic fetch)
```

---

### Prompt 48 — Shared Field Dictionary (Community)

```
Context: Chrome Extension "Job Autofill". Phase 4 complete.

Design a system for users to share their learned field mappings with the community.

Architecture (no server required — use GitHub):

1. Host a public JSON file on GitHub: job-autofill-fields/community-fields.json
   Format: { "fieldHash": { profileKey: string, labels: string[], portals: PortalName[], votes: number } }

2. In extension: periodically fetch this file (once per week via alarm)
   Update the local matcher with community-contributed mappings (lower priority than personal learned fields)

3. "Contribute my learned fields" button in Settings:
   - Shows the user's learned fields (labels only, no values)
   - "Submit to community" → opens a GitHub issue creation URL pre-filled with their learned fields
   - This is manual/low-tech but keeps the extension serverless

4. Merger logic in matcher.ts:
   Priority: personal learned → FIELD_LABEL_MAP → community fields → fuzzy → unknown

This means the extension gets smarter for everyone over time, without any backend infrastructure.

Note: This is a design + stub implementation. The actual GitHub file and contribution workflow can be set up manually. Write the fetch + merge code but the community endpoint can be a placeholder URL.
```

---

### Prompt 49 — Analytics Dashboard (Local Only)

```
Context: Chrome Extension "Job Autofill".
File: src/popup/pages/Analytics.tsx (optional 6th tab)

Build a local analytics dashboard from the application tracker data.

Charts (use a lightweight chart library — Chart.js or recharts, add to package.json):

1. Applications over time: line chart, last 30 days, daily count
2. Portal breakdown: pie chart — LinkedIn X%, Naukri X%, etc.
3. Status funnel: bar chart — Applied → Seen → Interview → Offer
4. Response rate: % of applied that reached at least "Seen" status
5. Best day to apply: heatmap of applications by day of week (Mon-Sun) and whether they got responses

Key metrics (top of page):
- Total applied (all time)
- Interview conversion rate
- Average time to response (for jobs that moved past "applied")
- Current streak: X days applied in a row

All data computed from JobApplication[] in storage. No external analytics. No data leaves the device.

Add as an optional 6th tab "Analytics" (shown only if applications.length > 10, otherwise encourage more applications first).
```

---

### Prompt 50 — Publish Preparation & Documentation

```
Context: Chrome Extension "Job Autofill". All phases complete.

Final publication preparation.

1. Production build optimisation:
   - Run: npm run build
   - Check dist/ size: extension should be <5MB total
   - Ensure PDF.js worker is correctly bundled (biggest file — verify it loads)
   - Test built extension in Chrome (load unpacked from dist/)

2. Write comprehensive README.md:
   - What it does (2 sentences)
   - Supported portals (table with portal name, status: full/partial/generic)
   - Installation from Chrome Web Store (link placeholder) and from source
   - How to use (numbered steps with screenshots placeholder)
   - Profile setup guide
   - Cover letter templates guide with variable reference table
   - FAQ: "Is my data safe?", "Does it work on company websites?", "Can it submit automatically?", "What if a field isn't filled?"
   - Contributing guide
   - License (MIT)

3. Create CONTRIBUTING.md:
   - How to add a new portal module (step-by-step with code example)
   - How to add new field label mappings to constants.ts
   - Testing requirements for PRs
   - Code style guide

4. Create .github/ISSUE_TEMPLATE/ with:
   - bug_report.md: requires version, Chrome version, portal name, expected vs actual behaviour, diagnostic report paste
   - feature_request.md: portal request, field mapping request, new feature

5. Tag the repository v0.1.0 instructions (just write the git commands as a code block).

The extension is ready to ship.
```

---

## Cursor-Specific Tips (Read Before Starting)

**Before each prompt:**
- Open the relevant file(s) in Cursor editor (Cmd+P to open)
- Use Cmd+L to open AI panel with file context
- Say "Read the open files first" if Cursor seems to not have context

**If Cursor hallucinates a library:**
- Correct: "That library doesn't exist. Use only: [list from package.json]"

**If Cursor generates TypeScript errors:**
- Paste the tsc error output and say: "Fix these TypeScript errors without changing the function signatures or types"

**Context management (long sessions):**
- Every 10 prompts, start a new Cursor conversation
- Begin with: "I'm building a Chrome Extension called Job Autofill. The architecture is [paste project structure]. The last thing I implemented was [X]. Now I need to..."

**Code review prompt (use after every phase):**
```
Review all the files we've written in this phase for:
1. TypeScript errors (strict mode)
2. Missing error handling
3. Memory leaks (event listeners not removed)
4. Async/await without try/catch
5. Any use of `any` type
6. Missing null checks on chrome API returns
List issues only — do not fix yet.
```

**When stuck:**
```
The following code isn't working: [paste code]
Error: [paste error]
The file's purpose is: [one sentence]
Other files it depends on: [list]
Fix only this specific issue. Do not rewrite unrelated code.
```

---

*Total: 50 prompts across 5 phases. Estimated development time with Cursor: 15–20 hours.*

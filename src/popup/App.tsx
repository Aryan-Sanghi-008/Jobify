import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type SVGProps,
} from 'react';
import { getProfile } from '@/shared/storage';
import type {
  PageInfoResponse,
  PortalName,
  ProfileIncompleteResponse,
  SerializableFillResult,
  TriggerAutofillResponse,
  UserProfile,
} from '@/shared/types';

const Profile = lazy(() => import('./pages/Profile'));
const CoverLetters = lazy(() => import('./pages/CoverLetters'));
const Tracker = lazy(() => import('./pages/Tracker'));
const Settings = lazy(() => import('./pages/Settings'));

type TabId = 'profile' | 'cover-letters' | 'tracker' | 'settings';

interface TabConfig {
  id: TabId;
  label: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
}

type AutofillResult =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

function isProfileComplete(profile: UserProfile | null): boolean {
  return profile !== null && profile.personal.email.trim() !== '';
}

function isProfileIncompleteResponse(
  response: TriggerAutofillResponse,
): response is ProfileIncompleteResponse {
  return 'type' in response && response.type === 'PROFILE_INCOMPLETE';
}

function isSerializableFillResult(
  response: TriggerAutofillResponse,
): response is SerializableFillResult {
  return 'filled' in response;
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

async function sendToContentScript<T>(message: {
  type: string;
}): Promise<T | null> {
  const tabId = await getActiveTabId();

  if (tabId === null) {
    return null;
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

function IconUser(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconDocument(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function IconList(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const TABS: TabConfig[] = [
  { id: 'profile', label: 'Profile', icon: IconUser },
  { id: 'cover-letters', label: 'Cover Letters', icon: IconDocument },
  { id: 'tracker', label: 'Tracker', icon: IconList },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

function TabPanel({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'profile':
      return <Profile />;
    case 'cover-letters':
      return <CoverLetters />;
    case 'tracker':
      return <Tracker />;
    case 'settings':
      return <Settings />;
    default:
      return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [profileComplete, setProfileComplete] = useState(false);
  const [detectedPortal, setDetectedPortal] = useState<PortalName | null>(null);
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [autofillResult, setAutofillResult] = useState<AutofillResult | null>(null);

  const loadProfileStatus = useCallback(async () => {
    const profile = await getProfile();
    setProfileComplete(isProfileComplete(profile));
  }, []);

  const loadPageInfo = useCallback(async () => {
    const pageInfo = await sendToContentScript<PageInfoResponse>({
      type: 'GET_PAGE_INFO',
    });

    if (pageInfo?.portal && pageInfo.portal !== 'generic') {
      setDetectedPortal(pageInfo.portal);
      return;
    }

    setDetectedPortal(null);
  }, []);

  useEffect(() => {
    void loadProfileStatus();
    void loadPageInfo();
  }, [loadProfileStatus, loadPageInfo]);

  const handleAutofill = async () => {
    setIsAutofilling(true);
    setAutofillResult(null);

    const response = await sendToContentScript<TriggerAutofillResponse>({
      type: 'TRIGGER_AUTOFILL',
    });

    setIsAutofilling(false);

    if (!response) {
      setAutofillResult({
        type: 'error',
        message: 'Could not reach this page. Try refreshing and reopening the popup.',
      });
      return;
    }

    if (isProfileIncompleteResponse(response)) {
      setProfileComplete(false);
      setAutofillResult({
        type: 'error',
        message: 'Setup needed — add your email in Profile before autofilling.',
      });
      return;
    }

    if (isSerializableFillResult(response)) {
      if (response.errors.length > 0) {
        setAutofillResult({
          type: 'error',
          message: response.errors[0] ?? 'Autofill failed.',
        });
        return;
      }

      setAutofillResult({
        type: 'success',
        message: `Filled ${response.filled} fields · ${response.unknown.length} unknown`,
      });
    }
  };

  const showAutofillButton = detectedPortal !== null;

  return (
    <div className="flex h-[520px] w-[380px] flex-col bg-white text-gray-900">
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Job Autofill
          </p>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              profileComplete
                ? 'bg-green-100 text-green-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {profileComplete ? 'Profile complete' : 'Setup needed'}
          </span>
        </div>
      </header>

      {showAutofillButton ? (
        <section className="border-b border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={() => void handleAutofill()}
            disabled={isAutofilling}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isAutofilling ? (
              <>
                <Spinner className="text-white" />
                <span>Auto-filling…</span>
              </>
            ) : (
              <span>Auto-fill this page</span>
            )}
          </button>
          {autofillResult ? (
            <p
              className={`mt-2 text-center text-xs ${
                autofillResult.type === 'success' ? 'text-gray-600' : 'text-red-600'
              }`}
            >
              {autofillResult.message}
            </p>
          ) : null}
        </section>
      ) : null}

      <main className="flex-1 overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center py-12">
              <Spinner className="h-6 w-6 text-blue-600" />
            </div>
          }
        >
          <TabPanel tab={activeTab} />
        </Suspense>
      </main>

      <nav className="border-t border-gray-200 bg-gray-50">
        <ul className="grid grid-cols-4">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;

            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex w-full flex-col items-center gap-1 px-2 py-2.5 text-[10px] font-medium transition-colors ${
                    isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {isActive ? (
                    <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-blue-600" />
                  ) : null}
                  <Icon className="h-5 w-5" />
                  <span className="leading-none">{tab.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from "react";
import ErrorBoundary from "@/popup/components/ErrorBoundary";
import ProfileEmptyState from "@/popup/components/ProfileEmptyState";
import Spinner from "@/popup/components/Spinner";
import { useExtension } from "@/popup/hooks/useExtension";
import Onboarding from "@/popup/pages/Onboarding";
import { getApplications, getProfile, getSettings } from "@/shared/storage";
import type { UserProfile } from "@/shared/types";

const Profile = lazy(() => import("./pages/Profile"));
const CoverLetters = lazy(() => import("./pages/CoverLetters"));
const Tracker = lazy(() => import("./pages/Tracker"));
const Discover = lazy(() => import("./pages/Discover"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));

type TabId =
  | "profile"
  | "cover-letters"
  | "tracker"
  | "analytics"
  | "discover"
  | "settings";

interface TabConfig {
  id: TabId;
  label: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
}

type UnknownFieldDraft = {
  value: string;
  saveToProfile: boolean;
};

const INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function isProfileComplete(profile: UserProfile | null): boolean {
  return profile !== null && profile.personal.email.trim() !== "";
}

interface AutofillButtonState {
  disabled: boolean;
  className: string;
  label: string;
  tooltip?: string;
  showSpinner: boolean;
}

function getAutofillButtonState({
  isJobPage,
  profileComplete,
  isFilling,
  recentSuccess,
}: {
  isJobPage: boolean;
  profileComplete: boolean;
  isFilling: boolean;
  recentSuccess: { filledCount: number } | null;
}): AutofillButtonState {
  if (recentSuccess) {
    return {
      disabled: true,
      className: "bg-green-600 hover:bg-green-600",
      label: `Filled ${recentSuccess.filledCount} fields!`,
      showSpinner: false,
    };
  }

  if (isFilling) {
    return {
      disabled: true,
      className: "bg-blue-600 hover:bg-blue-600",
      label: "Filling…",
      showSpinner: true,
    };
  }

  if (!isJobPage) {
    return {
      disabled: true,
      className: "bg-gray-400 hover:bg-gray-400",
      label: "Auto-fill this page",
      tooltip: "Navigate to a job listing first",
      showSpinner: false,
    };
  }

  if (!profileComplete) {
    return {
      disabled: false,
      className: "bg-amber-500 hover:bg-amber-600",
      label: "Complete profile first",
      tooltip: "Add your email in Profile",
      showSpinner: false,
    };
  }

  return {
    disabled: false,
    className: "bg-blue-600 hover:bg-blue-700",
    label: "Auto-fill this page",
    showSpinner: false,
  };
}

function IconUser(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconDocument(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function IconList(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function IconChart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <path d="M3 3v18h18" />
      <path d="M7 16v-5M12 16V8M17 16v-8" />
    </svg>
  );
}

function IconDiscover(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-4 4-2-2" />
    </svg>
  );
}

function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      {...props}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const BASE_TABS: TabConfig[] = [
  { id: "profile", label: "Profile", icon: IconUser },
  { id: "cover-letters", label: "Letters", icon: IconDocument },
  { id: "tracker", label: "Tracker", icon: IconList },
  { id: "discover", label: "Discover", icon: IconDiscover },
  { id: "settings", label: "Settings", icon: IconSettings },
];

const ANALYTICS_TAB: TabConfig = {
  id: "analytics",
  label: "Analytics",
  icon: IconChart,
};

function getVisibleTabs(applicationCount: number): TabConfig[] {
  if (applicationCount <= 10) {
    return BASE_TABS;
  }

  const tabs = [...BASE_TABS];
  const trackerIndex = tabs.findIndex((tab) => tab.id === "tracker");
  tabs.splice(trackerIndex + 1, 0, ANALYTICS_TAB);
  return tabs;
}

interface TabPanelProps {
  tab: TabId;
  profileComplete: boolean;
  onGoToProfile: () => void;
}

function TabPanel({ tab, profileComplete, onGoToProfile }: TabPanelProps) {
  if (tab !== "profile" && tab !== "discover" && !profileComplete) {
    return <ProfileEmptyState onGoToProfile={onGoToProfile} />;
  }

  switch (tab) {
    case "profile":
      return (
        <ErrorBoundary>
          <Profile />
        </ErrorBoundary>
      );
    case "cover-letters":
      return (
        <ErrorBoundary>
          <CoverLetters />
        </ErrorBoundary>
      );
    case "tracker":
      return (
        <ErrorBoundary>
          <Tracker />
        </ErrorBoundary>
      );
    case "analytics":
      return (
        <ErrorBoundary>
          <Analytics />
        </ErrorBoundary>
      );
    case "discover":
      return (
        <ErrorBoundary>
          <Discover />
        </ErrorBoundary>
      );
    case "settings":
      return (
        <ErrorBoundary>
          <Settings />
        </ErrorBoundary>
      );
    default:
      return null;
  }
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function handleSwitchKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  checked: boolean,
  onChange: (checked: boolean) => void,
): void {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    onChange(!checked);
  }
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-gray-600">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        onKeyDown={(event) => handleSwitchKeyDown(event, checked, onChange)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function App() {
  const autofillButtonRef = useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [profileComplete, setProfileComplete] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [applicationCount, setApplicationCount] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [unknownDrafts, setUnknownDrafts] = useState<
    Record<string, UnknownFieldDraft>
  >({});
  const [recentSuccess, setRecentSuccess] = useState<{
    filledCount: number;
  } | null>(null);

  const {
    isJobPage,
    isFilling,
    formState,
    lastResult,
    triggerAutofill,
    continueAutofill,
    fillSingleField,
    fillAllUnknownFields,
  } = useExtension();

  const unknownLabels = formState?.totalUnknown ?? lastResult?.unknown ?? [];
  const hasUnknownFields = unknownLabels.length > 0;
  const isWaitingForUser = formState?.state === "WAITING_FOR_USER";

  const visibleTabs = useMemo(
    () => getVisibleTabs(applicationCount),
    [applicationCount],
  );

  useEffect(() => {
    void Promise.all([getProfile(), getApplications(), getSettings()])
      .then(([profile, applications, settings]) => {
        setProfileComplete(isProfileComplete(profile));
        setOnboardingComplete(settings.onboardingComplete);
        setApplicationCount(applications.length);
      })
      .finally(() => {
        setIsInitialLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("profile");
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    void chrome.storage.session.get("pendingPopupTab").then((result) => {
      const pendingTab = result.pendingPopupTab;
      if (
        pendingTab === "profile" ||
        pendingTab === "cover-letters" ||
        pendingTab === "tracker" ||
        pendingTab === "analytics" ||
        pendingTab === "discover" ||
        pendingTab === "settings"
      ) {
        setActiveTab(pendingTab);
        void chrome.storage.session.remove("pendingPopupTab");
      }
    });
  }, []);

  useEffect(() => {
    if (!isInitialLoading && isJobPage) {
      autofillButtonRef.current?.focus();
    }
  }, [isInitialLoading, isJobPage]);

  useEffect(() => {
    if (!unknownLabels.length) {
      setUnknownDrafts({});
      return;
    }

    setUnknownDrafts((current) =>
      Object.fromEntries(
        unknownLabels.map((label) => [
          label,
          current[label] ?? { value: "", saveToProfile: false },
        ]),
      ),
    );
  }, [unknownLabels]);

  useEffect(() => {
    let filledCount = 0;

    if (formState?.state === "COMPLETE" && formState.totalFilled > 0) {
      filledCount = formState.totalFilled;
    } else if (
      lastResult &&
      lastResult.errors.length === 0 &&
      lastResult.filled > 0 &&
      !isFilling
    ) {
      filledCount = lastResult.filled;
    } else {
      return;
    }

    setRecentSuccess({ filledCount });
    const timer = window.setTimeout(() => {
      setRecentSuccess(null);
    }, 2500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    formState?.state,
    formState?.totalFilled,
    lastResult?.filled,
    lastResult?.errors.length,
    isFilling,
  ]);

  const autofillButton = useMemo(
    () =>
      getAutofillButtonState({
        isJobPage,
        profileComplete,
        isFilling,
        recentSuccess,
      }),
    [isJobPage, profileComplete, isFilling, recentSuccess],
  );

  const handleAutofillClick = () => {
    if (!isJobPage || isFilling || recentSuccess) {
      return;
    }

    if (!profileComplete) {
      setActiveTab("profile");
      return;
    }

    void triggerAutofill();
  };

  const resultMessage = useMemo(() => {
    if (formState) {
      if (formState.state === "NAVIGATING") {
        return {
          type: "success" as const,
          message: "Navigating to next page…",
        };
      }

      if (formState.state === "SCANNING" || formState.state === "FILLING") {
        return {
          type: "success" as const,
          message: `Page ${formState.pageNumber} · ${formState.state === "SCANNING" ? "Scanning…" : "Filling…"}`,
        };
      }

      if (formState.state === "COMPLETE") {
        return {
          type: "success" as const,
          message: `Complete · filled ${formState.totalFilled} fields across ${formState.pageNumber} page(s)`,
        };
      }

      if (formState.state === "ERROR") {
        return {
          type: "error" as const,
          message: formState.errors[0] ?? "Autofill failed",
        };
      }

      if (formState.state === "WAITING_FOR_USER") {
        return {
          type: "success" as const,
          message: `Page ${formState.pageNumber} · Filled ${formState.totalFilled} · ${formState.totalUnknown.length} unknown`,
        };
      }
    }

    if (!lastResult) {
      return null;
    }

    if (lastResult.errors.length > 0) {
      return { type: "error" as const, message: lastResult.errors[0] };
    }

    return {
      type: "success" as const,
      message: `Filled ${lastResult.filled} fields · ${lastResult.unknown.length} unknown`,
    };
  }, [formState, lastResult]);

  const filledEntries = useMemo(
    () =>
      Object.entries(unknownDrafts)
        .filter(([, draft]) => draft.value.trim() !== "")
        .map(([label, draft]) => ({
          label,
          value: draft.value.trim(),
          saveToProfile: draft.saveToProfile,
        })),
    [unknownDrafts],
  );

  const updateDraft = (label: string, updates: Partial<UnknownFieldDraft>) => {
    setUnknownDrafts((current) => ({
      ...current,
      [label]: { ...current[label], ...updates },
    }));
  };

  if (isInitialLoading) {
    return (
      <div className="flex h-[600px] max-h-[600px] w-[380px] min-w-[360px] items-center justify-center overflow-hidden bg-white">
        <Spinner size="md" className="text-blue-600" />
      </div>
    );
  }

  if (!onboardingComplete) {
    return (
      <Onboarding
        onComplete={() => {
          setOnboardingComplete(true);
          void getProfile().then((profile) => {
            setProfileComplete(isProfileComplete(profile));
          });
        }}
      />
    );
  }

  return (
    <div className="flex h-[600px] max-h-[600px] w-[380px] min-w-[360px] flex-col overflow-hidden bg-white text-gray-900">
      <header className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Jobify
          </p>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              profileComplete
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {profileComplete ? "Profile complete" : "Setup needed"}
          </span>
        </div>
      </header>

      <section className="max-h-[240px] shrink-0 overflow-y-auto border-b border-gray-200 px-4 py-3">
          <button
            ref={autofillButtonRef}
            type="button"
            onClick={handleAutofillClick}
            disabled={autofillButton.disabled}
            title={autofillButton.tooltip}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${autofillButton.className}`}
          >
            {autofillButton.showSpinner ? (
              <>
                <Spinner size="sm" className="text-white" />
                <span>{autofillButton.label}</span>
              </>
            ) : (
              <span>{autofillButton.label}</span>
            )}
          </button>
          <p className="mt-1 text-center text-[10px] text-gray-400">
            Or press Alt+Shift+F
          </p>
          <p className="mt-1 text-center text-[10px] text-gray-400">
            Shortcuts can be customized at chrome://extensions/shortcuts
          </p>

          {isJobPage && resultMessage ? (
            <p
              className={`mt-2 text-center text-xs ${
                resultMessage.type === "success"
                  ? "text-gray-600"
                  : "text-red-600"
              }`}
            >
              {resultMessage.message}
            </p>
          ) : null}

          {isJobPage && hasUnknownFields ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-900">
                {unknownLabels.length} fields need your input
              </p>
              <div className="space-y-2">
                {unknownLabels.map((label) => {
                  const draft = unknownDrafts[label] ?? {
                    value: "",
                    saveToProfile: false,
                  };

                  return (
                    <div
                      key={label}
                      className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5"
                    >
                      <p className="text-xs font-medium text-gray-800">
                        {label}
                      </p>
                      <input
                        type="text"
                        value={draft.value}
                        onChange={(event) =>
                          updateDraft(label, { value: event.target.value })
                        }
                        placeholder="Your answer"
                        className={INPUT_CLASS}
                      />
                      <ToggleRow
                        label="Save to profile"
                        checked={draft.saveToProfile}
                        onChange={(checked) =>
                          updateDraft(label, { saveToProfile: checked })
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void fillSingleField(label, draft.value.trim())
                        }
                        disabled={isFilling || !draft.value.trim()}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Fill this field
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void fillAllUnknownFields(filledEntries)}
                disabled={isFilling || filledEntries.length === 0}
                className="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Fill all above + continue
              </button>
            </div>
          ) : null}

          {isJobPage && isWaitingForUser && !hasUnknownFields ? (
            <button
              type="button"
              onClick={() => void continueAutofill()}
              disabled={isFilling}
              className="mt-3 w-full rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue
            </button>
          ) : null}
      </section>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center py-12">
              <Spinner size="md" className="text-blue-600" />
            </div>
          }
        >
          <TabPanel
            tab={activeTab}
            profileComplete={profileComplete}
            onGoToProfile={() => setActiveTab("profile")}
          />
        </Suspense>
      </main>

      <nav className="border-t border-gray-200 bg-gray-50">
        <ul
          className={`grid ${visibleTabs.length === 6 ? "grid-cols-6" : "grid-cols-5"}`}
        >
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;

            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex w-full flex-col items-center gap-1 px-2 py-2.5 text-[10px] font-medium transition-colors ${
                    isActive
                      ? "text-blue-600"
                      : "text-gray-500 hover:text-gray-700"
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

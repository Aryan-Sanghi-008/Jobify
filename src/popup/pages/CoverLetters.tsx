import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteCoverLetter,
  getCoverLetters,
  getProfile,
  getSettings,
  saveCoverLetter,
  saveSettings,
} from '@/shared/storage';
import type { CoverLetterTemplate } from '@/shared/types';
import { generateId, interpolateCoverLetter } from '@/shared/utils';

const MIN_BODY_LENGTH = 50;
const CHAR_LIMIT_HINT = 2000;

const STARTER_BODY = `Dear Hiring Team at {{company_name}},

I'm excited to apply for the {{job_title}} position. With my background and passion for building great products, I believe I would be a strong fit for your team.

Thank you for your consideration.

Sincerely,
{{your_name}}`;

const PLACEHOLDER_VARS = [
  { key: 'company_name', label: '{{company_name}}' },
  { key: 'job_title', label: '{{job_title}}' },
  { key: 'your_name', label: '{{your_name}}' },
] as const;

const INPUT_CLASS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-gray-700';
const ERROR_CLASS = 'mt-1 text-xs text-red-600';

interface EditorDraft {
  id: string | null;
  name: string;
  body: string;
  createdAt: number;
}

function createNewDraft(): EditorDraft {
  return {
    id: null,
    name: '',
    body: STARTER_BODY,
    createdAt: Date.now(),
  };
}

export default function CoverLetters() {
  const [templates, setTemplates] = useState<CoverLetterTemplate[]>([]);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [yourName, setYourName] = useState('Your Name');
  const [errors, setErrors] = useState<{ name?: string; body?: string }>({});
  const [toast, setToast] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const loadDraftFromTemplate = useCallback((template: CoverLetterTemplate) => {
    setDraft({
      id: template.id,
      name: template.name,
      body: template.body,
      createdAt: template.createdAt,
    });
    setSelectedId(template.id);
    setErrors({});
  }, []);

  const refreshTemplates = useCallback(async () => {
    const [coverLetters, settings, profile] = await Promise.all([
      getCoverLetters(),
      getSettings(),
      getProfile(),
    ]);

    setTemplates(coverLetters);
    setDefaultTemplateId(settings.defaultCoverLetterId);
    setYourName(profile?.personal.fullName.trim() || 'Your Name');

    return { coverLetters, settings };
  }, []);

  useEffect(() => {
    void (async () => {
      const { coverLetters } = await refreshTemplates();

      if (coverLetters.length > 0) {
        loadDraftFromTemplate(coverLetters[0]);
      }

      setIsLoading(false);
    })();

    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [loadDraftFromTemplate, refreshTemplates]);

  const previewText = useMemo(() => {
    if (!draft) {
      return '';
    }

    return interpolateCoverLetter(draft.body, {
      company_name: 'Acme Corp',
      job_title: 'Senior Software Engineer',
      your_name: yourName,
    });
  }, [draft, yourName]);

  const insertVariable = (variable: string) => {
    if (!draft) {
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const insertion = `{{${variable}}}`;
    const nextBody = `${draft.body.slice(0, start)}${insertion}${draft.body.slice(end)}`;

    setDraft((current) => (current ? { ...current, body: nextBody } : current));

    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + insertion.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const validateDraft = (): boolean => {
    if (!draft) {
      return false;
    }

    const nextErrors: { name?: string; body?: string } = {};
    const trimmedName = draft.name.trim();
    const trimmedBody = draft.body.trim();

    if (!trimmedName) {
      nextErrors.name = 'Template name is required';
    }

    if (trimmedBody.length < MIN_BODY_LENGTH) {
      nextErrors.body = `Cover letter must be at least ${MIN_BODY_LENGTH} characters`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSaveTemplate = async () => {
    if (!draft || !validateDraft()) {
      return;
    }

    setIsSaving(true);

    const now = Date.now();
    const template: CoverLetterTemplate = {
      id: draft.id ?? generateId(),
      name: draft.name.trim(),
      body: draft.body,
      createdAt: draft.id ? draft.createdAt : now,
      updatedAt: now,
    };

    await saveCoverLetter(template);
    const { coverLetters } = await refreshTemplates();

    setDraft({
      id: template.id,
      name: template.name,
      body: template.body,
      createdAt: template.createdAt,
    });
    setSelectedId(template.id);
    setIsSaving(false);
    showToast('Template saved');

    if (coverLetters.length === 1 && !defaultTemplateId) {
      await saveSettings({ defaultCoverLetterId: template.id });
      setDefaultTemplateId(template.id);
    }
  };

  const handleSetDefault = async () => {
    if (!draft?.id) {
      showToast('Save the template first');
      return;
    }

    await saveSettings({ defaultCoverLetterId: draft.id });
    setDefaultTemplateId(draft.id);
    showToast('Set as default');
  };

  const handleDeleteTemplate = async (id: string) => {
    await deleteCoverLetter(id);

    if (defaultTemplateId === id) {
      await saveSettings({ defaultCoverLetterId: null });
      setDefaultTemplateId(null);
    }

    const { coverLetters } = await refreshTemplates();
    setDeleteConfirmId(null);

    if (coverLetters.length === 0) {
      setDraft(null);
      setSelectedId(null);
      return;
    }

    loadDraftFromTemplate(coverLetters[0]);
    showToast('Template deleted');
  };

  const handleNewTemplate = () => {
    setDraft(createNewDraft());
    setSelectedId(null);
    setErrors({});
  };

  const handleCreateFirstTemplate = () => {
    handleNewTemplate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
      </div>
    );
  }

  if (templates.length === 0 && !draft) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium text-gray-900">No cover letter templates yet</p>
        <p className="mt-2 text-xs text-gray-500">
          Create reusable templates with placeholders for company, role, and your name.
        </p>
        <button
          type="button"
          onClick={handleCreateFirstTemplate}
          className="mt-6 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Create your first template
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[112px_minmax(0,1fr)]">
        <aside className="border-b border-gray-200 sm:border-b-0 sm:border-r">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 sm:border-b">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Templates
            </p>
            <button
              type="button"
              onClick={handleNewTemplate}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
            >
              New
            </button>
          </div>
          <ul className="max-h-28 overflow-y-auto sm:max-h-none sm:min-h-[280px]">
            {templates.map((template) => {
              const isSelected = selectedId === template.id;
              const isDefault = defaultTemplateId === template.id;

              return (
                <li key={template.id} className="group relative border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => loadDraftFromTemplate(template)}
                    className={`w-full px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block truncate text-xs font-medium">{template.name}</span>
                    {isDefault ? (
                      <span className="mt-1 inline-block rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                        Default
                      </span>
                    ) : null}
                  </button>

                  {deleteConfirmId === template.id ? (
                    <div className="absolute inset-0 flex flex-col justify-center gap-1 bg-white/95 px-2 py-1">
                      <p className="text-[10px] font-medium text-gray-700">Delete?</p>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDeleteTemplate(template.id)}
                          className="flex-1 rounded bg-red-600 px-1 py-0.5 text-[10px] font-medium text-white"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="flex-1 rounded border border-gray-300 px-1 py-0.5 text-[10px] font-medium text-gray-700"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(template.id)}
                      className="absolute right-1 top-1 rounded px-1 text-[10px] font-medium text-red-600 opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
                      aria-label={`Delete ${template.name}`}
                    >
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="min-w-0 overflow-y-auto px-3 py-3">
          {draft ? (
            <div className="space-y-3">
              <div>
                <label className={LABEL_CLASS}>Template name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  placeholder="Frontend roles"
                  className={INPUT_CLASS}
                />
                {errors.name ? <p className={ERROR_CLASS}>{errors.name}</p> : null}
              </div>

              <div>
                <label className={LABEL_CLASS}>Cover letter body</label>
                <textarea
                  ref={textareaRef}
                  value={draft.body}
                  rows={8}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, body: event.target.value } : current,
                    )
                  }
                  className={`${INPUT_CLASS} resize-y font-mono text-[13px] leading-relaxed`}
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p
                    className={`text-[11px] ${
                      draft.body.length > CHAR_LIMIT_HINT
                        ? 'text-amber-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {draft.body.length} / {CHAR_LIMIT_HINT} characters
                  </p>
                  {errors.body ? <p className={ERROR_CLASS}>{errors.body}</p> : null}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium text-gray-500">
                  Placeholders — click to insert
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDER_VARS.map((variable) => (
                    <button
                      key={variable.key}
                      type="button"
                      onClick={() => insertVariable(variable.key)}
                      className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {variable.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveTemplate()}
                  disabled={isSaving}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-70"
                >
                  {isSaving ? 'Saving…' : 'Save Template'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSetDefault()}
                  disabled={!draft.id || defaultTemplateId === draft.id}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Set as Default
                </button>
              </div>

              <div>
                <p className={LABEL_CLASS}>Live preview</p>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-800">
                    {previewText}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  Preview uses Acme Corp · Senior Software Engineer · {yourName}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {toast ? (
        <div
          role="status"
          className="pointer-events-none fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}

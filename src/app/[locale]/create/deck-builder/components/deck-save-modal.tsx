'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, Globe2, Lock, Save, X } from 'lucide-react';

export type SaveDeckMode = 'new' | 'overwrite';

type DeckSaveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: { title: string; description: string; isPublic: boolean }, mode: SaveDeckMode) => void;
  isSaving: boolean;
  errorMessage: string | null;
  requiresAuth: boolean;
  allowOverwrite: boolean;
  labels: {
    heading: string;
    titleLabel: string;
    titlePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    cancel: string;
    submit: string;
    update: string;
    saveAsNew: string;
    saving: string;
    signInPrompt: string;
    signInButton: string;
    emptyDeckError: string;
    genericError: string;
    successMessage: string;
    updateSuccessMessage: string;
    dismissNotice: string;
    publicLabel: string;
    publicHelp: string;
    publicStatus: string;
    privateStatus: string;
  };
  totalCards: number;
  totalCardsLabel: string;
  initialTitle: string;
  initialDescription: string;
  initialIsPublic: boolean;
  signInHref: string;
};

export function DeckSaveModal({
  isOpen,
  onClose,
  onSubmit,
  isSaving,
  errorMessage,
  requiresAuth,
  allowOverwrite,
  labels,
  totalCards,
  totalCardsLabel,
  initialTitle,
  initialDescription,
  initialIsPublic,
  signInHref,
}: DeckSaveModalProps) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [isPublic, setIsPublic] = useState(initialIsPublic ?? false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTitle((initialTitle ?? '').slice(0, 45));
    setDescription((initialDescription ?? '').slice(0, 100));
    setIsPublic(Boolean(initialIsPublic));
  }, [isOpen, initialDescription, initialIsPublic, initialTitle]);

  if (!isOpen) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      title: title.slice(0, 45),
      description: description.slice(0, 100),
      isPublic,
    }, allowOverwrite ? 'overwrite' : 'new');
  }

  function handleSaveAsNew() {
    onSubmit(
      {
        title: title.slice(0, 45),
        description: description.slice(0, 100),
        isPublic,
      },
      'new'
    );
  }

  const primaryButtonLabel = isSaving ? labels.saving : allowOverwrite ? labels.update : labels.submit;
  const secondaryButtonLabel = isSaving ? labels.saving : labels.saveAsNew;
  const isSubmitDisabled = isSaving || requiresAuth;
  const visibilityLabel = isPublic ? labels.publicStatus : labels.privateStatus;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4">
      <div className="grid max-h-[calc(100vh-2rem)] w-full max-w-xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-4 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)]/30 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/12 text-[color:var(--accent)]">
              <Save className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-[color:var(--text-primary)]">{labels.heading}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                <span className="inline-flex items-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1">
                  {totalCardsLabel}: {totalCards}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1">
                  {isPublic ? <Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                  {visibilityLabel}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-[color:var(--border)] bg-black/30 text-[color:var(--text-primary)] transition hover:bg-black/45 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            aria-label={labels.cancel}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-[color:var(--text-primary)]" htmlFor="deck-save-title">
                  {labels.titleLabel}
                </label>
                <span className="text-xs tabular-nums text-[color:var(--text-secondary)]">{title.length}/45</span>
              </div>
              <input
                id="deck-save-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value.slice(0, 45))}
                placeholder={labels.titlePlaceholder}
                maxLength={45}
                className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/45 px-3 py-2.5 text-sm text-[color:var(--text-primary)] shadow-inner outline-none transition placeholder:text-[color:var(--text-secondary)]/70 focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)] focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                disabled={isSaving}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-[color:var(--text-primary)]" htmlFor="deck-save-description">
                  {labels.descriptionLabel}
                </label>
                <span className="text-xs tabular-nums text-[color:var(--text-secondary)]">{description.length}/100</span>
              </div>
              <textarea
                id="deck-save-description"
                value={description}
                onChange={(event) => setDescription(event.target.value.slice(0, 100))}
                placeholder={labels.descriptionPlaceholder}
                rows={4}
                maxLength={100}
                className="min-h-28 w-full resize-none rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/45 px-3 py-2.5 text-sm text-[color:var(--text-primary)] shadow-inner outline-none transition placeholder:text-[color:var(--text-secondary)]/70 focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)] focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                disabled={isSaving}
              />
            </div>

            <button
              type="button"
              onClick={() => setIsPublic((value) => !value)}
              className={`flex w-full items-center justify-between gap-4 rounded-md border px-3 py-3 text-left transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                isPublic
                  ? 'border-[color:var(--accent)]/45 bg-[color:var(--accent)]/10'
                  : 'border-[color:var(--border)] bg-[color:var(--surface-muted)]/35 hover:bg-[color:var(--surface-muted)]/55'
              }`}
              disabled={isSaving}
              aria-pressed={isPublic}
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border ${
                  isPublic
                    ? 'border-[color:var(--accent)]/50 bg-[color:var(--accent)]/15 text-[color:var(--accent)]'
                    : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-secondary)]'
                }`}>
                  {isPublic ? <Globe2 className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[color:var(--text-primary)]">{visibilityLabel}</span>
                  <span className="mt-1 block text-sm text-[color:var(--text-secondary)]">{labels.publicHelp}</span>
                </span>
              </span>
              <span className={`flex h-6 w-11 flex-shrink-0 items-center rounded-full border p-0.5 transition ${
                isPublic
                  ? 'justify-end border-[color:var(--accent)] bg-[color:var(--accent)]'
                  : 'justify-start border-[color:var(--border)] bg-[color:var(--surface)]'
              }`}>
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[color:var(--accent)] shadow-sm">
                  {isPublic ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                </span>
              </span>
            </button>

            {errorMessage ? (
              <p className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </p>
            ) : null}

            {requiresAuth ? (
              <div className="flex flex-col gap-3 rounded-md border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 px-3 py-3 text-sm text-[color:var(--text-secondary)]">
                <span>{labels.signInPrompt}</span>
                <Link
                  href={signInHref}
                  className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-3 py-2 text-xs font-semibold uppercase text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  {labels.signInButton}
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--border)] bg-[color:var(--surface-muted)]/25 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md border border-[color:var(--border)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              disabled={isSaving}
            >
              {labels.cancel}
            </button>
            {allowOverwrite ? (
              <button
                type="button"
                onClick={handleSaveAsNew}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-[color:var(--border)] px-4 py-2.5 text-sm font-semibold text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitDisabled}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {secondaryButtonLabel}
              </button>
            ) : null}
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitDisabled}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {primaryButtonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

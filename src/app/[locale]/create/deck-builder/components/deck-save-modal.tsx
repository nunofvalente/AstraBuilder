'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

type DeckSaveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: { title: string; description: string; isPublic: boolean }) => void;
  isSaving: boolean;
  errorMessage: string | null;
  requiresAuth: boolean;
  labels: {
    heading: string;
    titleLabel: string;
    titlePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    cancel: string;
    submit: string;
    saving: string;
    signInPrompt: string;
    signInButton: string;
    emptyDeckError: string;
    genericError: string;
    successMessage: string;
    dismissNotice: string;
    publicLabel: string;
    publicHelp: string;
  };
  totalCards: number;
  totalCardsLabel: string;
  initialTitle: string;
  signInHref: string;
};

export function DeckSaveModal({
  isOpen,
  onClose,
  onSubmit,
  isSaving,
  errorMessage,
  requiresAuth,
  labels,
  totalCards,
  totalCardsLabel,
  initialTitle,
  signInHref,
}: DeckSaveModalProps) {
  const [title, setTitle] = useState(initialTitle ?? '');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTitle((initialTitle ?? '').slice(0, 45));
    setDescription('');
    setIsPublic(false);
  }, [isOpen, initialTitle]);

  if (!isOpen) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      title: title.slice(0, 45),
      description: description.slice(0, 100),
      isPublic,
    });
  }

  const saveButtonLabel = isSaving ? labels.saving : labels.submit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">{labels.heading}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            aria-label={labels.cancel}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4"
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--text-primary)]" htmlFor="deck-save-title">
              {labels.titleLabel}
            </label>
            <input
              id="deck-save-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 45))}
              placeholder={labels.titlePlaceholder}
              maxLength={45}
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 px-3 py-2 text-sm text-[color:var(--text-primary)] focus:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[color:var(--text-primary)]" htmlFor="deck-save-description">
              {labels.descriptionLabel}
            </label>
            <textarea
              id="deck-save-description"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 100))}
              placeholder={labels.descriptionPlaceholder}
              rows={4}
              maxLength={100}
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 px-3 py-2 text-sm text-[color:var(--text-primary)] focus:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              disabled={isSaving}
            />
          </div>

          <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 px-3 py-2 text-sm text-[color:var(--text-secondary)]">
            <span>
              {totalCardsLabel}: {totalCards}
            </span>
          </div>

          <label className="flex items-start gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 px-3 py-3 text-sm text-[color:var(--text-primary)]">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="mt-1 h-4 w-4 flex-shrink-0 rounded border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              disabled={isSaving}
            />
            <span>
              <span className="block font-medium">{labels.publicLabel}</span>
              <span className="mt-1 block text-[color:var(--text-secondary)]">{labels.publicHelp}</span>
            </span>
          </label>

          {errorMessage ? (
            <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              {errorMessage}
            </p>
          ) : null}

          {requiresAuth ? (
            <div className="flex flex-col gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 px-3 py-3 text-sm text-[color:var(--text-secondary)]">
              <span>{labels.signInPrompt}</span>
              <Link
                href={signInHref}
                className="inline-flex w-fit items-center justify-center rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              >
                {labels.signInButton}
              </Link>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              disabled={isSaving}
            >
              {labels.cancel}
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:opacity-70"
              disabled={isSaving}
            >
              {saveButtonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

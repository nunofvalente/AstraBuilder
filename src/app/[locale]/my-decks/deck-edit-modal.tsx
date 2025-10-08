'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

import type { DeckSummary } from '@/lib/supabase/decks';

type DeckEditModalProps = {
  deck: DeckSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: { title: string; description: string; isPublic: boolean }) => void;
  onDelete: (confirmation: string) => void;
  isSaving: boolean;
  isDeleting: boolean;
  errorMessage: string | null;
  deleteErrorMessage: string | null;
  labels: {
    heading: string;
    titleLabel: string;
    titlePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    publicLabel: string;
    publicHelp: string;
    cancel: string;
    save: string;
    saving: string;
    openBuilder: string;
    delete: string;
    deleteConfirm: string;
    deleteConfirmLabel: string;
    deletePlaceholder: string;
    deleteConfirmButton: string;
  };
  builderHref: string;
};

export function DeckEditModal({
  deck,
  isOpen,
  onClose,
  onSubmit,
  onDelete,
  isSaving,
  isDeleting,
  errorMessage,
  deleteErrorMessage,
  labels,
  builderHref,
}: DeckEditModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  useEffect(() => {
    if (!isOpen || !deck) {
      return;
    }

    setTitle((deck.title ?? '').slice(0, 45));
    setDescription((deck.description ?? '').slice(0, 100));
    setIsPublic(Boolean(deck.isPublic));
    setDeleteConfirmation('');
  }, [deck, isOpen]);

  if (!isOpen || !deck) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ title, description, isPublic });
  }

  const saveLabel = isSaving ? labels.saving : labels.save;
  const deleteLabel = isDeleting ? labels.saving : labels.deleteConfirmButton;
  const canDelete = deleteConfirmation.trim().toUpperCase() === 'DELETE' && !isDeleting && !isSaving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">{labels.heading}</h2>
            <Link
              href={builderHref}
              className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--accent)] hover:text-[color:var(--accent)]/80"
            >
              {labels.openBuilder}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:opacity-60 disabled:hover:bg-black/70"
            aria-label={labels.cancel}
            disabled={isSaving || isDeleting}
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
            <label className="block text-sm font-medium text-[color:var(--text-primary)]" htmlFor="deck-edit-title">
              {labels.titleLabel}
            </label>
            <input
              id="deck-edit-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, 45))}
              placeholder={labels.titlePlaceholder}
              maxLength={45}
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 px-3 py-2 text-sm text-[color:var(--text-primary)] focus:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              disabled={isSaving || isDeleting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[color:var(--text-primary)]" htmlFor="deck-edit-description">
              {labels.descriptionLabel}
            </label>
            <textarea
              id="deck-edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value.slice(0, 100))}
              placeholder={labels.descriptionPlaceholder}
              rows={4}
              maxLength={100}
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 px-3 py-2 text-sm text-[color:var(--text-primary)] focus:border-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              disabled={isSaving || isDeleting}
            />
          </div>

          <label className="flex items-start gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 px-3 py-3 text-sm text-[color:var(--text-primary)]">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="mt-1 h-4 w-4 flex-shrink-0 rounded border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              disabled={isSaving || isDeleting}
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

          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-3 text-sm text-red-100">
            <div className="space-y-2">
              <span className="block font-semibold uppercase tracking-wide">{labels.delete}</span>
              <p className="text-xs text-red-100/80">{labels.deleteConfirm}</p>
              <label className="block text-xs font-medium uppercase tracking-wide text-red-200" htmlFor="deck-delete-confirm">
                {labels.deleteConfirmLabel}
              </label>
              <input
                id="deck-delete-confirm"
                type="text"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value.slice(0, 10))}
                placeholder={labels.deletePlaceholder}
                maxLength={10}
                className="w-full rounded-md border border-red-500/60 bg-transparent px-3 py-2 text-sm text-red-100 placeholder:text-red-200 focus:border-red-300 focus:outline-none focus-visible:ring focus-visible:ring-red-400"
                disabled={isDeleting || isSaving}
              />
              {deleteErrorMessage ? (
                <p className="rounded-md border border-red-500/60 bg-red-500/20 px-3 py-2 text-xs text-red-50">
                  {deleteErrorMessage}
                </p>
              ) : null}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onDelete(deleteConfirmation)}
                  className="inline-flex items-center justify-center rounded-md border border-red-400/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-100 transition hover:bg-red-500/20 focus:outline-none focus-visible:ring focus-visible:ring-red-400 disabled:opacity-60"
                  disabled={!canDelete}
                >
                  {deleteLabel}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:opacity-60 disabled:hover:bg-[color:var(--surface-muted)]"
              disabled={isSaving || isDeleting}
            >
              {labels.cancel}
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] disabled:opacity-70"
              disabled={isSaving || isDeleting}
            >
              {saveLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

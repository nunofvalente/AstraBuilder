'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { Locale } from '@/i18n/config';
import { supabase } from '@/lib/supabase/supabaseClient';
import { getDeckSummariesForUser, type DeckSummary } from '@/lib/supabase/decks';
import { DeckSummaryCard } from '@/components/deck-summary-card';
import { DeckEditModal } from './deck-edit-modal';

export type MyDecksClientProps = {
  locale: Locale;
  labels: {
    heading: string;
    description: string;
    empty: string;
    loading: string;
    error: string;
    signInPrompt: string;
    signInButton: string;
    publicTag: string;
    privateTag: string;
    createdLabel: string;
    cardsLabel: string;
    emptyStateCta: string;
    untitledLabel: string;
    openButton: string;
    favoritesLabel: string;
    viewsLabel: string;
    retryButton: string;
    editLabel: string;
    editHeading: string;
    editTitleLabel: string;
    editTitlePlaceholder: string;
    editDescriptionLabel: string;
    editDescriptionPlaceholder: string;
    editPublicLabel: string;
    editPublicHelp: string;
    editCancel: string;
    editSave: string;
    editSaving: string;
    editOpenBuilder: string;
    editError: string;
    editSuccess: string;
    editDelete: string;
    editDeleteConfirm: string;
    editDeleteConfirmLabel: string;
    editDeletePlaceholder: string;
    editDeleteError: string;
    editDeleteSuccess: string;
    editDeleteConfirmButton: string;
  };
};

type Status = 'idle' | 'loading' | 'ready' | 'error' | 'auth';

type DeckWithMeta = DeckSummary;

export function MyDecksClient({ locale, labels }: MyDecksClientProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [decks, setDecks] = useState<DeckWithMeta[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [editingDeck, setEditingDeck] = useState<DeckWithMeta | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null);
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const pathname = usePathname();
  const redirectPath = pathname ?? `/${locale}/my-decks`;
  const signInHref = `/${locale}/sign-in?redirect=${encodeURIComponent(redirectPath)}`;

  useEffect(() => {
    let isMounted = true;

    async function loadDecks() {
      setStatus('loading');
      setErrorMessage(null);

      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult?.user) {
        if (isMounted) {
          setStatus('auth');
        }
        return;
      }

      try {
        const summaries = await getDeckSummariesForUser(userResult.user.id);
        if (!isMounted) {
          return;
        }
        setDecks(summaries);
        setStatus('ready');
      } catch (error) {
        console.error('Failed to load decks', error);
        if (!isMounted) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? String((error as { message?: unknown }).message)
              : null;
        setErrorMessage(message ?? labels.error);
        setStatus('error');
      }
    }

    void loadDecks();

    return () => {
      isMounted = false;
    };
  }, [labels.error, locale, redirectPath, reloadNonce]);

  async function handleEditSubmit(values: { title: string; description: string; isPublic: boolean }) {
    if (!editingDeck) {
      return;
    }

    const limitedTitle = values.title.slice(0, 45);
    const limitedDescription = values.description.slice(0, 100);

    setIsSavingEdit(true);
    setEditErrorMessage(null);
    setDeleteErrorMessage(null);

    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult?.user) {
      setEditErrorMessage(labels.signInPrompt);
      setIsSavingEdit(false);
      return;
    }

    const trimmedTitle = limitedTitle.trim();
    const trimmedDescription = limitedDescription.trim();

    const updatePayload = {
      title: trimmedTitle.length > 0 ? trimmedTitle : null,
      description: trimmedDescription.length > 0 ? trimmedDescription : null,
      is_public: values.isPublic,
    };

    const { error } = await supabase
      .from('decks')
      .update(updatePayload)
      .eq('id', editingDeck.id)
      .eq('user_id', userResult.user.id);

    if (error) {
      console.error('Failed to update deck', error);
      setEditErrorMessage(labels.editError);
      setIsSavingEdit(false);
      return;
    }

    setDecks((previous) =>
      previous.map((deck) =>
        deck.id === editingDeck.id
          ? {
              ...deck,
              title: updatePayload.title ?? null,
              description: updatePayload.description ?? null,
              isPublic: values.isPublic,
            }
          : deck
      )
    );

    setEditingDeck(null);
    setIsSavingEdit(false);
    setEditSuccessMessage(labels.editSuccess);
  }

  async function handleDeleteDeck(confirmation: string) {
    if (!editingDeck) {
      return;
    }

    const expected = 'DELETE';
    if (confirmation.trim().toUpperCase() !== expected) {
      setDeleteErrorMessage(labels.editDeleteConfirmLabel);
      return;
    }

    setIsSavingEdit(false);
    setIsDeletingDeck(true);
    setDeleteErrorMessage(null);
    setEditErrorMessage(null);

    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult?.user) {
      setDeleteErrorMessage(labels.signInPrompt);
      setIsDeletingDeck(false);
      return;
    }

    const { error } = await supabase
      .from('decks')
      .delete()
      .eq('id', editingDeck.id)
      .eq('user_id', userResult.user.id);

    if (error) {
      console.error('Failed to delete deck', error);
      setDeleteErrorMessage(labels.editDeleteError);
      setIsDeletingDeck(false);
      return;
    }

    setDecks((previous) => previous.filter((deck) => deck.id !== editingDeck.id));
    setEditingDeck(null);
    setIsDeletingDeck(false);
    setEditSuccessMessage(labels.editDeleteSuccess);
  }

  function handleCloseEditModal() {
    setEditingDeck(null);
    setEditErrorMessage(null);
    setDeleteErrorMessage(null);
    setIsSavingEdit(false);
    setIsDeletingDeck(false);
  }

  const content = useMemo(() => {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-sm text-[color:var(--text-secondary)]">
          {labels.loading}
        </div>
      );
    }

    if (status === 'auth') {
      return (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">{labels.signInPrompt}</p>
          <Link
            href={signInHref}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            {labels.signInButton}
          </Link>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-100">
          <span>{errorMessage ?? labels.error}</span>
          <button
            type="button"
            onClick={() => {
              setReloadNonce((previous) => previous + 1);
            }}
            className="inline-flex w-fit items-center justify-center rounded-md border border-red-400/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-100 transition hover:bg-red-500/20 focus:outline-none focus-visible:ring focus-visible:ring-red-400"
          >
            {labels.retryButton}
          </button>
        </div>
      );
    }

    if (decks.length === 0) {
      return (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-10 text-center">
          <p className="text-sm text-[color:var(--text-secondary)]">{labels.empty}</p>
          <Link
            href={`/${locale}/create`}
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            {labels.emptyStateCta}
          </Link>
        </div>
      );
    }

    return (
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {decks.map((deck) => (
          <DeckSummaryCard
            key={deck.id}
            locale={locale}
            deck={deck}
            detailHref={`/${locale}/decks/${encodeURIComponent(deck.id)}`}
            labels={{
              cards: labels.cardsLabel,
              untitled: labels.untitledLabel,
              publicTag: labels.publicTag,
              privateTag: labels.privateTag,
            }}
            showPrivacyTag
            onEdit={() => {
              setEditErrorMessage(null);
              setDeleteErrorMessage(null);
              setEditSuccessMessage(null);
              setEditingDeck(deck);
            }}
            editLabel={labels.editLabel}
          />
        ))}
      </div>
    );
  }, [decks, errorMessage, labels, locale, signInHref, status]);

  return (
    <div className="flex w-full flex-col gap-6 px-4 py-10 text-[color:var(--text-primary)] sm:px-6 lg:px-10 xl:px-16">
      <div className="text-center md:text-left">
        <h1 className="text-3xl font-semibold">{labels.heading}</h1>
      </div>
      {editSuccessMessage ? (
        <div className="rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-100">
          <div className="flex items-start justify-between gap-3">
            <span>{editSuccessMessage}</span>
            <button
              type="button"
              onClick={() => setEditSuccessMessage(null)}
              className="rounded-full border border-green-500/40 p-1 text-green-100 transition hover:bg-green-500/20 focus:outline-none focus-visible:ring focus-visible:ring-green-400"
              aria-label="Dismiss notification"
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
        </div>
      ) : null}
      {content}
      <DeckEditModal
        deck={editingDeck}
        isOpen={Boolean(editingDeck)}
        onClose={handleCloseEditModal}
        onSubmit={handleEditSubmit}
        onDelete={handleDeleteDeck}
        isSaving={isSavingEdit}
        isDeleting={isDeletingDeck}
        errorMessage={editErrorMessage}
        deleteErrorMessage={deleteErrorMessage}
        labels={{
          heading: labels.editHeading,
          titleLabel: labels.editTitleLabel,
          titlePlaceholder: labels.editTitlePlaceholder,
          descriptionLabel: labels.editDescriptionLabel,
          descriptionPlaceholder: labels.editDescriptionPlaceholder,
          publicLabel: labels.editPublicLabel,
          publicHelp: labels.editPublicHelp,
          cancel: labels.editCancel,
          save: labels.editSave,
          saving: labels.editSaving,
          openBuilder: labels.editOpenBuilder,
          delete: labels.editDelete,
          deleteConfirm: labels.editDeleteConfirm,
          deleteConfirmLabel: labels.editDeleteConfirmLabel,
          deletePlaceholder: labels.editDeletePlaceholder,
          deleteConfirmButton: labels.editDeleteConfirmButton,
        }}
        builderHref={
          editingDeck ? `/${locale}/create?deck=${encodeURIComponent(editingDeck.id)}` : `/${locale}/create`
        }
      />
    </div>
  );
}

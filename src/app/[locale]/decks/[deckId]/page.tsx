import type { Metadata } from 'next';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';
import { getDeckDetailById } from '@/lib/supabase/decks';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';

import { DeckDetailClient } from './deck-detail-client';

export const dynamic = 'force-dynamic';

interface DeckDetailsParams {
  locale: Locale | string;
  deckId: string;
}

interface DeckDetailsPageProps {
  params: Promise<DeckDetailsParams>;
}

export async function generateMetadata({ params }: DeckDetailsPageProps): Promise<Metadata> {
  const { locale, deckId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  if (!deckId || deckId.trim().length === 0) {
    notFound();
  }

  return buildCanonicalMetadata(locale, ['decks', deckId]);
}

export default async function DeckDetailsPage({ params }: DeckDetailsPageProps) {
  const { locale, deckId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const cookieStore = await cookies();
  const supabaseServerClient = createServerComponentClient({
    cookies: (() => cookieStore) as unknown as typeof cookies,
  });
  const deck = await getDeckDetailById(deckId, supabaseServerClient);

  return (
    <DeckDetailClient
      locale={locale}
      deck={deck}
      deckId={deckId}
      labels={{ deckDetails: dictionary.deckDetails, myDecks: dictionary.myDecks, publicProfile: dictionary.publicProfile }}
      emptyDeckLabel={dictionary.builder.emptyDeck}
      exportLabels={{
        exportHeading: dictionary.builder.menuExport,
        exportOptionTTS: dictionary.builder.exportOptionTTS,
        exportOptionText: dictionary.builder.exportOptionText,
        emptyDeck: dictionary.builder.emptyDeck,
        exportCopy: dictionary.builder.exportCopy,
        exportCopySuccess: dictionary.builder.exportCopySuccess,
        exportCopyError: dictionary.builder.exportCopyError,
      }}
      shareLabels={{
        deckHeading: dictionary.builder.deckHeading,
        totalCardsLabel: dictionary.builder.totalCardsLabel,
        shareButton: dictionary.builder.shareButton,
        shareGenerating: dictionary.builder.shareGenerating,
        shareDownload: dictionary.builder.shareDownload,
        shareCopy: dictionary.builder.shareCopy,
        shareCopySuccess: dictionary.builder.shareCopySuccess,
        shareCopyError: dictionary.builder.shareCopyError,
        shareEmpty: dictionary.builder.shareEmpty,
        shareError: dictionary.builder.shareError,
      }}
    />
  );
}

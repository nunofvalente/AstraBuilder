import type { Metadata } from 'next';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAccessibleDeckDetailById, getPublicDeckSummaryById } from '@/lib/supabase/decks';
import { buildNoIndexMetadata, buildPageMetadata } from '@/lib/metadata/locale';

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

  if (!/^\d+$/.test(deckId)) {
    notFound();
  }

  const [dictionary, deck] = await Promise.all([
    getDictionary(locale),
    getPublicDeckSummaryById(deckId),
  ]);

  if (!deck) {
    return buildNoIndexMetadata(locale, ['decks', deckId]);
  }

  const deckTitle = deck.title?.trim() || dictionary.myDecks.untitledLabel;
  const description = deck.description?.trim() || dictionary.deckDetails.description;

  return buildPageMetadata(locale, ['decks', deckId], {
    title: `${deckTitle} | AstraBuilder`,
    description,
  });
}

export default async function DeckDetailsPage({ params }: DeckDetailsPageProps) {
  const { locale, deckId } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  if (!/^\d+$/.test(deckId)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const cookieStore = await cookies();
  const supabaseServerClient = createServerComponentClient({
    cookies: (() => cookieStore) as unknown as typeof cookies,
  });
  const {
    data: { user },
  } = await supabaseServerClient.auth.getUser();
  const supabaseAdmin = createSupabaseAdminClient();
  const deck = supabaseAdmin
    ? await getAccessibleDeckDetailById(deckId, user?.id ?? null, supabaseAdmin)
    : null;

  if (!deck) {
    notFound();
  }

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

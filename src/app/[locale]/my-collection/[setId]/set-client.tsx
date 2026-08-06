'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { Locale } from '@/i18n/config';
import type { CardSet } from '@/lib/cards/card-sets';
import { getCardCollectionForUser, setCardCollectionQuantity, type CardCollectionQuantities } from '@/lib/supabase/card-collection';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { CollectionCopy } from '../collection-localization';

type Props = { locale: Locale; set: CardSet; copy: CollectionCopy };
type Status = 'loading' | 'ready' | 'auth' | 'error';

export function CollectionSetClient({ locale, set, copy }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<CardCollectionQuantities>({});
  const [savingCards, setSavingCards] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [ownedOnly, setOwnedOnly] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error || !data.user) {
        setStatus('auth');
        return;
      }
      setUserId(data.user.id);
      try {
        const next = await getCardCollectionForUser(data.user.id);
        if (active) { setQuantities(next); setStatus('ready'); }
      } catch (loadError) {
        console.error('Failed to load card collection', loadError);
        if (active) setStatus('error');
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const filteredCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    return set.cards.filter((card) => (!ownedOnly || (quantities[card.id] ?? 0) > 0) && (!term || card.searchContent.includes(term)));
  }, [ownedOnly, quantities, search, set.cards]);
  const owned = set.cards.filter((card) => (quantities[card.id] ?? 0) > 0).length;
  const copies = set.cards.reduce((sum, card) => sum + (quantities[card.id] ?? 0), 0);
  const completion = set.cards.length ? Math.round((owned / set.cards.length) * 100) : 0;

  async function changeQuantity(cardId: string, nextQuantity: number) {
    if (!userId || savingCards.has(cardId)) return;
    const previous = quantities[cardId] ?? 0;
    const next = Math.max(0, Math.min(999, nextQuantity));
    setSaveError(null);
    setQuantities((current) => {
      const updated = { ...current };
      if (next === 0) delete updated[cardId]; else updated[cardId] = next;
      return updated;
    });
    setSavingCards((current) => new Set(current).add(cardId));
    try {
      await setCardCollectionQuantity(userId, cardId, next);
    } catch (error) {
      console.error('Failed to save collection quantity', error);
      setQuantities((current) => {
        const updated = { ...current };
        if (previous === 0) delete updated[cardId]; else updated[cardId] = previous;
        return updated;
      });
      setSaveError(copy.saveError);
    } finally {
      setSavingCards((current) => { const updated = new Set(current); updated.delete(cardId); return updated; });
    }
  }

  if (status !== 'ready') {
    const message = status === 'loading' ? copy.loading : status === 'auth' ? copy.signInPrompt : copy.loadError;
    return <main className="mx-auto flex min-h-[55vh] w-full max-w-3xl flex-col items-center justify-center px-6 text-center"><p className="text-lg text-[color:var(--text-muted)]">{message}</p>{status === 'auth' ? <Link className="mt-5 rounded-md bg-[color:var(--accent)] px-5 py-2.5 font-bold text-[color:var(--text-on-accent)]" href={`/${locale}/sign-in?redirect=${encodeURIComponent(`/${locale}/my-collection/${set.id}`)}`}>{copy.signIn}</Link> : null}</main>;
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-6 lg:px-10">
      <Link href={`/${locale}/my-collection`} className="inline-flex items-center gap-2 text-sm font-bold text-[color:var(--text-muted)] hover:text-[color:var(--accent)]">← {copy.back}</Link>
      <header className="mt-5 grid gap-6 border-y border-[color:var(--border)] py-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><span className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--accent)]">{set.id}</span><h1 className="mt-1 font-serif text-3xl font-bold text-[color:var(--text-primary)] sm:text-4xl">{set.name}</h1><p className="mt-2 text-[color:var(--text-muted)]">{owned} / {set.cards.length} {copy.cards} · {copies} {copy.copies}</p></div>
        <div className="w-full min-w-64 lg:w-80"><div className="mb-2 flex justify-between text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]"><span>{copy.collected}</span><span>{completion}%</span></div><div className="h-2 bg-[color:var(--surface-muted)]"><div className="h-full bg-[color:var(--accent)]" style={{ width: `${completion}%` }} /></div></div>
      </header>

      <div className="sticky top-[var(--topbar-height,64px)] z-20 mt-6 flex flex-col gap-3 border border-[color:var(--border)] bg-[color:var(--surface)]/95 p-3 backdrop-blur sm:flex-row">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} aria-label={copy.searchPlaceholder} className="min-w-0 flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-2.5 text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" />
        <label className="flex cursor-pointer items-center gap-2 px-2 text-sm font-bold text-[color:var(--text-primary)]"><input type="checkbox" checked={ownedOnly} onChange={(event) => setOwnedOnly(event.target.checked)} className="accent-[color:var(--accent)]" />{copy.ownedOnly}</label>
      </div>
      {saveError ? <p role="alert" className="mt-3 text-sm text-red-400">{saveError}</p> : null}

      {filteredCards.length === 0 ? <p className="py-20 text-center text-[color:var(--text-muted)]">{copy.noResults}</p> : (
        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {filteredCards.map((card) => {
            const quantity = quantities[card.id] ?? 0;
            const saving = savingCards.has(card.id);
            const from = `/${locale}/my-collection/${set.id}`;
            return (
              <article key={card.id} className={`overflow-hidden border bg-[color:var(--surface)] transition ${quantity > 0 ? 'border-[color:var(--accent)]/60' : 'border-[color:var(--border)]'}`}>
                <Link href={`/${locale}/cards/${encodeURIComponent(card.id)}?from=${encodeURIComponent(from)}`} className="relative block aspect-[5/7] bg-black/20">
                  {card.imageSrc ? <Image src={card.imageSrc} alt={card.name} fill sizes="(max-width: 640px) 50vw, 220px" className={`object-contain transition ${quantity === 0 ? 'opacity-70 grayscale-[0.25]' : ''}`} /> : null}
                </Link>
                <div className="p-3"><h2 className="min-h-10 text-sm font-bold leading-5 text-[color:var(--text-primary)]">{card.name}</h2><p className="mt-1 text-xs text-[color:var(--text-muted)]">#{card.number ?? '—'} · {card.rarity}</p>
                  <div className="mt-3 grid grid-cols-[2.25rem_1fr_2.25rem] overflow-hidden rounded-md border border-[color:var(--border)]">
                    <button type="button" disabled={saving || quantity === 0} onClick={() => void changeQuantity(card.id, quantity - 1)} aria-label={`${copy.quantity}: ${card.name} -`} className="h-9 text-lg font-bold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-muted)] disabled:opacity-35">−</button>
                    <output aria-label={`${copy.quantity}: ${quantity}`} className="flex h-9 items-center justify-center border-x border-[color:var(--border)] font-bold text-[color:var(--accent)]">{quantity}</output>
                    <button type="button" disabled={saving || quantity >= 999} onClick={() => void changeQuantity(card.id, quantity + 1)} aria-label={`${copy.quantity}: ${card.name} +`} className="h-9 text-lg font-bold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-muted)] disabled:opacity-35">+</button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

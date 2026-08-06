'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { Locale } from '@/i18n/config';
import type { CardSet } from '@/lib/cards/card-sets';
import { getCardCollectionForUser, type CardCollectionQuantities } from '@/lib/supabase/card-collection';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { CollectionCopy } from './collection-localization';

type Props = { locale: Locale; copy: CollectionCopy; sets: CardSet[] };
type Status = 'loading' | 'ready' | 'auth' | 'error';

const TYPE_COLORS: Record<string, string> = {
  unit: '#f08a36',
  'renowned unit': '#d6ad4d',
  tactic: '#b063d1',
  territory: '#63a878',
  item: '#54a4c7',
  token: '#8b857e',
};

export function MyCollectionClient({ locale, copy, sets }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [quantities, setQuantities] = useState<CardCollectionQuantities>({});

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error || !data.user) {
        setStatus('auth');
        return;
      }
      try {
        const nextQuantities = await getCardCollectionForUser(data.user.id);
        if (active) {
          setQuantities(nextQuantities);
          setStatus('ready');
        }
      } catch (loadError) {
        console.error('Failed to load card collection', loadError);
        if (active) setStatus('error');
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const totals = useMemo(() => {
    const values = Object.values(quantities);
    return { unique: values.length, copies: values.reduce((sum, value) => sum + value, 0) };
  }, [quantities]);
  const rarityTotals = useMemo(() => {
    const values = new Map<string, { owned: number; total: number }>();
    for (const set of sets) {
      for (const card of set.cards) {
        const rarity = card.rarity.trim() || 'Unknown';
        const current = values.get(rarity) ?? { owned: 0, total: 0 };
        values.set(rarity, {
          owned: current.owned + ((quantities[card.id] ?? 0) > 0 ? 1 : 0),
          total: current.total + 1,
        });
      }
    }
    const order = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Token', 'Unknown'];
    return [...values.entries()].sort(([a], [b]) => {
      const aIndex = order.indexOf(a);
      const bIndex = order.indexOf(b);
      return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex) || a.localeCompare(b);
    });
  }, [quantities, sets]);
  const typeTotals = useMemo(() => {
    const values = new Map<string, number>();
    for (const set of sets) {
      for (const card of set.cards) {
        const type = card.type.trim() || 'Other';
        values.set(type, (values.get(type) ?? 0) + (quantities[card.id] ?? 0));
      }
    }
    const order = ['Unit', 'Renowned Unit', 'Tactic', 'Territory', 'Item', 'Token', 'Other'];
    return [...values.entries()].sort(([a], [b]) => {
      const aIndex = order.indexOf(a);
      const bIndex = order.indexOf(b);
      return (aIndex < 0 ? order.length : aIndex) - (bIndex < 0 ? order.length : bIndex) || a.localeCompare(b);
    });
  }, [quantities, sets]);
  const catalogSize = useMemo(() => sets.reduce((sum, set) => sum + set.cards.length, 0), [sets]);
  const catalogCompletion = catalogSize === 0 ? 0 : Math.round((totals.unique / catalogSize) * 100);

  if (status === 'loading') {
    return <CollectionState message={copy.loading} />;
  }
  if (status === 'auth') {
    return (
      <CollectionState message={copy.signInPrompt}>
        <Link className="mt-5 inline-flex rounded-md bg-[color:var(--accent)] px-5 py-2.5 font-bold text-[color:var(--text-on-accent)]" href={`/${locale}/sign-in?redirect=${encodeURIComponent(`/${locale}/my-collection`)}`}>
          {copy.signIn}
        </Link>
      </CollectionState>
    );
  }
  if (status === 'error') {
    return <CollectionState message={copy.loadError} />;
  }

  return (
    <main className="mx-auto w-full max-w-[1480px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <header className="border-b border-[color:var(--border)] pb-7">
        <h1 className="font-serif text-3xl font-bold text-[color:var(--text-primary)] sm:text-4xl">{copy.title}</h1>
        <p className="mt-3 max-w-2xl text-[color:var(--text-muted)]">{copy.description}</p>
      </header>

      <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {sets.map((set) => {
          const owned = set.cards.filter((card) => (quantities[card.id] ?? 0) > 0).length;
          const copies = set.cards.reduce((sum, card) => sum + (quantities[card.id] ?? 0), 0);
          const completion = set.cards.length === 0 ? 0 : Math.round((owned / set.cards.length) * 100);
          return (
            <Link key={set.id} href={`/${locale}/my-collection/${encodeURIComponent(set.id)}`} className="group relative min-h-64 overflow-hidden border border-[color:var(--border)] bg-[color:var(--surface)] transition hover:-translate-y-0.5 hover:border-[color:var(--accent)]">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[color:var(--accent)] via-[color:var(--accent)]/45 to-transparent" />
              <div className="absolute -right-20 -top-24 h-64 w-64 rotate-45 border border-[color:var(--accent)]/10 transition duration-500 group-hover:rotate-[52deg] group-hover:border-[color:var(--accent)]/20" />
              <div className="absolute -bottom-28 right-8 h-52 w-52 rounded-full border border-[color:var(--accent)]/10" />
              <div className="absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(circle_at_85%_45%,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_56%)]" />
              <span aria-hidden="true" className="absolute right-5 top-5 font-serif text-7xl font-black tracking-[-0.08em] text-[color:var(--accent)] opacity-[0.06] transition group-hover:opacity-10 sm:text-8xl">{set.id}</span>
              <div className="relative z-10 flex min-h-64 min-w-0 flex-col p-5 sm:p-7">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--accent)]">{set.id}</span>
                <h2 className="mt-2 break-words font-serif text-2xl font-bold text-[color:var(--text-primary)]">{set.name}</h2>
                <p className="mt-2 text-sm text-[color:var(--text-muted)]">{owned} / {set.cards.length} {copy.cards} · {copies} {copy.copies}</p>
                <div className="mt-auto pt-10">
                  <div className="h-1 overflow-hidden bg-[color:var(--surface-muted)]"><div className="h-full bg-[color:var(--accent)]" style={{ width: `${completion}%` }} /></div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-sm font-bold text-[color:var(--text-primary)]"><span>{completion}% {copy.collected}</span><span aria-hidden="true">→</span></div>
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="mt-12 border-t border-[color:var(--border)] pt-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="font-serif text-2xl font-bold text-[color:var(--text-primary)]">{copy.analytics}</h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <article className="border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6">
            <h3 className="font-bold text-[color:var(--text-primary)]">{copy.rarityBreakdown}</h3>
            <div className="mt-6 space-y-4">
              {rarityTotals.map(([rarity, counts]) => {
                const progress = counts.total === 0 ? 0 : (counts.owned / counts.total) * 100;
                return (
                  <div key={rarity}>
                    <div className="mb-1.5 flex justify-between gap-4 text-sm"><span className="text-[color:var(--text-muted)]">{rarity}</span><strong className="text-[color:var(--text-primary)]">({counts.owned}/{counts.total}) {copy.cards}</strong></div>
                    <div className="h-2 overflow-hidden bg-[color:var(--surface-muted)]"><div className="h-full bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent)]/45 transition-[width]" style={{ width: `${progress}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="flex flex-col justify-between border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="border-l-2 border-[color:var(--accent)] py-2 pl-4"><strong className="block text-4xl text-[color:var(--text-primary)]">{totals.copies}</strong><span className="mt-1 block text-xs uppercase tracking-[0.1em] text-[color:var(--text-muted)]">{copy.totalCopies}</span></div>
              <div className="border-l-2 border-[color:var(--accent)]/45 py-2 pl-4"><strong className="block text-4xl text-[color:var(--text-primary)]">{totals.unique}</strong><span className="mt-1 block text-xs uppercase tracking-[0.1em] text-[color:var(--text-muted)]">{copy.ownedCards}</span></div>
            </div>
            <div className="mt-10 border-t border-[color:var(--border)] pt-6">
              <div className="mb-3 flex items-end justify-between gap-4"><span className="text-sm text-[color:var(--text-muted)]">{totals.unique} / {catalogSize} {copy.cards}</span><strong className="text-xl text-[color:var(--accent)]">{catalogCompletion}%</strong></div>
              <div className="h-3 overflow-hidden bg-[color:var(--surface-muted)]"><div className="h-full bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent)]/50 transition-[width]" style={{ width: `${catalogCompletion}%` }} /></div>
            </div>
          </article>

          <article className="border border-[color:var(--border)] bg-[color:var(--surface)] p-5 sm:p-6">
            <h3 className="font-bold text-[color:var(--text-primary)]">{copy.cardsByType}</h3>
            <div className="mt-7 flex h-4 overflow-hidden bg-[color:var(--surface-muted)]">
              {typeTotals.map(([type, count]) => (
                <div key={type} title={`${type}: ${count}`} style={{ width: `${totals.copies === 0 ? 0 : (count / totals.copies) * 100}%`, backgroundColor: TYPE_COLORS[type.toLowerCase()] ?? '#b28d52' }} />
              ))}
            </div>
            <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4">
              {typeTotals.map(([type, count]) => (
                <div key={type} className="flex items-center gap-3 border-b border-[color:var(--border)] pb-3">
                  <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: TYPE_COLORS[type.toLowerCase()] ?? '#b28d52' }} />
                  <div className="min-w-0"><span className="block truncate text-sm text-[color:var(--text-muted)]">{type}</span><strong className="text-xl text-[color:var(--text-primary)]">{count}</strong></div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function CollectionState({ message, children }: { message: string; children?: React.ReactNode }) {
  return <main className="mx-auto flex min-h-[55vh] w-full max-w-3xl flex-col items-center justify-center px-6 text-center"><p className="text-lg text-[color:var(--text-muted)]">{message}</p>{children}</main>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, HeartPulse, Save, Share2, Sparkles, Sword, Upload } from 'lucide-react';

import type { Card, CostBucket, DeckEntry } from '../types';
import { DeckCardChip } from './deck-card-chip';
import type { ZoomAnchor } from './zoom-overlay';

const CARD_TYPE_ORDER = ['Unit', 'Tactic', 'Territory'];
const PRIORITY_MATCHERS = CARD_TYPE_ORDER.map((type) => ({ type, matcher: type.toLowerCase() }));
const FALLBACK_TYPE_LABEL = 'Other';

type CostCurveProps = {
  className?: string;
  costBuckets: CostBucket[];
  maxBucketCount: number;
  totalCards: number;
  heading: string;
  emptyLabel: string;
};

type UnitStatProfileProps = {
  className?: string;
  deckEntries: DeckEntry[];
  heading: string;
  emptyLabel: string;
  labels: {
    attack: string;
    health: string;
    influence: string;
  };
};

type CardTypeBreakdownProps = {
  className?: string;
  deckEntries: DeckEntry[];
  heading: string;
  emptyLabel: string;
};

type UnitStat = {
  key: 'attack' | 'health' | 'influence';
  label: string;
  value: number | null;
};

type CardTypeSegment = {
  label: string;
  count: number;
  colorClassName: string;
};

const CARD_TYPE_COLOR_CLASSES = [
  'deck-builder-type-segment-unit',
  'deck-builder-type-segment-tactic',
  'deck-builder-type-segment-territory',
  'deck-builder-type-segment-item',
  'deck-builder-type-segment-other',
];

function normalizeCardTypeLabel(type: string | null | undefined) {
  const rawType = type?.trim();
  return rawType && rawType.length > 0 ? rawType : FALLBACK_TYPE_LABEL;
}

function CardTypeBreakdown({ className = '', deckEntries, heading, emptyLabel }: CardTypeBreakdownProps) {
  const segments = useMemo<CardTypeSegment[]>(() => {
    const groups = new Map<string, { label: string; count: number }>();

    for (const entry of deckEntries) {
      const label = normalizeCardTypeLabel(entry.card.type);
      const key = label.toLowerCase();
      const current = groups.get(key);
      if (current) {
        current.count += entry.count;
      } else {
        groups.set(key, { label, count: entry.count });
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => {
        const aPriority = CARD_TYPE_ORDER.findIndex((type) => a.label.toLowerCase().includes(type.toLowerCase()));
        const bPriority = CARD_TYPE_ORDER.findIndex((type) => b.label.toLowerCase().includes(type.toLowerCase()));
        const normalizedAPriority = aPriority === -1 ? CARD_TYPE_ORDER.length : aPriority;
        const normalizedBPriority = bPriority === -1 ? CARD_TYPE_ORDER.length : bPriority;
        if (normalizedAPriority !== normalizedBPriority) {
          return normalizedAPriority - normalizedBPriority;
        }
        return a.label.localeCompare(b.label);
      })
      .map((group, index) => ({
        ...group,
        colorClassName: CARD_TYPE_COLOR_CLASSES[index % CARD_TYPE_COLOR_CLASSES.length],
      }));
  }, [deckEntries]);
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  return (
    <div className={className}>
      <h3 className="text-sm font-semibold text-[color:var(--text-primary)] min-[1920px]:text-base">{heading}</h3>
      {total === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/45 px-4 py-5 text-center text-sm text-[color:var(--text-secondary)]">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)]/55 p-3 shadow-inner">
          <div className="flex h-4 overflow-hidden rounded-full bg-[color:var(--surface-muted)]/65" aria-hidden="true">
            {segments.map((segment) => (
              <span
                key={segment.label}
                className={`deck-builder-type-segment ${segment.colorClassName}`}
                style={{ width: `${(segment.count / total) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-3 grid gap-2">
            {segments.map((segment) => (
              <div key={segment.label} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${segment.colorClassName}`} />
                  <span className="truncate font-semibold text-[color:var(--text-secondary)]">{segment.label}</span>
                </div>
                <span className="font-bold text-[color:var(--text-primary)]">{segment.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatAverage(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function calculateAverageStat(
  unitEntries: DeckEntry[],
  getValue: (card: Card) => number | null | undefined
) {
  let weightedTotal = 0;
  let totalCount = 0;

  for (const entry of unitEntries) {
    const value = getValue(entry.card);
    if (value == null || !Number.isFinite(value)) {
      continue;
    }

    weightedTotal += value * entry.count;
    totalCount += entry.count;
  }

  return totalCount > 0 ? weightedTotal / totalCount : null;
}

function UnitStatProfile({ className = '', deckEntries, heading, emptyLabel, labels }: UnitStatProfileProps) {
  const unitEntries = deckEntries.filter((entry) => entry.card.type.toLowerCase().includes('unit'));
  const stats: UnitStat[] = [
    {
      key: 'attack',
      label: labels.attack,
      value: calculateAverageStat(unitEntries, (card) => card.attack),
    },
    {
      key: 'health',
      label: labels.health,
      value: calculateAverageStat(unitEntries, (card) => card.health),
    },
    {
      key: 'influence',
      label: labels.influence,
      value: calculateAverageStat(unitEntries, (card) => card.influence),
    },
  ];
  const availableStats = stats.filter((stat) => stat.value != null);
  const maxAverage = Math.max(1, ...availableStats.map((stat) => stat.value ?? 0));
  const iconMap = {
    attack: Sword,
    health: HeartPulse,
    influence: Sparkles,
  };

  return (
    <div className={className}>
      <h3 className="text-sm font-semibold text-[color:var(--text-primary)] min-[1920px]:text-base">{heading}</h3>
      {availableStats.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/45 px-4 py-5 text-center text-sm text-[color:var(--text-secondary)]">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)]/55 p-3 shadow-inner">
          {stats.map((stat) => {
            const Icon = iconMap[stat.key];
            const value = stat.value;
            const width = value == null ? 0 : Math.max(8, (value / maxAverage) * 100);

            return (
              <div key={stat.key} className="grid grid-cols-[minmax(5.5rem,auto)_1fr_2.5rem] items-center gap-3">
                <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[color:var(--text-secondary)]">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[color:var(--accent)]/35 bg-[color:var(--surface)] text-[color:var(--accent)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="truncate">{stat.label}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[color:var(--surface-muted)]/65">
                  <div
                    className={`deck-builder-stat-bar h-full rounded-full ${stat.key === 'health' ? 'deck-builder-stat-bar-health' : ''} ${stat.key === 'influence' ? 'deck-builder-stat-bar-influence' : ''}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <span className="text-right text-sm font-bold text-[color:var(--text-primary)]">{formatAverage(value)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CostCurve({ className = '', costBuckets, maxBucketCount, totalCards, heading, emptyLabel }: CostCurveProps) {
  const hasCards = maxBucketCount > 0;
  const visibleBuckets = costBuckets.filter((bucket) => bucket.count > 0);
  const bucketsToRender = visibleBuckets.length > 0 ? visibleBuckets : costBuckets;

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)] min-[1920px]:text-base">{heading}</h3>
        </div>
      </div>
      {totalCards === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/45 px-4 py-5 text-center">
          <div className="mx-auto flex h-16 max-w-48 items-end justify-center gap-1.5" aria-hidden="true">
            {[2, 4, 3, 6, 5, 3, 2].map((height, index) => (
              <span
                key={index}
                className="w-4 rounded-t-sm bg-[color:var(--surface-muted)]"
                style={{ height: `${height * 0.45}rem` }}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-[color:var(--text-secondary)]">{emptyLabel}</p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="deck-builder-cost-curve relative flex h-36 items-end gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)]/55 px-3 pb-8 pt-4 shadow-inner">
            {bucketsToRender.map((bucket) => {
              const height = hasCards ? Math.max((bucket.count / maxBucketCount) * 104, 6) : 0;
              const isPeak = bucket.count === maxBucketCount && bucket.count > 0;
              const isEmpty = bucket.count === 0;

              return (
                <div key={bucket.cost} className="relative flex h-full flex-1 flex-col items-center justify-end">
                  <div
                    className={`deck-builder-cost-bar flex w-full max-w-9 items-start justify-center rounded-t-md border border-white/10 pt-1 shadow-sm transition ${
                      isPeak ? 'deck-builder-cost-bar-peak' : ''
                    } ${isEmpty ? 'opacity-35' : ''}`}
                    style={{ height: `${height}px` }}
                    aria-label={`${bucket.count} cards with cost ${bucket.cost}`}
                    title={`${bucket.count} cards with cost ${bucket.cost}`}
                  >
                    {bucket.count > 0 ? (
                      <span className="text-[10px] font-bold leading-none text-[color:var(--text-on-accent)] drop-shadow">
                        {bucket.count}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={`absolute bottom-[-1.45rem] text-xs font-semibold ${
                      bucket.count > 0 ? 'text-[color:var(--text-primary)]' : 'text-[color:var(--text-secondary)]'
                    }`}
                  >
                    {bucket.cost}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
export type DeckPanelProps = {
  deckEntries: DeckEntry[];
  totalCards: number;
  costBuckets: CostBucket[];
  maxBucketCount: number;
  labels: {
    deckHeading: string;
    totalCardsLabel: string;
    emptyDeck: string;
    removeButton: string;
    addButton: string;
    costCurveHeading: string;
    costCurveEmpty: string;
    unitStatsHeading: string;
    unitStatsEmpty: string;
    cardTypeBreakdownHeading: string;
    attackLabel: string;
    healthLabel: string;
    influenceLabel: string;
    showCostCurve: string;
    hideCostCurve: string;
    menuButton: string;
    menuImport: string;
    menuExport: string;
    menuShare: string;
    menuSave: string;
  };
  onAdd: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onZoom: (card: Card | null, variant?: 'default' | 'compact', anchor?: ZoomAnchor | null) => void;
  onMenuSelect: (action: 'import' | 'export' | 'share' | 'save') => void;
  isCostCurveVisible: boolean;
  onToggleCostCurve: () => void;
  className?: string;
};

export function DeckPanel({
  deckEntries,
  totalCards,
  costBuckets,
  maxBucketCount,
  labels,
  onAdd,
  onRemove,
  onZoom,
  onMenuSelect,
  isCostCurveVisible,
  onToggleCostCurve,
  className = '',
}: DeckPanelProps) {
  const costCurveToggleLabel = isCostCurveVisible ? labels.hideCostCurve : labels.showCostCurve;
  const rootClassName = [
    'flex min-h-0 min-w-0 basis-1/2 flex-1 flex-col xl:basis-2/5 min-[1920px]:basis-1/3',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const sections = useMemo(() => {
    if (deckEntries.length === 0) {
      return [];
    }

    const groups = new Map<string, { label: string; entries: DeckEntry[] }>();

    for (const entry of deckEntries) {
      const rawType = entry.card.type?.trim();
      const label = rawType && rawType.length > 0 ? rawType : FALLBACK_TYPE_LABEL;
      const key = label.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.set(key, { label, entries: [entry] });
      }
    }

    const getPriority = (label: string) => {
      const normalized = PRIORITY_MATCHERS.find(({ matcher }) => label.toLowerCase().includes(matcher));
      if (normalized) {
        return CARD_TYPE_ORDER.indexOf(normalized.type);
      }
      const index = CARD_TYPE_ORDER.findIndex((type) => type.toLowerCase() === label.toLowerCase());
      return index === -1 ? CARD_TYPE_ORDER.length : index;
    };

    return Array.from(groups.values())
      .map(({ label, entries }) => ({
        type: label,
        entries,
        total: entries.reduce((sum, item) => sum + item.count, 0),
      }))
      .sort((a, b) => {
        const priorityDiff = getPriority(a.type) - getPriority(b.type);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return a.type.localeCompare(b.type);
      });
  }, [deckEntries]);

  const deckListContent =
    deckEntries.length === 0 ? (
      <p className="rounded-md border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)]/35 px-4 py-8 text-center text-sm text-[color:var(--text-secondary)] min-[1920px]:px-4 min-[1920px]:py-8">
        {labels.emptyDeck}
      </p>
    ) : (
      <div className="flex flex-col gap-6">
        {sections.map((section) => (
          <section key={section.type} className="flex flex-col gap-3">
            <header className="flex items-center justify-between border-b border-[color:var(--border)]/75 px-1 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)] min-[1920px]:text-sm">
                {section.type}
              </h3>
              <span className="text-xs text-[color:var(--text-secondary)]">x{section.total}</span>
            </header>
            <ul className="flex flex-col gap-2">
              {section.entries.map(({ card, count }) => (
                <DeckCardChip
                  key={card.id}
                  card={card}
                  count={count}
                  labels={{ add: labels.addButton, remove: labels.removeButton }}
                  onIncrement={onAdd}
                  onDecrement={onRemove}
                  onZoom={onZoom}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );

  const deckListSmall = (
    <div className="deck-builder-scroll h-full min-h-0 overflow-y-auto px-3 pb-4 pt-4 sm:px-4">
      {deckListContent}
    </div>
  );

  const deckListLarge = (
    <div className="deck-builder-scroll flex-1 h-full min-h-0 overflow-y-auto min-[1920px]:order-1 min-[1920px]:p-0 min-[1920px]:pr-4">
      {deckListContent}
    </div>
  );
  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(target) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(target)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  function toggleMenu() {
    setIsMenuOpen((previous) => !previous);
  }

  function handleMenuAction(action: 'import' | 'export' | 'share' | 'save') {
    setIsMenuOpen(false);
    onMenuSelect(action);
  }

  return (
    <aside className={rootClassName}>
      <section className="deck-builder-pane relative z-10 flex min-h-0 flex-1 flex-col overflow-visible rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="deck-builder-deck-header flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{labels.deckHeading}</h2>
              <span className="mt-1 block text-xs font-semibold uppercase text-[color:var(--text-secondary)]">
                {labels.totalCardsLabel}: {totalCards}
              </span>
            </div>
            <div className="relative" ref={menuContainerRef}>
              <button
                type="button"
                ref={menuButtonRef}
                onClick={toggleMenu}
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                className="flex h-9 items-center gap-2 rounded-md bg-[color:var(--accent)] px-3 text-xs font-semibold uppercase text-[color:var(--text-on-accent)] shadow-md shadow-black/15 transition-colors hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              >
                <span>{labels.menuButton}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {isMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleMenuAction('import')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)]"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>{labels.menuImport}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleMenuAction('export')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)]"
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    <span>{labels.menuExport}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleMenuAction('share')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)]"
                  >
                    <Share2 className="h-4 w-4" aria-hidden="true" />
                    <span>{labels.menuShare}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleMenuAction('save')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)]"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    <span>{labels.menuSave}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 min-[1920px]:hidden">
              <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
                {labels.costCurveHeading}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isCostCurveVisible}
                onClick={onToggleCostCurve}
                className={`relative h-5 w-9 rounded-full transition-colors focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                  isCostCurveVisible ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--border)]'
                }`}
              >
                <span className="sr-only">{costCurveToggleLabel}</span>
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform transform ${
                    isCostCurveVisible ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
        <div
          className={`deck-builder-analytics-panel deck-builder-scroll border-b border-[color:var(--border)] bg-[color:var(--surface-muted)]/20 min-[1920px]:hidden ${
            isCostCurveVisible ? 'block' : 'hidden'
          }`}
        >
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <CostCurve
              className="min-w-0"
              costBuckets={costBuckets}
              maxBucketCount={maxBucketCount}
              totalCards={totalCards}
              heading={labels.costCurveHeading}
              emptyLabel={labels.costCurveEmpty}
            />
            <CardTypeBreakdown
              className="min-w-0"
              deckEntries={deckEntries}
              heading={labels.cardTypeBreakdownHeading}
              emptyLabel={labels.emptyDeck}
            />
            <UnitStatProfile
              className="min-w-0"
              deckEntries={deckEntries}
              heading={labels.unitStatsHeading}
              emptyLabel={labels.unitStatsEmpty}
              labels={{
                attack: labels.attackLabel,
                health: labels.healthLabel,
                influence: labels.influenceLabel,
              }}
            />
          </div>
        </div>
        <div className="hidden min-[1920px]:flex min-[1920px]:min-h-0 min-[1920px]:flex-1 min-[1920px]:items-start min-[1920px]:gap-6 min-[1920px]:px-6 min-[1920px]:pb-6 min-[1920px]:pt-4 min-[1920px]:overflow-hidden">
          {deckListLarge}
          <div className="flex w-[320px] flex-shrink-0 flex-col gap-4 min-[1920px]:order-2">
            <CostCurve
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 p-4 shadow-sm"
              costBuckets={costBuckets}
              maxBucketCount={maxBucketCount}
              totalCards={totalCards}
              heading={labels.costCurveHeading}
              emptyLabel={labels.costCurveEmpty}
            />
            <CardTypeBreakdown
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 p-4 shadow-sm"
              deckEntries={deckEntries}
              heading={labels.cardTypeBreakdownHeading}
              emptyLabel={labels.emptyDeck}
            />
            <UnitStatProfile
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 p-4 shadow-sm"
              deckEntries={deckEntries}
              heading={labels.unitStatsHeading}
              emptyLabel={labels.unitStatsEmpty}
              labels={{
                attack: labels.attackLabel,
                health: labels.healthLabel,
                influence: labels.influenceLabel,
              }}
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 min-[1920px]:hidden">
          {deckListSmall}
        </div>
      </section>
    </aside>
  );
}





'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { getAffinityColorScheme } from '../constants';
import type { DeckEntry } from '../types';

type DeckShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  deckEntries: DeckEntry[];
  totalCards: number;
  labels: {
    deckHeading: string;
    totalCardsLabel: string;
    shareButton: string;
    shareGenerating: string;
    shareDownload: string;
    shareCopy: string;
    shareCopySuccess: string;
    shareCopyError: string;
    shareEmpty: string;
    shareError: string;
  };
};

export function DeckShareModal({ isOpen, onClose, deckEntries, totalCards, labels }: DeckShareModalProps) {
  const sharePreviewRef = useRef<HTMLDivElement | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareCopyStatus, setShareCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);

  const hasDeck = deckEntries.length > 0;

  const shareCards = useMemo(() => {
    if (deckEntries.length === 0) {
      return [];
    }

    const order = ['Unit', 'Renowned Unit', 'Item', 'Territory'];

    const getPriority = (type: string) => {
      const normalized = type.trim().toLowerCase();
      const exactIndex = order.findIndex((value) => value.toLowerCase() === normalized);
      if (exactIndex !== -1) {
        return exactIndex;
      }

      if (normalized.includes('renowned') && normalized.includes('unit')) {
        return order.findIndex((value) => value === 'Renowned Unit');
      }
      if (normalized.includes('unit')) {
        return order.findIndex((value) => value === 'Unit');
      }
      if (normalized.includes('item')) {
        return order.findIndex((value) => value === 'Item');
      }
      if (normalized.includes('territory')) {
        return order.findIndex((value) => value === 'Territory');
      }
      return order.length;
    };

    return [...deckEntries]
      .map((entry) => {
        const typeLabel = entry.card.type?.trim() ?? 'Other';
        return {
          entry,
          typeLabel,
          priority: getPriority(typeLabel),
        };
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        if (a.entry.card.cost !== b.entry.card.cost) {
          return a.entry.card.cost - b.entry.card.cost;
        }

        const aNumber = a.entry.card.number ?? Number.POSITIVE_INFINITY;
        const bNumber = b.entry.card.number ?? Number.POSITIVE_INFINITY;
        if (aNumber !== bNumber) {
          return aNumber - bNumber;
        }

        return a.entry.card.name.localeCompare(b.entry.card.name);
      });
  }, [deckEntries]);

  const shareLayout = useMemo(() => {
    const total = shareCards.length;
    const CANVAS_WIDTH = 1200;
    const CANVAS_HEIGHT = 900;
    const PADDING_X = 32;
    const PADDING_Y = 32;
    const GAP = 16;
    const CARD_HEIGHT_RATIO = 4 / 3;

    if (total === 0) {
      const cardWidth = CANVAS_WIDTH - PADDING_X * 2;
      return {
        columns: 1,
        rows: 0,
        cardWidth,
        cardHeight: cardWidth * CARD_HEIGHT_RATIO,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        paddingX: PADDING_X,
        paddingY: PADDING_Y,
        gap: GAP,
      };
    }

    const maxColumns = Math.min(total, 12);
    let bestWidth = 0;
    let bestColumns = 1;
    let bestRows = Math.ceil(total / bestColumns);

    for (let columns = 1; columns <= maxColumns; columns++) {
      const rows = Math.ceil(total / columns);
      const maxWidthPerCard = (CANVAS_WIDTH - PADDING_X * 2 - GAP * (columns - 1)) / columns;
      const maxHeightPerCard = (CANVAS_HEIGHT - PADDING_Y * 2 - GAP * (rows - 1)) / rows;
      if (maxWidthPerCard <= 0 || maxHeightPerCard <= 0) {
        continue;
      }
      const heightLimitedWidth = maxHeightPerCard / CARD_HEIGHT_RATIO;
      const feasibleWidth = Math.min(maxWidthPerCard, heightLimitedWidth);
      if (feasibleWidth <= 0) {
        continue;
      }
      if (feasibleWidth > bestWidth) {
        bestWidth = feasibleWidth;
        bestColumns = columns;
        bestRows = rows;
      }
    }

    if (bestWidth <= 0) {
      const fallbackColumns = Math.min(total, maxColumns);
      const fallbackRows = Math.ceil(total / fallbackColumns);
      const fallbackWidth =
        (CANVAS_WIDTH - PADDING_X * 2 - GAP * (fallbackColumns - 1)) / fallbackColumns;
      return {
        columns: fallbackColumns,
        rows: fallbackRows,
        cardWidth: fallbackWidth,
        cardHeight: fallbackWidth * CARD_HEIGHT_RATIO,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        paddingX: PADDING_X,
        paddingY: PADDING_Y,
        gap: GAP,
      };
    }

    return {
      columns: bestColumns,
      rows: bestRows,
      cardWidth: bestWidth,
      cardHeight: bestWidth * CARD_HEIGHT_RATIO,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      paddingX: PADDING_X,
      paddingY: PADDING_Y,
      gap: GAP,
    };
  }, [shareCards.length]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setIsGeneratingShare(false);
    setShareImageUrl(null);
    setShareCopyStatus('idle');
    setShareError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!hasDeck) {
      setShareImageUrl(null);
      setShareCopyStatus('idle');
      setShareError(labels.shareEmpty);
      setIsGeneratingShare(false);
      return;
    }

    let cancelled = false;
    setShareError(null);
    setShareCopyStatus('idle');
    setShareImageUrl(null);
    setIsGeneratingShare(true);

    const frame = requestAnimationFrame(async () => {
      if (cancelled) {
        return;
      }

      if (!sharePreviewRef.current) {
        if (!cancelled) {
          setShareError(labels.shareError);
          setIsGeneratingShare(false);
        }
        return;
      }

      try {
        const htmlToImageModule = await import('html-to-image');
        const toPng =
          (htmlToImageModule as typeof import('html-to-image')).toPng ??
          ((htmlToImageModule as { default?: typeof import('html-to-image') }).default?.toPng ?? null);
        if (!toPng) {
          throw new Error('html-to-image export not found');
        }
        let backgroundColor = '#ffffff';
        if (typeof window !== 'undefined') {
          const surface = getComputedStyle(document.body).getPropertyValue('--surface').trim();
          backgroundColor = surface || backgroundColor;
        }

        const dataUrl = await toPng(sharePreviewRef.current, {
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor,
          useCors: true,
        });

        if (!cancelled) {
          setShareImageUrl(dataUrl);
          setShareCopyStatus('idle');
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error && error.message ? error.message : labels.shareError;
          setShareError(`${labels.shareError} (${message})`);
        }
      } finally {
        if (!cancelled) {
          setIsGeneratingShare(false);
        }
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [isOpen, hasDeck, deckEntries, labels.shareEmpty, labels.shareError]);

  if (!isOpen) {
    return null;
  }

  function handleDownloadShareImage() {
    if (!shareImageUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = shareImageUrl;
    link.download = `deck-${Date.now()}.png`;
    link.click();
  }

  async function handleCopyShareImage() {
    if (!shareImageUrl) {
      return;
    }

    try {
      if ('clipboard' in navigator && 'write' in navigator.clipboard && typeof window !== 'undefined') {
        const ClipboardItemCtor = (window as typeof window & { ClipboardItem?: any }).ClipboardItem;
        if (ClipboardItemCtor) {
          const response = await fetch(shareImageUrl);
          const blob = await response.blob();
          const clipboardItem = new ClipboardItemCtor({ 'image/png': blob });
          await navigator.clipboard.write([clipboardItem]);
          setShareCopyStatus('success');
          return;
        }
      }
    } catch (error) {
      setShareCopyStatus('error');
      return;
    }

    setShareCopyStatus('error');
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-xl rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
              aria-label="Close menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {isGeneratingShare ? (
              <span className="text-sm text-[color:var(--text-secondary)]">{labels.shareGenerating}</span>
            ) : null}
            {shareError ? (
              <span className="text-xs text-[color:var(--accent)]">{shareError}</span>
            ) : null}
          </div>

          {shareImageUrl ? (
            <div className="mt-6 flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-[color:var(--text-primary)]">{labels.shareButton}</h4>
              <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 p-3">
                <img src={shareImageUrl} alt="Deck share preview" className="max-h-[28rem] w-full rounded-sm object-contain" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadShareImage}
                  className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-muted)]"
                >
                  {labels.shareDownload}
                </button>
                <button
                  type="button"
                  onClick={handleCopyShareImage}
                  className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-muted)]"
                >
                  {labels.shareCopy}
                </button>
              </div>
              {shareCopyStatus === 'success' ? (
                <span className="text-xs text-[color:var(--text-secondary)]">{labels.shareCopySuccess}</span>
              ) : null}
              {shareCopyStatus === 'error' ? (
                <span className="text-xs text-[color:var(--accent)]">{labels.shareCopyError}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none fixed -left-[9999px] top-0">
        <div
          ref={sharePreviewRef}
          className="overflow-hidden rounded-[32px] border border-black/15 bg-[#020617] text-white shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
          style={{
            width: `${shareLayout.width}px`,
            height: `${shareLayout.height}px`,
            fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          <div
            className="h-full w-full"
            style={{
              padding: `${shareLayout.paddingY}px ${shareLayout.paddingX}px`,
            }}
          >
            <ul
              className="grid"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${shareLayout.columns}, ${shareLayout.cardWidth}px)`,
                gap: `${shareLayout.gap}px`,
                justifyContent: 'center',
                alignContent: 'start',
              }}
            >
              {shareCards.map(({ entry }) => {
                const { card, count } = entry;
                const scheme = getAffinityColorScheme(card.affinity);

                return (
                  <li
                    key={`share-${card.id}`}
                    className="relative overflow-hidden rounded-[18px] border border-white/15 shadow-[0_10px_20px_rgba(0,0,0,0.35)]"
                    style={{
                      width: `${shareLayout.cardWidth}px`,
                      height: `${shareLayout.cardHeight}px`,
                      background: 'linear-gradient(180deg, rgba(15,23,42,0.65) 0%, rgba(15,23,42,0.9) 100%)',
                    }}
                  >
                    {card.imageSrc ? (
                      <img
                        src={card.imageSrc}
                        alt={card.name}
                        className="block h-full w-full object-cover"
                        crossOrigin="anonymous"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.24em] text-white/60">
                        No Art
                      </div>
                    )}
                    <span
                      className="absolute right-2 top-2 rounded-full px-2.5 py-[2px] text-[11px] font-semibold leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
                      style={{
                        backgroundColor: scheme.chipBackground,
                        color: scheme.chipTextColor,
                      }}
                    >
                      x{count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

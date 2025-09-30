'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { DeckEntry } from '../types';

type DeckMenuModalProps = {
  isOpen: boolean;
  onClose: () => void;
  deckEntries: DeckEntry[];
  totalCards: number;
  labels: {
    deckHeading: string;
    totalCardsLabel: string;
    exportOptionTTS: string;
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

export function DeckMenuModal({ isOpen, onClose, deckEntries, totalCards, labels }: DeckMenuModalProps) {
  const sharePreviewRef = useRef<HTMLDivElement | null>(null);
  const [exportContent, setExportContent] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [shareCopyStatus, setShareCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);

  const hasDeck = deckEntries.length > 0;

  const shareSections = useMemo(() => {
    const order = ['Unit', 'Tactic', 'Territory'];
    return order.map((type) => {
      const entries = deckEntries.filter(({ card }) => card.type.toLowerCase() === type.toLowerCase());
      return { type, entries };
    });
  }, [deckEntries]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setExportContent(null);
    setCopyStatus('idle');
    setIsGeneratingShare(false);
    setShareImageUrl(null);
    setShareCopyStatus('idle');
    setShareError(null);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleExportTTS() {
    if (!hasDeck) {
      return;
    }

    const payload = deckEntries.map(({ card, count }) => ({ count, name: card.name }));
    const json = JSON.stringify(payload, null, 2);
    setExportContent(json);
    setCopyStatus('idle');
  }

  async function handleCopyExport() {
    if (!exportContent) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(exportContent);
        setCopyStatus('success');
        return;
      }
    } catch (error) {
      // fall through to prompt
    }

    const didCopy = window.prompt('Copy the export JSON:', exportContent);
    setCopyStatus(didCopy != null ? 'success' : 'error');
  }

  async function handleGenerateShareImage() {
    if (!hasDeck) {
      setShareError(labels.shareEmpty);
      return;
    }

    if (!sharePreviewRef.current) {
      setShareError(labels.shareError);
      return;
    }

    setIsGeneratingShare(true);
    setShareError(null);
    setShareImageUrl(null);

    try {
      const htmlToImage = await import('html-to-image');
      let backgroundColor = '#ffffff';
      if (typeof window !== 'undefined') {
        const surface = getComputedStyle(document.body).getPropertyValue('--surface').trim();
        backgroundColor = surface || backgroundColor;
      }
      const dataUrl = await htmlToImage.toPng(sharePreviewRef.current, {
        pixelRatio: 1.2,
        cacheBust: true,
        backgroundColor,
      });
      setShareImageUrl(dataUrl);
      setShareCopyStatus('idle');
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : labels.shareError;
      setShareError(`${labels.shareError} (${message})`);
    } finally {
      setIsGeneratingShare(false);
    }
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

          <div className="mt-4 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleExportTTS}
              disabled={!hasDeck}
              className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                !hasDeck
                  ? 'cursor-not-allowed border border-[color:var(--border)] text-[color:var(--text-secondary)]/60'
                  : 'border border-[color:var(--accent)] text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-[color:var(--text-on-accent)]'
              }`}
            >
              {labels.exportOptionTTS}
            </button>
            <button
              type="button"
              onClick={handleGenerateShareImage}
              disabled={!hasDeck || isGeneratingShare}
              className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] ${
                !hasDeck || isGeneratingShare
                  ? 'cursor-not-allowed border border-[color:var(--border)] text-[color:var(--text-secondary)]/60'
                  : 'border border-[color:var(--accent)] text-[color:var(--accent)] hover:bg-[color:var(--accent)] hover:text-[color:var(--text-on-accent)]'
              }`}
            >
              {isGeneratingShare ? labels.shareGenerating : labels.shareButton}
            </button>
            {!hasDeck ? <span className="text-xs text-[color:var(--text-secondary)]">{labels.shareEmpty}</span> : null}
            {shareError ? <span className="text-xs text-[color:var(--accent)]">{shareError}</span> : null}
          </div>

          {exportContent ? (
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[color:var(--text-primary)]">{labels.exportOptionTTS}</h4>
                <button
                  type="button"
                  onClick={handleCopyExport}
                  className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-muted)]"
                >
                  Copy
                </button>
              </div>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/60 p-3 text-xs text-[color:var(--text-primary)]">{exportContent}</pre>
              {copyStatus === 'success' ? (
                <span className="text-xs text-[color:var(--text-secondary)]">Copied to clipboard.</span>
              ) : null}
              {copyStatus === 'error' ? (
                <span className="text-xs text-[color:var(--accent)]">Unable to copy automatically. Please copy manually.</span>
              ) : null}
            </div>
          ) : null}

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
          className="w-[640px] rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 text-black shadow-2xl"
          style={{ fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
        >
          <header className="flex flex-col gap-1 border-b border-neutral-200 pb-4">
            <h2 className="text-2xl font-bold text-[color:var(--accent)]">{labels.deckHeading}</h2>
            <span className="text-sm text-neutral-500">
              {labels.totalCardsLabel}: {totalCards}
            </span>
          </header>

          {['Unit', 'Tactic', 'Territory'].map((category) => {
            const section = shareSections.find((item) => item.type === category);
            if (!section || section.entries.length === 0) {
              return null;
            }

            return (
              <section key={`share-${category}`} className="mt-4 first:mt-0">
                <header className="flex items-center justify-between border-b border-neutral-200 pb-2">
                  <h3 className="text-xl font-semibold text-[color:var(--accent)]">{category}</h3>
                  <span className="text-xs text-neutral-500">{section.entries.length} cards</span>
                </header>
                <ul className="mt-3 grid grid-cols-2 gap-3">
                  {section.entries.map(({ card, count }) => (
                    <li
                      key={`share-${category}-${card.id}`}
                      className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3"
                    >
                      <div className="min-w-0 pr-3">
                        <p className="truncate text-sm font-semibold text-neutral-900">{card.name}</p>
                        <p className="truncate text-xs text-neutral-500">
                          {card.subtype ? `${card.subtype}` : card.type}
                        </p>
                      </div>
                      <span className="rounded-full bg-[color:var(--accent)] px-3 py-1 text-xs font-semibold text-[color:var(--text-on-accent)]">
                        x{count}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}

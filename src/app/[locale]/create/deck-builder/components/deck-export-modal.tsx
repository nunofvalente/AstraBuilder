'use client';

import { useEffect, useState } from 'react';

import type { DeckEntry } from '../types';

type DeckExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  deckEntries: DeckEntry[];
  labels: {
    exportOptionTTS: string;
    emptyDeck: string;
    exportCopy: string;
    exportCopySuccess: string;
    exportCopyError: string;
  };
};

export function DeckExportModal({ isOpen, onClose, deckEntries, labels }: DeckExportModalProps) {
  const [exportContent, setExportContent] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!isOpen) {
      setExportContent(null);
      setCopyStatus('idle');
      return;
    }

    if (deckEntries.length === 0) {
      setExportContent(null);
      return;
    }

    const payload = deckEntries.map(({ card, count }) => ({ count, name: card.name }));
    setExportContent(JSON.stringify(payload, null, 2));
    setCopyStatus('idle');
  }, [isOpen, deckEntries]);

  if (!isOpen) {
    return null;
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
      // fall through to prompt fallback
    }

    const didCopy = window.prompt(labels.exportCopy, exportContent);
    setCopyStatus(didCopy != null ? 'success' : 'error');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">{labels.exportOptionTTS}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            aria-label="Close export dialog"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>

        {exportContent ? (
          <div className="mt-4 flex flex-col gap-3">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/60 p-3 text-xs text-[color:var(--text-primary)]">
              {exportContent}
            </pre>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyExport}
                className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-muted)]"
              >
                {labels.exportCopy}
              </button>
              {copyStatus === 'success' ? (
                <span className="self-center text-xs text-[color:var(--text-secondary)]">{labels.exportCopySuccess}</span>
              ) : null}
              {copyStatus === 'error' ? (
                <span className="self-center text-xs text-[color:var(--accent)]">{labels.exportCopyError}</span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-[color:var(--text-secondary)]">{labels.emptyDeck}</p>
        )}
      </div>
    </div>
  );
}

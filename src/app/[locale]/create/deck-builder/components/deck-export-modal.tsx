'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clipboard, Download, FileText, X } from 'lucide-react';

import { buildDeckExportContent, type DeckExportFormat } from '../export-formats';
import type { DeckEntry } from '../types';

type DeckExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  deckEntries: DeckEntry[];
  labels: {
    exportHeading: string;
    exportOptionTTS: string;
    exportOptionText: string;
    emptyDeck: string;
    exportCopy: string;
    exportCopySuccess: string;
    exportCopyError: string;
  };
};

export function DeckExportModal({ isOpen, onClose, deckEntries, labels }: DeckExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<DeckExportFormat>('tts');
  const [exportContent, setExportContent] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (!isOpen) {
      setSelectedFormat('tts');
      setExportContent(null);
      setCopyStatus('idle');
      return;
    }

    if (deckEntries.length === 0) {
      setExportContent(null);
      return;
    }

    setExportContent(buildDeckExportContent(deckEntries, selectedFormat));
    setCopyStatus('idle');
  }, [isOpen, deckEntries, selectedFormat]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4">
      <div className="grid max-h-[calc(100vh-2rem)] w-full max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-4 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)]/30 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/12 text-[color:var(--accent)]">
              <Download className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-[color:var(--text-primary)]">{labels.exportHeading}</h2>
              <p className="mt-1 truncate text-xs text-[color:var(--text-secondary)]">
                {selectedFormat === 'tts' ? labels.exportOptionTTS : labels.exportOptionText}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-[color:var(--border)] bg-black/30 text-[color:var(--text-primary)] transition hover:bg-black/45 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            aria-label="Close export dialog"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
          {exportContent ? (
            <div className="flex flex-col gap-4">
              <div className="inline-flex w-fit rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 p-1">
                <button
                  type="button"
                  onClick={() => setSelectedFormat('tts')}
                  className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition ${
                    selectedFormat === 'tts'
                      ? 'bg-[color:var(--accent)] text-[color:var(--text-on-accent)] shadow-sm'
                      : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {labels.exportOptionTTS}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFormat('text')}
                  className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition ${
                    selectedFormat === 'text'
                      ? 'bg-[color:var(--accent)] text-[color:var(--text-on-accent)] shadow-sm'
                      : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {labels.exportOptionText}
                </button>
              </div>
              <pre className="max-h-[22rem] overflow-auto whitespace-pre-wrap rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/55 p-3 text-xs leading-relaxed text-[color:var(--text-primary)] shadow-inner">
                {exportContent}
              </pre>
              {copyStatus === 'success' ? (
                <p className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {labels.exportCopySuccess}
                </p>
              ) : null}
              {copyStatus === 'error' ? (
                <p className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {labels.exportCopyError}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/35 px-3 py-3 text-sm text-[color:var(--text-secondary)]">{labels.emptyDeck}</p>
          )}
        </div>

        <div className="flex justify-end border-t border-[color:var(--border)] bg-[color:var(--surface-muted)]/25 px-4 py-4 sm:px-5">
          {exportContent ? (
            <button
              type="button"
              onClick={handleCopyExport}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            >
              <Clipboard className="h-4 w-4" aria-hidden="true" />
              {labels.exportCopy}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

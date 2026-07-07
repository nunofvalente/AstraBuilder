'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { AlertCircle, FileText, Upload, X } from 'lucide-react';

import type { DeckExportFormat } from '../export-formats';
import { parseDeckImport } from '../import-formats';
import type { Card } from '../types';

const MAX_COPIES_PER_CARD = 3;

type DeckImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  cards: Card[];
  onImport: (deck: Record<string, number>) => void;
  labels: {
    heading: string;
    importOptionTTS: string;
    importOptionText: string;
    instructionsTTS: string;
    instructionsText: string;
    placeholderTTS: string;
    placeholderText: string;
    uploadLabel: string;
    uploadTextLabel: string;
    importButton: string;
    cancelButton: string;
    errorInvalid: string;
    errorUnknown: string;
    errorEmpty: string;
  };
};

export function DeckImportModal({ isOpen, onClose, cards, onImport, labels }: DeckImportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<DeckExportFormat>('tts');
  const [inputValue, setInputValue] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unknownCards, setUnknownCards] = useState<string[]>([]);

  const cardNameMap = useMemo(() => {
    const map = new Map<string, Card>();
    for (const card of cards) {
      map.set(card.name.toLowerCase(), card);
    }
    return map;
  }, [cards]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFormat('tts');
      setInputValue('');
      setErrorMessage(null);
      setUnknownCards([]);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const uploadLabel = selectedFormat === 'tts' ? labels.uploadLabel : labels.uploadTextLabel;

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    file
      .text()
      .then((text) => {
        setInputValue(text);
        setErrorMessage(null);
        setUnknownCards([]);
      })
      .catch(() => {
        setErrorMessage(labels.errorInvalid);
      });
  }

  function handleImport() {
    if (!inputValue.trim()) {
      setErrorMessage(labels.errorEmpty);
      setUnknownCards([]);
      return;
    }

    try {
      const entries = parseDeckImport(inputValue, selectedFormat);
      if (entries.length === 0) {
        setErrorMessage(labels.errorEmpty);
        setUnknownCards([]);
        return;
      }

      const deck: Record<string, number> = {};
      const missing: string[] = [];

      for (const entry of entries) {
        const card = cardNameMap.get(entry.name.toLowerCase());
        if (!card) {
          if (!missing.includes(entry.name)) {
            missing.push(entry.name);
          }
          continue;
        }

        const nextCount = Math.min(MAX_COPIES_PER_CARD, Math.max(1, entry.count));
        deck[card.id] = Math.min(MAX_COPIES_PER_CARD, (deck[card.id] ?? 0) + nextCount);
      }

      if (Object.keys(deck).length === 0) {
        setErrorMessage(labels.errorEmpty);
        setUnknownCards(missing);
        return;
      }

      if (missing.length > 0) {
        setErrorMessage(labels.errorUnknown);
        setUnknownCards(missing);
        return;
      }

      onImport(deck);
      onClose();
    } catch {
      setErrorMessage(labels.errorInvalid);
      setUnknownCards([]);
      return;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4">
      <div className="grid max-h-[calc(100vh-2rem)] w-full max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-4 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)]/30 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-[color:var(--accent)]/35 bg-[color:var(--accent)]/12 text-[color:var(--accent)]">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-[color:var(--text-primary)]">{labels.heading}</h2>
              <p className="mt-1 truncate text-xs text-[color:var(--text-secondary)]">
                {selectedFormat === 'tts' ? labels.importOptionTTS : labels.importOptionText}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-[color:var(--border)] bg-black/30 text-[color:var(--text-primary)] transition hover:bg-black/45 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            aria-label={labels.cancelButton}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
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
                {labels.importOptionTTS}
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
                {labels.importOptionText}
              </button>
            </div>

            <p className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/35 px-3 py-3 text-sm text-[color:var(--text-secondary)]">
              {selectedFormat === 'tts' ? labels.instructionsTTS : labels.instructionsText}
            </p>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)]/30 px-3 py-3 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--accent)]/60 hover:bg-[color:var(--surface-muted)]/50">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--accent)]">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="truncate font-medium">{uploadLabel}</span>
              </span>
              <input
                type="file"
                accept="application/json,.json,.txt"
                onChange={handleFileInput}
                className="sr-only"
              />
            </label>

            <textarea
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value);
                setErrorMessage(null);
                setUnknownCards([]);
              }}
              placeholder={selectedFormat === 'tts' ? labels.placeholderTTS : labels.placeholderText}
              rows={12}
              className="min-h-72 w-full resize-none rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/55 p-3 font-mono text-xs leading-relaxed text-[color:var(--text-primary)] shadow-inner outline-none transition placeholder:text-[color:var(--text-secondary)]/70 focus:border-[color:var(--accent)] focus:bg-[color:var(--surface)] focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            />

            {errorMessage ? (
              <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <p>{errorMessage}</p>
                  {unknownCards.length > 0 ? (
                    <p className="break-words text-xs text-red-100/80">{unknownCards.join(', ')}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--border)] bg-[color:var(--surface-muted)]/25 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md border border-[color:var(--border)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            {labels.cancelButton}
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:bg-[color:var(--accent)]/90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {labels.importButton}
          </button>
        </div>
      </div>
    </div>
  );
}

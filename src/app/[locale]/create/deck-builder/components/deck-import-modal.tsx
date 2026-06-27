'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { X } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">{labels.heading}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-black/70 p-2 text-white transition hover:bg-black/80 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
            aria-label={labels.cancelButton}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 inline-flex w-fit rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/40 p-1">
          <button
            type="button"
            onClick={() => setSelectedFormat('tts')}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              selectedFormat === 'tts'
                ? 'bg-[color:var(--accent)] text-white'
                : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]'
            }`}
          >
            {labels.importOptionTTS}
          </button>
          <button
            type="button"
            onClick={() => setSelectedFormat('text')}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              selectedFormat === 'text'
                ? 'bg-[color:var(--accent)] text-white'
                : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)]'
            }`}
          >
            {labels.importOptionText}
          </button>
        </div>

        <p className="mt-4 text-sm text-[color:var(--text-secondary)]">
          {selectedFormat === 'tts' ? labels.instructionsTTS : labels.instructionsText}
        </p>

        <label className="mt-4 flex w-fit cursor-pointer flex-col items-start gap-2 text-xs font-medium text-[color:var(--text-secondary)]">
          {labels.uploadLabel}
          <input
            type="file"
            accept="application/json,.json,.txt"
            onChange={handleFileInput}
            className="block w-full text-xs text-[color:var(--text-secondary)]"
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
          className="mt-4 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/60 p-3 text-sm text-[color:var(--text-primary)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
        />

        {errorMessage ? (
          <div className="mt-3 space-y-1 text-xs text-[color:var(--accent)]">
            <p>{errorMessage}</p>
            {unknownCards.length > 0 ? (
              <p>{unknownCards.join(', ')}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-muted)]"
          >
            {labels.cancelButton}
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="rounded-md border border-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent)] transition hover:bg-[color:var(--accent)] hover:text-[color:var(--text-on-accent)]"
          >
            {labels.importButton}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

import type { SearchQuery, SearchSuggestion } from '../search';

type CardSearchBarProps = {
  searchTerm: string;
  placeholder: string;
  ariaLabel: string;
  libraryCountLabel: string;
  suggestions: SearchSuggestion[];
  filters: SearchQuery[];
  onSearchTermChange: (value: string) => void;
  onSubmit: () => void;
  onSuggestionSelect: (value: string) => void;
  onRemoveFilter: (index: number) => void;
  children?: ReactNode;
};

export function CardSearchBar({
  searchTerm,
  placeholder,
  ariaLabel,
  libraryCountLabel,
  suggestions,
  filters,
  onSearchTermChange,
  onSubmit,
  onSuggestionSelect,
  onRemoveFilter,
  children,
}: CardSearchBarProps) {
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(-1);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const suggestionListId = 'card-search-suggestions';
  const hasSuggestions = suggestions.length > 0;
  const activeSuggestionId =
    activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length
      ? `${suggestionListId}-${suggestions[activeSuggestionIndex].key}`
      : undefined;

  suggestionRefs.current = Array(suggestions.length).fill(null);

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    if (!hasSuggestions) {
      setIsSuggestionOpen(false);
    }
  }, [hasSuggestions]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent | PointerEvent) {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      const target = event.target as Node | null;
      if (target && !root.contains(target)) {
        setIsSuggestionOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (activeSuggestionIndex < 0 || activeSuggestionIndex >= suggestionRefs.current.length) {
      return;
    }

    const node = suggestionRefs.current[activeSuggestionIndex];
    if (node) {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [activeSuggestionIndex]);

  function handleInputChange(value: string) {
    setActiveSuggestionIndex(-1);
    setIsSuggestionOpen(true);
    onSearchTermChange(value);
  }

  function handleSuggestionPick(value: string) {
    setActiveSuggestionIndex(-1);
    setIsSuggestionOpen(false);
    onSuggestionSelect(value);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && hasSuggestions) {
      event.preventDefault();
      setActiveSuggestionIndex((previous) => {
        const next = previous + 1;
        if (next >= suggestions.length) {
          return 0;
        }
        return next;
      });
      return;
    }

    if (event.key === 'ArrowUp' && hasSuggestions) {
      event.preventDefault();
      setActiveSuggestionIndex((previous) => {
        if (previous <= 0) {
          return suggestions.length - 1;
        }
        return previous - 1;
      });
      return;
    }

    if (event.key === 'Escape') {
      if (activeSuggestionIndex !== -1 || isSuggestionOpen) {
        event.preventDefault();
        setActiveSuggestionIndex(-1);
        setIsSuggestionOpen(false);
      }
      return;
    }

    if (event.key === 'Enter') {
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < suggestions.length) {
        event.preventDefault();
        handleSuggestionPick(suggestions[activeSuggestionIndex].value);
        return;
      }

      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="deck-builder-command-surface border-b border-[color:var(--border)] px-3 py-3 sm:px-4" ref={rootRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex min-w-0 flex-1">
          <input
            id="card-search"
            type="search"
            value={searchTerm}
            onChange={(event) => handleInputChange(event.target.value)}
            onFocus={() => hasSuggestions && setIsSuggestionOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={hasSuggestions && isSuggestionOpen}
            aria-controls={hasSuggestions && isSuggestionOpen ? suggestionListId : undefined}
            aria-activedescendant={activeSuggestionId}
            className="h-11 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)]/88 px-3 py-2 text-sm shadow-inner shadow-black/5 transition focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/35"
          />
          {hasSuggestions && isSuggestionOpen ? (
            <ul
              id={suggestionListId}
              role="listbox"
              aria-label="Search suggestions"
              className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-auto rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-xl"
            >
              {suggestions.map((suggestion, index) => {
                const suggestionId = `${suggestionListId}-${suggestion.key}`;
                const isActive = index === activeSuggestionIndex;

                return (
                  <li key={suggestion.key}>
                    <button
                      id={suggestionId}
                      ref={(element) => {
                        suggestionRefs.current[index] = element;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSuggestionPick(suggestion.value);
                      }}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                        isActive
                          ? 'bg-[color:var(--surface-muted)] text-[color:var(--text-primary)]'
                          : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text-primary)]'
                      }`}
                    >
                      <span>{suggestion.display}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)]/75 px-3 py-2 text-right text-xs font-semibold uppercase text-[color:var(--text-secondary)] shadow-sm">
          <span>{libraryCountLabel}</span>
        </div>
      </div>

      {filters.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {filters.map((filter, index) => (
            <span
              key={`${filter.field.key}:${filter.value}:${index}`}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--surface)]/85 px-3 py-1 text-xs font-medium text-[color:var(--text-secondary)] shadow-sm"
            >
              <span>{`${filter.field.label}: ${filter.value}`}</span>
              <button
                type="button"
                onClick={() => onRemoveFilter(index)}
                className="rounded-full bg-black/40 p-1 text-white transition hover:bg-black/60 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
                aria-label={`Remove filter ${filter.field.label}: ${filter.value}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {children ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3">{children}</div> : null}
    </div>
  );
}

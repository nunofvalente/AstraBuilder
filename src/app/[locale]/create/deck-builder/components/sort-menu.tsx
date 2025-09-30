'use client';

import { useEffect, useRef, useState } from 'react';

type SortOption = {
  value: string;
  label: string;
};

type SortMenuProps = {
  options: readonly SortOption[];
  value: string;
  onChange: (value: string) => void;
};

export function SortMenu({ options, value, onChange }: SortMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!menuRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="card-sort-menu"
        className="flex items-center gap-2 rounded-md border border-[color:var(--border)] bg-transparent px-3 py-2 text-xs uppercase tracking-wide text-[color:var(--text-secondary)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
      >
        <span>Sort</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M8 10.5 12 6l4 4.5" />
          <path d="M8 13.5 12 18l4-4.5" />
        </svg>
      </button>
      {isOpen ? (
        <div
          id="card-sort-menu"
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] py-1 shadow-lg"
        >
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-[color:var(--surface-muted)] text-[color:var(--text-primary)]'
                    : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--text-primary)]'
                }`}
              >
                <span>{option.label}</span>
                {isActive ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

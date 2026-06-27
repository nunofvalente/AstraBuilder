'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Check } from 'lucide-react';

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
        <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
        <span>Sort</span>
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
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

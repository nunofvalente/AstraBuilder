import Image from 'next/image';

import { getAffinityIconPath } from '@/lib/cards/affinity';
import { AFFINITY_FILTERS } from '../constants';

export type AffinityFilterBarProps = {
  activeAffinities: Record<string, boolean>;
  onToggle: (value: string) => void;
};

export function AffinityFilterBar({ activeAffinities, onToggle }: AffinityFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {AFFINITY_FILTERS.map((filter) => {
        const isEnabled = activeAffinities[filter.value] ?? true;
        const iconSrc = getAffinityIconPath(filter.value) ?? filter.filledIcon;

        return (
          <button
            key={filter.value}
            type="button"
            data-affinity={filter.value}
            onClick={() => onToggle(filter.value)}
            className={`deck-builder-affinity-filter flex h-11 w-11 items-center justify-center rounded-md border shadow-sm transition duration-150 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] hover:-translate-y-0.5 hover:shadow-md ${
              isEnabled
                ? 'border-[color:var(--accent)]/55 bg-[color:var(--surface)]'
                : 'border-[color:var(--border)]/65 bg-[color:var(--surface-muted)]/55 opacity-70'
            }`}
            aria-pressed={isEnabled}
            title={filter.label}
          >
            <Image
              src={iconSrc}
              alt={`${filter.label} icon`}
              width={34}
              height={34}
              className={`h-8 w-8 select-none transition ${isEnabled ? 'opacity-100' : 'grayscale opacity-45'}`}
            />
            <span className="sr-only">{filter.label}</span>
          </button>
        );
      })}
    </div>
  );
}

import Image from 'next/image';

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
        const iconSrc = isEnabled ? filter.filledIcon : filter.disabledIcon;

        return (
          <button
            key={filter.value}
            type="button"
            onClick={() => onToggle(filter.value)}
            className={`flex h-12 w-12 items-center justify-center rounded-md border transition-transform duration-150 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] hover:-translate-y-1 hover:shadow-lg ${
              isEnabled
                ? 'border-[color:var(--accent)]/50 bg-[color:var(--surface)]'
                : 'border-transparent bg-[color:var(--surface-muted)]/60'
            }`}
            aria-pressed={isEnabled}
            title={filter.label}
          >
            <Image src={iconSrc} alt={`${filter.label} icon`} width={36} height={36} className="h-9 w-9 select-none" />
            <span className="sr-only">{filter.label}</span>
          </button>
        );
      })}
    </div>
  );
}

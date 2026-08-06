'use client';

import { useRouter } from 'next/navigation';

type CardDetailsBackButtonProps = {
  fallbackHref: string;
  preferHistory: boolean;
  label: string;
};

export function CardDetailsBackButton({
  fallbackHref,
  preferHistory,
  label,
}: CardDetailsBackButtonProps) {
  const router = useRouter();

  function handleBack() {
    if (preferHistory && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--text-secondary)] transition hover:text-[color:var(--accent)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]"
    >
      <span aria-hidden="true">←</span>
      {label}
    </button>
  );
}

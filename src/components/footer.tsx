'use client';

import Link from 'next/link';
import { useState } from 'react';

const footerBackgroundClass = 'bg-[#1f1c19]';
const footerTextClass = 'text-white';

export function Footer() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  function handleOpenDialog() {
    setIsDialogOpen(true);
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
  }

  return (
    <>
      <footer
        className={`hidden border-t border-white/10 lg:block ${footerBackgroundClass} ${footerTextClass}`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6">
          <button
            type="button"
            onClick={handleOpenDialog}
            className="text-sm font-medium underline-offset-4 transition hover:underline focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
          >
            Disclaimer
          </button>
          <div className="flex items-center gap-4">
            <Link
              href="https://discord.gg/TPycCTkD2g"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join the AstraBuilder Discord"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 127.14 96.36"
                className="h-5 w-5"
                fill="currentColor"
              >
                <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69c-6.27 0-11.43-5.73-11.43-12.78s5.06-12.79 11.43-12.79 11.54 5.78 11.43 12.79-5.06 12.78-11.43 12.78Zm42.24 0c-6.27 0-11.43-5.73-11.43-12.78s5.06-12.79 11.43-12.79 11.54 5.78 11.43 12.79-5.06 12.78-11.43 12.78Z" />
              </svg>
            </Link>
            <span className="text-xs text-white/70">AstraBuilder</span>
          </div>
        </div>
      </footer>

      {isDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disclaimer-title"
        >
          <div className="w-full max-w-lg rounded-lg bg-[color:var(--surface)] p-6 shadow-2xl">
            <h2
              id="disclaimer-title"
              className="text-xl font-semibold text-[color:var(--text-primary)]"
            >
              Disclaimer
            </h2>
            <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
              <p>
                AstraBuilder is an unofficial, fan-made deckbuilding companion
                for{' '}
                <Link
                  href="https://echoesofastra.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[color:var(--accent)] hover:underline"
                >
                  Echoes of Astra
                </Link>
                , an independent trading card game from the original creators.
              </p>
              <p>
                All card names, artwork, rules text, and related intellectual
                property are owned by the Echoes of Astra creators. They are
                reproduced here purely for community discussion and prototyping.
                This project is not endorsed by, or affiliated with, the Echoes
                of Astra team, and no copyright ownership is claimed.
              </p>
              <p>
                AstraBuilder is a community tool offered free of charge. To keep
                the site online, limited advertising may appear in the future to
                help offset hosting costs. Please support Echoes of Astra
                through their official channels.
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleCloseDialog}
                className="rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

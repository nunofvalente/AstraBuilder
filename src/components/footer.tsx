"use client";

import Link from "next/link";
import { useState } from "react";

const footerBackgroundClass = "bg-[#2b2927]";
const footerTextClass = "text-white";

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
      <footer className={`hidden lg:block ${footerBackgroundClass} ${footerTextClass}`}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6">
          <button
            type="button"
            onClick={handleOpenDialog}
            className="text-sm font-medium underline-offset-4 transition hover:underline focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
          >
            Disclaimer
          </button>
          <span className="text-xs text-white/70">AstraBuilder</span>
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
            <h2 id="disclaimer-title" className="text-xl font-semibold text-[color:var(--text-primary)]">
              Disclaimer
            </h2>
            <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
              <p>
                AstraBuilder is an unofficial, fan-made deckbuilding companion for{' '}
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
                All card names, artwork, rules text, and related intellectual property are owned by the Echoes of Astra
                creators. They are reproduced here purely for community discussion and prototyping. This project is not
                endorsed by, or affiliated with, the Echoes of Astra team, and no copyright ownership is claimed.
              </p>
              <p>
                AstraBuilder is a community tool offered free of charge. To keep the site online, limited advertising
                may appear in the future to help offset hosting costs. Please support Echoes of Astra through their
                official channels.
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

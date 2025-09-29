"use client";

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
      <footer className={`${footerBackgroundClass} ${footerTextClass}`}>
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
            <p className="mt-4 text-sm text-[color:var(--text-secondary)]">
              AstraBuilder is a fan-made deck building experience designed for demonstration purposes only. Card data
              shown here is placeholder content and should not be considered official or final.
            </p>
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
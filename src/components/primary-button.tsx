"use client";

import { forwardRef } from "react";

type PrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

const baseClasses =
  "inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60";

export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  ({ className, children, type = "button", ...rest }, ref) => {
    const composedClassName = className ? `${baseClasses} ${className}` : baseClasses;

    return (
      <button ref={ref} className={composedClassName} type={type} {...rest}>
        {children}
      </button>
    );
  }
);

PrimaryButton.displayName = "PrimaryButton";

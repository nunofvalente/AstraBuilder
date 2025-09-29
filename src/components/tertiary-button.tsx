"use client";

import { forwardRef } from "react";

type TertiaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

const baseClasses =
  "inline-flex items-center justify-center rounded-md border border-[color:var(--border)] bg-transparent px-6 py-3 text-sm font-medium transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] text-white hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-muted)]";

export const TertiaryButton = forwardRef<HTMLButtonElement, TertiaryButtonProps>(
  ({ className, children, type = "button", ...rest }, ref) => {
    const composedClassName = className ? `${baseClasses} ${className}` : baseClasses;

    return (
      <button ref={ref} className={composedClassName} type={type} {...rest}>
        {children}
      </button>
    );
  }
);

TertiaryButton.displayName = "TertiaryButton";

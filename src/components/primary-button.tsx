"use client";

import { forwardRef, type MouseEvent, useCallback } from "react";
import { useRouter } from "next/navigation";

type PrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
};

const baseClasses =
  "inline-flex items-center justify-center rounded-md bg-[color:var(--accent)] px-6 py-3 font-sans text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60";

export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  ({ className, children, type = "button", href, onClick, ...rest }, ref) => {
    const router = useRouter();
    const composedClassName = className ? `${baseClasses} ${className}` : baseClasses;

    const handleClick = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        if (href) {
          router.push(href);
        }
      },
      [href, onClick, router]
    );

    return (
      <button
        ref={ref}
        className={composedClassName}
        type={type}
        onClick={href ? handleClick : onClick}
        {...rest}
      >
        {children}
      </button>
    );
  }
);

PrimaryButton.displayName = "PrimaryButton";


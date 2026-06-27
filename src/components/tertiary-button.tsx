"use client";

import Link from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type Ref } from "react";

type BaseButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
type AnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type TertiaryButtonProps = BaseButtonProps | AnchorProps;

const baseClasses =
  "inline-flex items-center gap-2 justify-center rounded-md border border-[color:var(--border)] bg-transparent px-3 py-1.5 font-sans text-xs font-semibold uppercase tracking-wide transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] text-white hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-muted)]";

export const TertiaryButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, TertiaryButtonProps>(
  (props, ref) => {
    const { children, className, ...rest } = props as TertiaryButtonProps & { className?: string };
    const composedClassName = className ? `${baseClasses} ${className}` : baseClasses;

    if ("href" in rest && typeof rest.href === "string") {
      const { href, ...anchorRest } = rest;
      return (
        <Link ref={ref as Ref<HTMLAnchorElement>} href={href} className={composedClassName} {...anchorRest}>
          {children}
        </Link>
      );
    }

    const { type = "button", ...buttonRest } = rest as BaseButtonProps;
    return (
      <button ref={ref as Ref<HTMLButtonElement>} className={composedClassName} type={type} {...buttonRest}>
        {children}
      </button>
    );
  }
);

TertiaryButton.displayName = "TertiaryButton";

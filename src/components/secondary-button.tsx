"use client";

import Link, { type LinkProps } from "next/link";
import { forwardRef } from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AnchorProps = LinkProps & React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type SecondaryButtonProps = ButtonProps | AnchorProps;

const baseClasses =
  "inline-flex items-center justify-center rounded-md border border-[color:var(--accent)] bg-transparent px-6 py-3 font-sans text-sm font-medium text-[color:var(--accent)] transition focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] hover:bg-[color:var(--accent)]/10";

export const SecondaryButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, SecondaryButtonProps>(
  ({ className, children, ...props }, ref) => {
    const composedClassName = className ? `${baseClasses} ${className}` : baseClasses;

    if ("href" in props && props.href) {
      const { href, replace, scroll, shallow, prefetch, locale, ...anchorProps } = props as AnchorProps;
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          replace={replace}
          scroll={scroll}
          shallow={shallow}
          prefetch={prefetch}
          locale={locale}
          className={composedClassName}
          {...anchorProps}
        >
          {children}
        </Link>
      );
    }

    const buttonProps = props as ButtonProps;
    const { type = "button", ...rest } = buttonProps;

    return (
      <button ref={ref as React.Ref<HTMLButtonElement>} className={composedClassName} type={type} {...rest}>
        {children}
      </button>
    );
  }
);

SecondaryButton.displayName = "SecondaryButton";

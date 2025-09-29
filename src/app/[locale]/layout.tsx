import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { TopBar } from "@/components/top-bar";
import { LangAttribute } from "@/i18n/LangAttribute";
import { SUPPORTED_LOCALES, isLocale } from "@/i18n/config";

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

type LocaleParams = {
  locale: string;
};

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<LocaleParams>;
};

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <>
      <LangAttribute locale={locale} />
      <div className="min-h-screen bg-[color:var(--background)] transition-colors">
        <TopBar locale={locale} />
        <div className="mx-auto max-w-6xl px-4 pb-6">{children}</div>
      </div>
    </>
  );
}

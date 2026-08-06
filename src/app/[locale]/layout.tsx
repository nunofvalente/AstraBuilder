import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { TopBar } from '@/components/top-bar';
import { LangAttribute } from '@/i18n/LangAttribute';
import { SUPPORTED_LOCALES, isLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/get-dictionary';
import { isSimulatorEnabled } from '@/lib/features';

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

  const dictionary = await getDictionary(locale);

  return (
    <>
      <LangAttribute locale={locale} />
      <div className="app-shell flex flex-col overflow-hidden bg-[color:var(--background)] transition-colors">
        <TopBar locale={locale} labels={dictionary.topBar} showPlay={isSimulatorEnabled()} />
        <main className="app-scroll flex flex-1 min-h-0 flex-col overflow-y-auto">{children}</main>
      </div>
    </>
  );
}


import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';
import { buildNoIndexMetadata } from '@/lib/metadata/locale';

import { SettingsClient } from './settings-client';

interface SettingsPageParams {
  locale: string;
}

interface SettingsPageProps {
  params: Promise<SettingsPageParams>;
}

export async function generateMetadata({ params }: SettingsPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return buildNoIndexMetadata(locale, ['settings']);
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const settingsCopy = dictionary.settings;

  return (
    <div className="px-4 py-16 md:py-24">
      <SettingsClient locale={locale as Locale} dictionary={settingsCopy} />
    </div>
  );
}


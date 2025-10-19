import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProfileForm } from '@/components/profile/profile-form';
import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';

interface ProfilePageParams {
  locale: string;
}

interface ProfilePageProps {
  params: Promise<ProfilePageParams>;
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return buildCanonicalMetadata(locale, ['profile']);
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const profileCopy = dictionary.profile;

  return (
    <div className="px-4 py-16 md:py-24">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-lg">
        <div className="space-y-2 text-[color:var(--text-primary)]">
          <h1 className="text-2xl font-semibold">{profileCopy.heading}</h1>
          <p className="text-sm text-[color:var(--text-secondary)]">{profileCopy.description}</p>
        </div>
        <ProfileForm locale={locale as Locale} dictionary={profileCopy} />
      </div>
    </div>
  );
}

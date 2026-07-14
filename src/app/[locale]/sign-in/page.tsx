import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SignInForm } from '@/components/auth/sign-in-form';
import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';
import { buildNoIndexMetadata } from '@/lib/metadata/locale';

interface SignInPageParams {
  locale: string;
}

interface SignInPageProps {
  params: Promise<SignInPageParams>;
}

export async function generateMetadata({ params }: SignInPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return buildNoIndexMetadata(locale, ['sign-in']);
}

export default async function SignInPage({ params }: SignInPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const signInCopy = dictionary.auth.signIn;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-lg">
        <div className="space-y-2 text-center text-[color:var(--text-primary)]">
          <h1 className="text-2xl font-semibold">{signInCopy.title}</h1>
          <p className="text-sm text-[color:var(--text-secondary)]">{signInCopy.description}</p>
        </div>
        <Suspense fallback={<div className="text-sm text-[color:var(--text-secondary)]">Loading...</div>}>
          <SignInForm locale={locale as Locale} dictionary={signInCopy} />
        </Suspense>
      </div>
    </div>
  );
}

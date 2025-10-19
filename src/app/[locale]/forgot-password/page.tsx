import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale, type Locale } from '@/i18n/config';
import { buildCanonicalMetadata } from '@/lib/metadata/locale';

interface ForgotPasswordPageParams {
  locale: string;
}

interface ForgotPasswordPageProps {
  params: Promise<ForgotPasswordPageParams>;
}

export async function generateMetadata({ params }: ForgotPasswordPageProps): Promise<Metadata> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return buildCanonicalMetadata(locale, ['forgot-password']);
}

export default async function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const copy = dictionary.auth.forgotPassword;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-lg">
        <div className="space-y-2 text-center text-[color:var(--text-primary)]">
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-[color:var(--text-secondary)]">{copy.description}</p>
        </div>
        <ForgotPasswordForm locale={locale as Locale} dictionary={copy} />
      </div>
    </div>
  );
}

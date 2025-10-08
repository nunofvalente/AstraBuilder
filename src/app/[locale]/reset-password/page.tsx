import { notFound } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getDictionary } from "@/i18n/get-dictionary";
import { isLocale, type Locale } from "@/i18n/config";

interface ResetPasswordPageParams {
  locale: string;
}

interface ResetPasswordPageProps {
  params: Promise<ResetPasswordPageParams>;
}

export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const copy = dictionary.auth.resetPassword;
  const strengthCopy = dictionary.auth.passwordStrength;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-lg">
        <div className="space-y-2 text-center text-[color:var(--text-primary)]">
          <h1 className="text-2xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-[color:var(--text-secondary)]">{copy.description}</p>
        </div>
        <ResetPasswordForm
          locale={locale as Locale}
          dictionary={copy}
          passwordStrengthDictionary={strengthCopy}
        />
      </div>
    </div>
  );
}

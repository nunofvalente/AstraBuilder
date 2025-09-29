import { notFound } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { getDictionary } from "@/i18n/get-dictionary";
import { isLocale, type Locale } from "@/i18n/config";

interface SignUpPageParams {
  locale: string;
}

interface SignUpPageProps {
  params: Promise<SignUpPageParams>;
}

export default async function SignUpPage({ params }: SignUpPageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const signUpCopy = dictionary.auth.signUp;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-lg">
        <div className="space-y-2 text-center text-[color:var(--text-primary)]">
          <h1 className="text-2xl font-semibold">{signUpCopy.title}</h1>
          <p className="text-sm text-[color:var(--text-secondary)]">{signUpCopy.description}</p>
        </div>
        <SignUpForm locale={locale as Locale} dictionary={signUpCopy} />
      </div>
    </div>
  );
}

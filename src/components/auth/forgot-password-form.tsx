"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { PrimaryButton } from "@/components/primary-button";
import type { ForgotPasswordDictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { supabase } from "@/lib/supabase/supabaseClient";

const LOCALE_STORAGE_KEY = "astrabuilder-auth-locale";
const REDIRECT_STORAGE_KEY = "astrabuilder-auth-redirect";

type ForgotPasswordFormProps = {
  locale: Locale;
  dictionary: ForgotPasswordDictionary;
};

export function ForgotPasswordForm({ locale, dictionary }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage(null);
    setErrorMessage(null);

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    const redirectTo = typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/auth/callback?redirect=/${locale}/reset-password`;

    if (redirectTo) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      window.localStorage.setItem(REDIRECT_STORAGE_KEY, `/${locale}/reset-password`);
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) {
        throw error;
      }

      setMessage(dictionary.messages.success);
      setEmail("");
    } catch (error) {
      console.error("Failed to send reset password email", error);
      const message = error instanceof Error && error.message
        ? error.message
        : dictionary.messages.genericError;
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="reset-email" className="block text-sm font-medium text-[color:var(--text-primary)]">
            {dictionary.form.emailLabel}
          </label>
          <input
            id="reset-email"
            name="reset-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] shadow-sm focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
            disabled={isSubmitting}
          />
        </div>

        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}

        <PrimaryButton type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? `${dictionary.form.submit}...` : dictionary.form.submit}
        </PrimaryButton>
      </form>

      <p className="text-center text-sm text-[color:var(--text-secondary)]">
        <Link href={`/${locale}/sign-in`} className="font-medium text-[color:var(--accent)] hover:underline">
          {dictionary.footer.backToSignIn}
        </Link>
      </p>
    </div>
  );
}

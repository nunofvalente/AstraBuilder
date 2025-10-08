"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PrimaryButton } from "@/components/primary-button";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import type { PasswordStrengthDictionary, ResetPasswordDictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { supabase } from "@/lib/supabase/supabaseClient";

const LOCALE_STORAGE_KEY = "astrabuilder-auth-locale";
const REDIRECT_STORAGE_KEY = "astrabuilder-auth-redirect";
const RESET_FLAG_STORAGE_KEY = "astrabuilder-auth-reset";

type ResetPasswordFormProps = {
  locale: Locale;
  dictionary: ResetPasswordDictionary;
  passwordStrengthDictionary: PasswordStrengthDictionary;
};

export function ResetPasswordForm({ locale, dictionary, passwordStrengthDictionary }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isRecoverySession, setIsRecoverySession] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) {
          return;
        }

        const hasRecoveryFlag = typeof window !== "undefined"
          ? window.localStorage.getItem(RESET_FLAG_STORAGE_KEY) === "1"
          : false;

        if (!session || !hasRecoveryFlag) {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(RESET_FLAG_STORAGE_KEY);
          }
          void supabase.auth.signOut();
          router.replace(`/${locale}/sign-in?reset=expired`);
          return;
        }

        setIsRecoverySession(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(RESET_FLAG_STORAGE_KEY);
        }
        void supabase.auth.signOut();
        router.replace(`/${locale}/sign-in?reset=expired`);
      })
      .finally(() => {
        if (isMounted) {
          setIsChecking(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [locale, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage(dictionary.messages.mismatch);
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setPassword("");
      setConfirmPassword("");

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LOCALE_STORAGE_KEY);
        window.localStorage.removeItem(REDIRECT_STORAGE_KEY);
      }

      await supabase.auth.signOut();
      router.replace(`/${locale}/sign-in?reset=success`);
    } catch (error) {
      console.error("Failed to update password", error);
      const message = error instanceof Error && error.message
        ? error.message
        : dictionary.messages.genericError;
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isChecking) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="text-sm text-[color:var(--text-secondary)]">Checking reset link…</div>
      </div>
    );
  }

  if (!isRecoverySession) {
    return null;
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="new-password" className="block text-sm font-medium text-[color:var(--text-primary)]">
            {dictionary.form.passwordLabel}
          </label>
          <input
            id="new-password"
            name="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] shadow-sm focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
            disabled={isSubmitting}
          />
          <PasswordStrengthMeter password={password} dictionary={passwordStrengthDictionary} />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm-new-password" className="block text-sm font-medium text-[color:var(--text-primary)]">
            {dictionary.form.confirmPasswordLabel}
          </label>
          <input
            id="confirm-new-password"
            name="confirm-new-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] shadow-sm focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
            disabled={isSubmitting}
          />
        </div>

        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : null}

        <PrimaryButton type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? `${dictionary.form.submit}...` : dictionary.form.submit}
        </PrimaryButton>
      </form>

      <p className="text-center text-sm text-[color:var(--text-secondary)]">
        <Link href={`/${locale}`} className="font-medium text-[color:var(--accent)] hover:underline">
          {dictionary.footer.backToHome}
        </Link>
      </p>
    </div>
  );
}

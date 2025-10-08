"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { PrimaryButton } from "@/components/primary-button";
import type { SignInDictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { supabase } from "@/lib/supabase/supabaseClient";
import { ensureProfileForUser } from "@/lib/supabase/profiles";

const LOCALE_STORAGE_KEY = "astrabuilder-auth-locale";
const REDIRECT_STORAGE_KEY = "astrabuilder-auth-redirect";
const INVALID_CREDENTIALS_MESSAGE = "invalid login credentials";

export function SignInForm({ locale, dictionary }: { locale: Locale; dictionary: SignInDictionary }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const resetStatus = searchParams.get("reset");
  const resetSuccessMessage = resetStatus === "success" ? dictionary.messages.passwordResetSuccess : null;
  const resetExpiredMessage = resetStatus === "expired" ? dictionary.messages.passwordResetExpired : null;
  const accountStatus = searchParams.get("account");
  const accountDeletedMessage = accountStatus === "deleted" ? dictionary.messages.accountDeleted : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const message = error.message?.toLowerCase() ?? "";
        if (message.includes(INVALID_CREDENTIALS_MESSAGE)) {
          setErrorMessage(dictionary.messages.invalidCredentials);
        } else {
          setErrorMessage(error.message || dictionary.messages.genericError);
        }
        return;
      }

      if (data.user) {
        try {
          await ensureProfileForUser(data.user);
        } catch (profileError) {
          console.error("Failed to ensure profile for user", profileError);
        }
      }

      setEmail("");
      setPassword("");

      if (typeof window !== "undefined") {
        const storedRedirect = window.localStorage.getItem(REDIRECT_STORAGE_KEY);
        const fallbackPath = `/${locale}`;
        const nextPath = storedRedirect && storedRedirect.startsWith("/") ? storedRedirect : fallbackPath;
        window.localStorage.removeItem(REDIRECT_STORAGE_KEY);
        router.replace(nextPath);
      } else {
        router.replace(`/${locale}`);
      }
    } catch (error) {
      console.error("Failed to sign in", error);
      setErrorMessage(dictionary.messages.genericError);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setErrorMessage(null);

    if (isGoogleLoading) {
      return;
    }

    setIsGoogleLoading(true);

    const redirectTo = typeof window === "undefined"
      ? undefined
      : `${window.location.origin}/auth/callback`;

    if (redirectTo) {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        ...(redirectTo ? { options: { redirectTo } } : {}),
      });

      if (error) {
        setErrorMessage(error.message || dictionary.messages.genericError);
        if (redirectTo) {
          window.localStorage.removeItem(LOCALE_STORAGE_KEY);
        }
        setIsGoogleLoading(false);
      }
    } catch (error) {
      console.error("Google sign-in failed", error);
      setErrorMessage(dictionary.messages.genericError);
      if (redirectTo) {
        window.localStorage.removeItem(LOCALE_STORAGE_KEY);
      }
      setIsGoogleLoading(false);
    }
  }

  const inputClasses =
    "w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] shadow-sm focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60 disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-[color:var(--text-primary)]">
            {dictionary.form.emailLabel}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className={inputClasses}
            disabled={isSubmitting}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-[color:var(--text-primary)]">
            {dictionary.form.passwordLabel}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className={inputClasses}
            disabled={isSubmitting}
          />
          <div className="flex justify-end text-xs">
            <Link href={`/${locale}/forgot-password`} className="text-[color:var(--accent)] hover:underline">
              {dictionary.forgotPasswordLink}
            </Link>
          </div>
        </div>

        {resetSuccessMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {resetSuccessMessage}
          </div>
        ) : null}

        {resetExpiredMessage ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {resetExpiredMessage}
          </div>
        ) : null}

        {accountDeletedMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {accountDeletedMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : null}

        <PrimaryButton
          type="submit"
          className="w-full disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
        >
          {isSubmitting ? `${dictionary.form.submit}...` : dictionary.form.submit}
        </PrimaryButton>
      </form>

      <div className="flex items-center gap-3 text-xs text-[color:var(--text-secondary)]">
        <span className="h-px flex-1 bg-[color:var(--border)]" />
        <span>{dictionary.dividerLabel}</span>
        <span className="h-px flex-1 bg-[color:var(--border)]" />
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isGoogleLoading}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="google-button-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.204c0-.638-.057-1.252-.164-1.843H9v3.487h4.844a4.137 4.137 0 0 1-1.798 2.718v2.258h2.907c1.702-1.567 2.687-3.876 2.687-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.957-2.176l-2.907-2.258c-.806.54-1.837.86-3.05.86-2.347 0-4.332-1.588-5.044-3.723H1.956v2.34A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.956 10.703A5.408 5.408 0 0 1 3.664 9c0-.59.102-1.164.292-1.703V4.957H1.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.043l2.137-2.34z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.505.454 3.438 1.346l2.581-2.58C13.462.891 11.424 0 9 0 5.485 0 2.462 1.958.956 4.957l2.137 2.34C4.668 5.158 6.653 3.58 9 3.58z" />
          </svg>
        </span>
        <span>{isGoogleLoading ? `${dictionary.google.button}...` : dictionary.google.button}</span>
      </button>

      <p className="text-center text-sm text-[color:var(--text-secondary)]">
        {dictionary.footer.noAccount}{" "}
        <Link href={`/${locale}/sign-up`} className="font-medium text-[color:var(--accent)] hover:underline">
          {dictionary.footer.signUpLink}
        </Link>
      </p>
    </div>
  );
}

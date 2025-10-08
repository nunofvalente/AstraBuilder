"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/supabaseClient";
import { ensureProfileForUser } from "@/lib/supabase/profiles";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

const LOCALE_STORAGE_KEY = "astrabuilder-auth-locale";
const REDIRECT_STORAGE_KEY = "astrabuilder-auth-redirect";
const RESET_FLAG_STORAGE_KEY = "astrabuilder-auth-reset";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState("Completing sign-in...");

  useEffect(() => {
    async function completeSignIn() {
      if (typeof window === "undefined") {
        return;
      }

      const currentUrl = new URL(window.location.href);
      const code = currentUrl.searchParams.get("code");
      const errorDescription =
        currentUrl.searchParams.get("error_description") ?? currentUrl.searchParams.get("error");

      if (errorDescription) {
        setStatusMessage(decodeURIComponent(errorDescription));
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatusMessage(error.message ?? "Unable to complete sign-in.");
          return;
        }
      }

      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("Failed to fetch user after sign-in", userError);
      } else if (userResult.user) {
        try {
          await ensureProfileForUser(userResult.user);
        } catch (profileError) {
          console.error("Failed to ensure profile for user", profileError);
        }
      }

      const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      const storedRedirect = window.localStorage.getItem(REDIRECT_STORAGE_KEY);
      const queryRedirect = currentUrl.searchParams.get('redirect');
      const nextLocale = storedLocale && isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;
      window.localStorage.removeItem(LOCALE_STORAGE_KEY);
      window.localStorage.removeItem(REDIRECT_STORAGE_KEY);

      const fallbackPath = `/${nextLocale}`;
      const nextPath = queryRedirect && queryRedirect.startsWith('/')
        ? queryRedirect
        : storedRedirect && storedRedirect.startsWith('/')
          ? storedRedirect
          : fallbackPath;

      if (nextPath.includes('/reset-password')) {
        window.localStorage.setItem(RESET_FLAG_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(RESET_FLAG_STORAGE_KEY);
      }

      router.replace(nextPath);
    }

    void completeSignIn();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4">
      <div className="space-y-3 text-center text-[color:var(--text-primary)]">
        <p className="text-lg font-semibold">{statusMessage}</p>
        <p className="text-sm text-[color:var(--text-secondary)]">You will be redirected shortly.</p>
      </div>
    </div>
  );
}

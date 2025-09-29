"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/supabaseClient";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

const LOCALE_STORAGE_KEY = "astrabuilder-auth-locale";

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

      const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      const nextLocale = storedLocale && isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;
      window.localStorage.removeItem(LOCALE_STORAGE_KEY);

      router.replace(`/${nextLocale}`);
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

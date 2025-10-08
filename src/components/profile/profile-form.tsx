"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { PrimaryButton } from "@/components/primary-button";
import type { ProfileDictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { supabase } from "@/lib/supabase/supabaseClient";
import { ensureProfileForUser, USERNAME_MAX_LENGTH } from "@/lib/supabase/profiles";

const BIO_MAX_LENGTH = 280;

const LOCALE_STORAGE_KEY = "astrabuilder-auth-locale";
const REDIRECT_STORAGE_KEY = "astrabuilder-auth-redirect";
const RESET_FLAG_STORAGE_KEY = "astrabuilder-auth-reset";

type ProfileFormProps = {
  locale: Locale;
  dictionary: ProfileDictionary;
};

type MessageState = {
  type: "success" | "error";
  text: string;
};

function sanitizeUsernameInput(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, USERNAME_MAX_LENGTH);
}

function sanitizeBioInput(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, BIO_MAX_LENGTH);
}

function sanitizeSocialLink(value: string): string {
  return value.trim();
}

export function ProfileForm({ locale, dictionary }: ProfileFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [xLink, setXLink] = useState("");
  const [youtubeLink, setYoutubeLink] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<MessageState | null>(null);

  const deleteConfirmationKeyword = dictionary.deleteAccount.confirmationKeyword.trim().toLowerCase();
  const normalizedDeleteConfirmation = deleteConfirmation.trim().toLowerCase();
  const isDeleteConfirmationValid = normalizedDeleteConfirmation === deleteConfirmationKeyword;

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      setIsLoading(true);

      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult.user) {
        router.replace(`/${locale}/sign-in`);
        return;
      }

      try {
        const profile = await ensureProfileForUser(userResult.user);
        if (!isMounted) {
          return;
        }
        setUsername(profile?.username ? sanitizeUsernameInput(profile.username) : "");
        setBio(profile?.bio ? sanitizeBioInput(profile.bio) : "");
        setXLink(profile?.x_link ? sanitizeSocialLink(profile.x_link) : "");
        setYoutubeLink(profile?.youtube_link ? sanitizeSocialLink(profile.youtube_link) : "");
      } catch (profileError) {
        if (!isMounted) {
          return;
        }
        console.error("Failed to ensure profile for user", profileError);
        setMessage({ type: "error", text: dictionary.messages.error });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [dictionary.messages.error, locale, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanedUsername = sanitizeUsernameInput(username);
    if (!cleanedUsername) {
      setMessage({ type: "error", text: dictionary.messages.usernameRequired });
      return;
    }

    const cleanedBio = bio.trim() ? sanitizeBioInput(bio) : null;
    const cleanedX = xLink.trim() ? sanitizeSocialLink(xLink) : null;
    const cleanedYt = youtubeLink.trim() ? sanitizeSocialLink(youtubeLink) : null;

    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      router.replace(`/${locale}/sign-in`);
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      await ensureProfileForUser(userResult.user);
      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userResult.user.id,
            username: cleanedUsername,
            bio: cleanedBio,
            x_link: cleanedX,
            youtube_link: cleanedYt,
          },
          { onConflict: "id" }
        )
        .select("username, bio, x_link, youtube_link")
        .single();

      if (error) {
        throw error;
      }

      setUsername(data?.username ?? cleanedUsername);
      setBio(data?.bio ?? cleanedBio ?? "");
      setXLink(data?.x_link ?? cleanedX ?? "");
      setYoutubeLink(data?.youtube_link ?? cleanedYt ?? "");
      setMessage({ type: "success", text: dictionary.messages.success });
    } catch (updateError) {
      console.error("Failed to update profile", updateError);
      setMessage({ type: "error", text: dictionary.messages.error });
    } finally {
      setIsSaving(false);
    }
  }

  function handleStartDelete() {
    setIsDeleteConfirmVisible(true);
    setDeleteConfirmation("");
    setDeleteMessage(null);
  }

  function handleCancelDelete() {
    if (isDeleting) {
      return;
    }
    setIsDeleteConfirmVisible(false);
    setDeleteConfirmation("");
    setDeleteMessage(null);
  }

  async function handleConfirmDelete() {
    if (isDeleting) {
      return;
    }

    if (normalizedDeleteConfirmation !== deleteConfirmationKeyword) {
      setDeleteMessage({ type: "error", text: dictionary.deleteAccount.keywordMismatch });
      return;
    }

    setIsDeleting(true);
    setDeleteMessage(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.access_token) {
        throw sessionError ?? new Error("Missing session");
      }

      const accessToken = sessionData.session.access_token;
      const response = await fetch("/api/profile/delete", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.message ?? dictionary.deleteAccount.error;
        throw new Error(message);
      }

      setIsDeleteConfirmVisible(false);
      setDeleteConfirmation("");
      setDeleteMessage({ type: "success", text: dictionary.deleteAccount.success });

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LOCALE_STORAGE_KEY);
        window.localStorage.removeItem(REDIRECT_STORAGE_KEY);
        window.localStorage.removeItem(RESET_FLAG_STORAGE_KEY);
      }

      await supabase.auth.signOut();
      router.replace(`/${locale}/sign-in?account=deleted`);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : dictionary.deleteAccount.error;
      setDeleteMessage({ type: "error", text: message });
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)]/60 px-4 py-6 text-sm text-[color:var(--text-secondary)]">
        {dictionary.messages.loading}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
        <label htmlFor="profile-username" className="block text-sm font-medium text-[color:var(--text-primary)]">
          {dictionary.fields.username}
        </label>
        <input
          id="profile-username"
          name="profile-username"
          type="text"
          value={username}
          onChange={(event) => { setUsername(event.target.value); setMessage(null); }}
          maxLength={USERNAME_MAX_LENGTH}
          className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] shadow-sm focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
          autoComplete="nickname"
          required
        />
        <p className="text-xs text-[color:var(--text-secondary)]">{dictionary.fields.usernameHint}</p>
        </div>

        <div className="space-y-2">
        <label htmlFor="profile-bio" className="block text-sm font-medium text-[color:var(--text-primary)]">
          {dictionary.fields.bio}
        </label>
        <textarea
          id="profile-bio"
          name="profile-bio"
          value={bio}
          onChange={(event) => { setBio(event.target.value); setMessage(null); }}
          rows={4}
          maxLength={BIO_MAX_LENGTH}
          className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] shadow-sm focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
        />
        <p className="text-xs text-[color:var(--text-secondary)]">{dictionary.fields.bioHint}</p>
        </div>

        <div className="space-y-2">
        <label htmlFor="profile-x" className="block text-sm font-medium text-[color:var(--text-primary)]">
          {dictionary.fields.xLink}
        </label>
        <input
          id="profile-x"
          name="profile-x"
          type="url"
          value={xLink}
          onChange={(event) => { setXLink(event.target.value); setMessage(null); }}
          placeholder={dictionary.fields.xPlaceholder}
          className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] shadow-sm focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
        />
        </div>

        <div className="space-y-2">
        <label htmlFor="profile-youtube" className="block text-sm font-medium text-[color:var(--text-primary)]">
          {dictionary.fields.youtubeLink}
        </label>
        <input
          id="profile-youtube"
          name="profile-youtube"
          type="url"
          value={youtubeLink}
          onChange={(event) => { setYoutubeLink(event.target.value); setMessage(null); }}
          placeholder={dictionary.fields.youtubePlaceholder}
          className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] shadow-sm focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60"
        />
        </div>

        {message ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-600"
          }`}
        >
          {message.text}
        </div>
        ) : null}

        <PrimaryButton
          type="submit"
          className="w-full disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSaving}
        >
          {isSaving ? dictionary.actions.saving : dictionary.actions.save}
        </PrimaryButton>
      </form>

      <div className="border-t border-[color:var(--border)] pt-6">
        <section aria-labelledby="delete-account-heading" className="space-y-4 rounded-md border border-[#7a2e1b]/70 bg-[#7a2e1b]/10 p-5">
          <div className="space-y-1">
            <h2 id="delete-account-heading" className="text-base font-semibold text-[#f0b28a]">
              {dictionary.deleteAccount.title}
            </h2>
            <p className="text-sm text-[#f6d1ba]">{dictionary.deleteAccount.description}</p>
          </div>

          {deleteMessage ? (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                deleteMessage.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-[#7a2e1b]/40 bg-[#7a2e1b]/15 text-[#f0b28a]"
              }`}
            >
              {deleteMessage.text}
            </div>
          ) : null}

          {isDeleteConfirmVisible ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="delete-confirmation" className="block text-xs font-medium text-[#f0b28a]">
                  {dictionary.deleteAccount.confirmationLabel}
                </label>
                <p className="text-xs text-[#f6d1ba]">{dictionary.deleteAccount.confirmationDescription}</p>
                <input
                  id="delete-confirmation"
                  name="delete-confirmation"
                  type="text"
                  value={deleteConfirmation}
                  onChange={(event) => {
                    setDeleteConfirmation(event.target.value);
                    setDeleteMessage(null);
                  }}
                  placeholder={dictionary.deleteAccount.confirmationPlaceholder}
                  className="w-full rounded-md border border-[#7a2e1b] bg-transparent px-3 py-2 text-sm text-[#f5d67b] placeholder:text-[#f5d67b]/70 shadow-sm focus:outline-none focus-visible:ring focus-visible:ring-[#963a24]/60 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isDeleting}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="inline-flex items-center justify-center rounded-md bg-[#7a2e1b] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#963a24] focus:outline-none focus-visible:ring focus-visible:ring-[#963a24]/60 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={!isDeleteConfirmationValid || isDeleting}
                >
                  {isDeleting ? `${dictionary.deleteAccount.confirmButton}...` : dictionary.deleteAccount.confirmButton}
                </button>
                <button
                  type="button"
                  onClick={handleCancelDelete}
                  className="inline-flex items-center justify-center rounded-md border border-[color:var(--border)] bg-transparent px-4 py-2 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[#963a24]/40 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isDeleting}
                >
                  {dictionary.deleteAccount.cancelButton}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartDelete}
              className="inline-flex items-center justify-center rounded-md bg-[#7a2e1b] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#963a24] focus:outline-none focus-visible:ring focus-visible:ring-[#963a24]/60"
            >
              {dictionary.deleteAccount.trigger}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}




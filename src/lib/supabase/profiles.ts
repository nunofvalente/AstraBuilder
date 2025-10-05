import type { User } from "@supabase/supabase-js";

import { supabase } from "./supabaseClient";

type Nullable<T> = T | null;

export type Profile = {
  id: string;
  username: Nullable<string>;
  bio: Nullable<string>;
  x_link: Nullable<string>;
  youtube_link: Nullable<string>;
  created_at: string;
};

export const USERNAME_MAX_LENGTH = 30;

function sanitizeCandidate(candidate?: string | null): string | null {
  if (!candidate) {
    return null;
  }

  const normalized = String(candidate).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, USERNAME_MAX_LENGTH);
}

function uniqueCandidates(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function deriveDefaultUsername(user: User): string {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  const provider = typeof appMetadata.provider === "string" ? (appMetadata.provider as string) : null;
  const emailPrefix = sanitizeCandidate(user.email ? user.email.split("@")[0] : null);

  const googleCandidates = uniqueCandidates([
    sanitizeCandidate(metadata.full_name as string | undefined),
    sanitizeCandidate(metadata.name as string | undefined),
    sanitizeCandidate(
      metadata.given_name || metadata.family_name
        ? `${metadata.given_name ?? ""} ${metadata.family_name ?? ""}`.trim()
        : null
    ),
    sanitizeCandidate(metadata.preferred_username as string | undefined),
    emailPrefix,
  ]);

  const emailPasswordCandidates = uniqueCandidates([
    emailPrefix,
    sanitizeCandidate(metadata.username as string | undefined),
    sanitizeCandidate(metadata.preferred_username as string | undefined),
    sanitizeCandidate(metadata.full_name as string | undefined),
  ]);

  const fallbackCandidates = uniqueCandidates([
    sanitizeCandidate(metadata.username as string | undefined),
    sanitizeCandidate(metadata.preferred_username as string | undefined),
    sanitizeCandidate(metadata.full_name as string | undefined),
    sanitizeCandidate(metadata.name as string | undefined),
    emailPrefix,
  ]);

  const orderedCandidates = provider === "google"
    ? googleCandidates
    : provider === "email"
      ? emailPasswordCandidates
      : uniqueCandidates([...emailPasswordCandidates, ...fallbackCandidates]);

  const candidate = orderedCandidates.find((value) => value && value.length > 0);
  if (candidate) {
    return candidate;
  }

  const suffix = user.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `Player-${suffix}`;
}

export async function getProfileById(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, bio, x_link, youtube_link, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function ensureProfileForUser(user: User): Promise<Profile | null> {
  const existingProfile = await getProfileById(user.id);

  if (existingProfile) {
    return existingProfile;
  }

  const username = deriveDefaultUsername(user);

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, username }, { onConflict: "id" })
    .select("id, username, bio, x_link, youtube_link, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data ?? null;
}

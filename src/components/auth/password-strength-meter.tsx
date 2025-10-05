"use client";

import type { PasswordStrengthDictionary } from "@/i18n/get-dictionary";

const MAX_SCORE = 4;

function calculateScore(password: string): number {
  if (!password) {
    return 0;
  }

  let score = 0;

  if (password.length >= 8) {
    score += 1;
  }
  if (password.length >= 12) {
    score += 1;
  }
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score += 1;
  }
  if (/\d/.test(password)) {
    score += 1;
  }
  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  }

  return Math.min(score, MAX_SCORE);
}

function getStrength(score: number, dictionary: PasswordStrengthDictionary) {
  switch (score) {
    case 0:
      return { label: dictionary.values.tooWeak, color: "bg-red-500" };
    case 1:
      return { label: dictionary.values.weak, color: "bg-orange-500" };
    case 2:
      return { label: dictionary.values.medium, color: "bg-amber-500" };
    case 3:
      return { label: dictionary.values.strong, color: "bg-emerald-500" };
    case 4:
    default:
      return { label: dictionary.values.veryStrong, color: "bg-emerald-600" };
  }
}

export function PasswordStrengthMeter({
  password,
  dictionary,
}: {
  password: string;
  dictionary: PasswordStrengthDictionary;
}) {
  const score = calculateScore(password);
  const clampedScore = Math.min(score, MAX_SCORE);
  const strength = getStrength(clampedScore, dictionary);
  const widthPercentage = password
    ? ((clampedScore + 1) / (MAX_SCORE + 1)) * 100
    : 0;

  return (
    <div className="space-y-1" aria-live="polite">
      <div className="h-2 w-full rounded-full bg-[color:var(--border)]">
        <div
          className={`h-full rounded-full transition-all duration-200 ${strength.color}`}
          style={{ width: `${widthPercentage}%` }}
        />
      </div>
      <p className="text-xs font-medium text-[color:var(--text-secondary)]">
        {dictionary.label}: <span className="text-[color:var(--text-primary)]">{strength.label}</span>
      </p>
    </div>
  );
}

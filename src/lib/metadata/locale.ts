import type { Metadata } from 'next';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/i18n/config';

function normalizeSegment(segment: string | number): string {
  const value = String(segment).trim();
  if (value.length === 0) {
    return '';
  }

  const trimmed = value.replace(/^\/+|\/+$/g, '');
  if (trimmed.length === 0) {
    return '';
  }

  return encodeURIComponent(trimmed);
}

export function buildLocalePath(locale: Locale, ...segments: Array<string | number>): string {
  const normalizedSegments = [locale, ...segments]
    .map((segment) => normalizeSegment(segment))
    .filter((segment) => segment.length > 0);

  if (normalizedSegments.length === 0) {
    return `/${normalizeSegment(locale)}`;
  }

  return `/${normalizedSegments.join('/')}`;
}

export function buildLanguageAlternates(segments: Array<string | number> = []): Record<string, string> {
  const alternates = SUPPORTED_LOCALES.map((locale) => [locale, buildLocalePath(locale, ...segments)] as const);
  return {
    ...Object.fromEntries(alternates),
    'x-default': buildLocalePath(DEFAULT_LOCALE, ...segments),
  };
}

export function buildCanonicalMetadata(locale: Locale, segments: Array<string | number> = []): Metadata {
  return {
    alternates: {
      canonical: buildLocalePath(locale, ...segments),
      languages: buildLanguageAlternates(segments),
    },
  };
}

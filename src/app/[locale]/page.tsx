import { notFound } from "next/navigation";

import { getDictionary } from "@/i18n/get-dictionary";
import { isLocale } from "@/i18n/config";
import { getPublicAssetUrl } from "@/lib/storage/public-asset-url";

type LocaleParams = {
  locale: string;
};

type LocalePageProps = {
  params: Promise<LocaleParams>;
};

export default async function HomePage({ params }: LocalePageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const { home } = dictionary;
  const bannerImageUrl = getPublicAssetUrl("images", "banner-cropped.png");
  const bannerStyle = bannerImageUrl
    ? {
        backgroundImage: `linear-gradient(0deg, var(--banner-overlay), var(--banner-overlay)), url("${bannerImageUrl}")`,
      }
    : undefined;

  return (
    <main className="flex w-full flex-col items-stretch gap-12 pb-12 text-[color:var(--text-primary)]">
      <section
        className="banner-section relative left-1/2 w-screen max-w-none -translate-x-1/2 px-6 py-14 md:py-20 flex items-center"
        style={bannerStyle}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 text-center">
          <h1 className="banner-text-gradient text-3xl font-semibold tracking-tight">
            {home.title}
          </h1>
          <p className="banner-text-gradient text-4xl font-bold leading-tight sm:text-5xl">
            {home.subtitle}
          </p>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4">
        <section className="grid w-full gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">{home.sections.popular.title}</h2>
              <div className="mt-2 h-px w-full bg-[color:var(--border)]" />
            </div>
            <div className="flex h-32 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-6 text-center text-sm text-[color:var(--text-secondary)]">
              {home.sections.popular.placeholder}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">{home.sections.trending.title}</h2>
              <div className="mt-2 h-px w-full bg-[color:var(--border)]" />
            </div>
            <div className="flex h-32 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-6 text-center text-sm text-[color:var(--text-secondary)]">
              {home.sections.trending.placeholder}
            </div>
          </div>
        </section>

        <section className="flex w-full flex-col items-center gap-3 pb-4 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="w-full rounded-md border border-[color:var(--border)] px-6 py-3 text-sm font-medium text-[color:var(--text-primary)] transition hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)] sm:w-auto"
          >
            {home.actions.browse}
          </button>
          <button
            type="button"
            className="w-full rounded-md bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-[color:var(--text-on-accent)] transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60 sm:w-auto"
          >
            {home.actions.create}
          </button>
        </section>
      </div>
    </main>
  );
}

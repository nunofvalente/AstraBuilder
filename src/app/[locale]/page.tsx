import { notFound } from "next/navigation";

import { getDictionary } from "@/i18n/get-dictionary";
import { isLocale } from "@/i18n/config";

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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col items-center gap-12 px-4 py-12 text-[color:var(--text-primary)]">
      <section className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{home.title}</h1>
        <p className="max-w-2xl text-lg text-[color:var(--text-secondary)]">{home.subtitle}</p>
      </section>

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
          className="w-full rounded-md bg-[color:var(--accent)] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring focus-visible:ring-[color:var(--accent)]/60 sm:w-auto"
        >
          {home.actions.create}
        </button>
      </section>
    </main>
  );
}
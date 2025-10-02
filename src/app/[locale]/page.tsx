import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n/get-dictionary';
import { isLocale } from '@/i18n/config';
import { PrimaryButton } from '@/components/primary-button';
import { TertiaryButton } from '@/components/tertiary-button';
import { getPublicAssetUrl } from '@/lib/storage/public-asset-url';

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
  const bannerImageUrl = getPublicAssetUrl('images', 'banner-cropped.png');
  const bannerStyle = bannerImageUrl
    ? {
        backgroundImage: `linear-gradient(0deg, var(--banner-overlay), var(--banner-overlay)), url('${bannerImageUrl}')`,
      }
    : undefined;

  return (
    <main className="flex w-full flex-col items-center gap-12 pb-12 text-[color:var(--text-primary)]">
      <section
        className="banner-section relative left-1/2 flex w-screen max-w-none -translate-x-1/2 items-center px-6 py-14 md:py-20 mt-[-1px]"
        style={bannerStyle}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 text-center">
          <h1 className="banner-text-gradient text-3xl font-semibold tracking-tight">
            {home.title}
          </h1>
          <p className="banner-text-gradient text-4xl font-bold leading-tight sm:text-5xl">
            {home.subtitle}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {/* <TertiaryButton className="w-full sm:w-auto">
              {home.actions.browse}
            </TertiaryButton> */}
            <PrimaryButton
              className="w-full sm:w-auto"
              href={`/${locale}/create`}
            >
              {home.actions.create}
            </PrimaryButton>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4">
        <section className="grid w-full gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">
                {home.sections.popular.title}
              </h2>
              <div className="mt-2 h-px w-full bg-[color:var(--border)]" />
            </div>
            <div className="flex h-32 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-6 text-center text-sm text-[color:var(--text-secondary)]">
              {home.sections.popular.placeholder}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">
                {home.sections.trending.title}
              </h2>
              <div className="mt-2 h-px w-full bg-[color:var(--border)]" />
            </div>
            <div className="flex h-32 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-6 text-center text-sm text-[color:var(--text-secondary)]">
              {home.sections.trending.placeholder}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

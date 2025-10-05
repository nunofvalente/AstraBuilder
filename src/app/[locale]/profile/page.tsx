import { notFound } from "next/navigation";

import { ProfileForm } from "@/components/profile/profile-form";
import { getDictionary } from "@/i18n/get-dictionary";
import { isLocale, type Locale } from "@/i18n/config";

interface ProfilePageParams {
  locale: string;
}

interface ProfilePageProps {
  params: Promise<ProfilePageParams>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = await getDictionary(locale);
  const profileCopy = dictionary.profile;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-8 shadow-lg">
        <div className="space-y-2 text-[color:var(--text-primary)]">
          <h1 className="text-2xl font-semibold">{profileCopy.heading}</h1>
          <p className="text-sm text-[color:var(--text-secondary)]">{profileCopy.description}</p>
        </div>
        <ProfileForm locale={locale as Locale} dictionary={profileCopy} />
      </div>
    </div>
  );
}

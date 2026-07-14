import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isLocale } from '@/i18n/config';
import { isSimulatorEnabled } from '@/lib/features';

import { RoomClient } from './room-client';

type RoomPageProps = { params: Promise<{ locale: string; roomCode: string }> };

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { locale, roomCode } = await params;
  if (!isLocale(locale) || !isSimulatorEnabled() || !/^[A-Z0-9]{6}$/i.test(roomCode)) notFound();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <RoomClient locale={locale} roomCode={roomCode.toUpperCase()} />
    </div>
  );
}

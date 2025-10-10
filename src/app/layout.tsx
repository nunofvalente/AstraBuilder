import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';
import { DEFAULT_LOCALE } from '@/i18n/config';
import { ThemeProvider } from '@/theme/theme-provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const metadataTitle = 'AstraBuilder';
const metadataDescription =
  "Build, share, and discover Echoes of Astra decks with AstraBuilder's intuitive deck builder and community highlights.";
const appleTouchIcon = '/apple-touch-icon.png';
const favicon32 = '/favicon-32x32.png';
const favicon16 = '/favicon-16x16.png';
const siteManifest = '/site.webmanifest';
const metadataIcon = '/favicon.ico';

export const metadata: Metadata = {
  title: metadataTitle,
  description: metadataDescription,
  openGraph: {
    title: metadataTitle,
    description: metadataDescription,
  },
  icons: {
    icon: [
      { url: metadataIcon },
      { url: favicon32, rel: 'icon', type: 'image/png', sizes: '32x32' },
      { url: favicon16, rel: 'icon', type: 'image/png', sizes: '16x16' },
    ],
    apple: [{ url: appleTouchIcon, rel: 'apple-touch-icon', sizes: '180x180' }],
  },
  twitter: {
    card: 'summary',
    title: metadataTitle,
    description: metadataDescription,
  },
  manifest: siteManifest,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={DEFAULT_LOCALE} data-theme="light">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        data-locale={DEFAULT_LOCALE}
        data-theme="light"
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}



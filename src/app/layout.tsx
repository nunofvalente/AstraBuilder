import type { Metadata } from 'next';
import { Cinzel, Geist_Mono, Sora } from 'next/font/google';

import './globals.css';
import { DEFAULT_LOCALE } from '@/i18n/config';
import { getMetadataBase } from '@/lib/metadata/site';
import { ThemeProvider } from '@/theme/theme-provider';

const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const metadataTitle = 'AstraBuilder';
const metadataDescription =
  "Build, share, and discover Echoes of Astra decks with AstraBuilder's intuitive deck builder and community highlights.";
const appleTouchIcon = '/apple-touch-icon.png';
const faviconSvg = '/favicon.svg';
const favicon96 = '/favicon-96x96.png';
const siteManifest = '/site.webmanifest';
const metadataIcon = '/favicon.ico';

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: metadataTitle,
  description: metadataDescription,
  openGraph: {
    title: metadataTitle,
    description: metadataDescription,
  },
  icons: {
    icon: [
      { url: faviconSvg, rel: 'icon', type: 'image/svg+xml' },
      { url: favicon96, rel: 'icon', type: 'image/png', sizes: '96x96' },
    ],
    shortcut: [{ url: metadataIcon }],
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
        className={`${sora.variable} ${cinzel.variable} ${geistMono.variable} antialiased`}
        data-locale={DEFAULT_LOCALE}
        data-theme="light"
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

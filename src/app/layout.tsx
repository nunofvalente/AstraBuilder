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
const metadataDescription = 'Deckbuilding website for Echoes of Astra';
const metadataIcon = '/favicon.ico';

export const metadata: Metadata = {
  title: metadataTitle,
  description: metadataDescription,
  openGraph: {
    title: metadataTitle,
    description: metadataDescription,
  },
  icons: {
    icon: metadataIcon,
  },
  twitter: {
    card: 'summary',
    title: metadataTitle,
    description: metadataDescription,
  },
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

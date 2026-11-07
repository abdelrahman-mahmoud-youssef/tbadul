import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { getTranslations } from 'next-intl/server';
import { DirectionProvider } from '@/components/ui/direction';
import { ThemeScript } from '@/components/theme/theme-script';
import { directions, routing, type Locale } from '@/i18n/routing';
import '../globals.css';

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

export const generateStaticParams = () => routing.locales.map((locale) => ({ locale }));

export const viewport: Viewport = { viewportFit: 'cover' };

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'metadata' });
  return { title: t('title'), description: t('description'), icons: { icon: '/icon.svg' } };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const locale = (await params).locale as Locale;
  const dir = directions[locale];
  return (
    <html lang={locale} dir={dir} className={plexArabic.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <DirectionProvider dir={dir}>{children}</DirectionProvider>
      </body>
    </html>
  );
}

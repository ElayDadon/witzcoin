import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import SwRegister from '@/components/SwRegister';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-heebo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Witzcoin — ניהול הוצאות בטיולים',
  description: 'מעקב אחרי הוצאות משותפות בטיולים בחו״ל: מי שילם, מי חייב, וכמה נשאר מהתקציב.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Witzcoin',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Witzcoin' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f766e' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1211' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="font-sans antialiased">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}

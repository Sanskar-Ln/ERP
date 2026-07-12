import type { Metadata } from 'next';
// Fonts are bundled from npm (@fontsource) — no external font CDN at
// runtime. Inter carries all UI text and figures; Fraunces is reserved
// for the brand wordmark and page display headings.
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jewellery ERP',
  description: 'Multi-tenant jewellery & gems ERP — web admin',
};

/** Root layout: global styles only; auth shell lives in (app)/layout. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}

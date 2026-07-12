import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jewellery ERP',
  description: 'Multi-tenant jewellery & gems ERP — web admin',
};

/** Root layout: global styles only; auth shell lives in (app)/layout. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}

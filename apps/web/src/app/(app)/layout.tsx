'use client';

/**
 * Authenticated shell: client-side guard (redirect to /login when no JWT)
 * + sidebar navigation. All admin pages render inside this layout.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { session, type SessionUser } from '@/lib/api';

const NAV = [
  ['/dashboard', 'Dashboard'],
  ['/masters', 'Master data'],
  ['/inventory', 'Inventory'],
  ['/tagging', 'Tags & labels'],
  ['/billing', 'Billing'],
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const u = session.user();
    if (!u || !session.token()) {
      router.replace('/login');
      return;
    }
    setUser(u);
  }, [router]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-neutral-200 bg-white p-4">
        <div className="mb-6">
          <div className="font-semibold text-amber-700">Jewellery ERP</div>
          <div className="mt-1 text-xs text-neutral-500">
            {user.name} · {user.role}
          </div>
        </div>
        <nav className="space-y-1">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`block rounded px-2 py-1.5 text-sm ${
                pathname.startsWith(href) ? 'bg-amber-50 font-medium text-amber-800' : 'hover:bg-neutral-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <button
          className="mt-8 text-xs text-neutral-400 hover:text-neutral-600"
          onClick={() => {
            session.clear();
            router.replace('/login');
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

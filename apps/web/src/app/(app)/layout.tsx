'use client';

/**
 * Authenticated shell: client-side guard (redirect to /login when no JWT)
 * + the dark espresso sidebar — brand wordmark (display serif), icon
 * navigation with an active gold indicator, and the signed-in user chip.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Gem,
  LayoutDashboard,
  Database,
  Users,
  Package,
  Tags,
  ReceiptText,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { session, type SessionUser } from '@/lib/api';

/**
 * Navigation by role: ADMIN sees everything; OPS sees the day-to-day
 * pages only (no Masters / Tags — those are setup work). The API enforces
 * the same split server-side; this is presentation.
 */
const ADMIN_NAV: [href: string, label: string, icon: LucideIcon][] = [
  ['/dashboard', 'Dashboard', LayoutDashboard],
  ['/masters', 'Master data', Database],
  ['/customers', 'Customers', Users],
  ['/inventory', 'Inventory', Package],
  ['/tagging', 'Tags & labels', Tags],
  ['/billing', 'Billing', ReceiptText],
];
const OPS_NAV: [href: string, label: string, icon: LucideIcon][] = [
  ['/dashboard', 'Dashboard', LayoutDashboard],
  ['/customers', 'Customers', Users],
  ['/inventory', 'Inventory', Package],
  ['/billing', 'Billing', ReceiptText],
];
/** Pages an OPS user must not land on (deep links redirect to dashboard). */
const ADMIN_ONLY_PATHS = ['/masters', '/tagging'];

/** Compact labels for the phone bottom tab bar. */
const SHORT_LABEL: Record<string, string> = {
  Dashboard: 'Home',
  'Master data': 'Masters',
  Customers: 'Customers',
  Inventory: 'Stock',
  'Tags & labels': 'Tags',
  Billing: 'Billing',
};

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
    // OPS deep-linking into an admin-only page bounces to the dashboard.
    if (u.role !== 'ADMIN' && ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
      router.replace('/dashboard');
      return;
    }
    setUser(u);
  }, [router, pathname]);

  if (!user) return null;

  const nav = user.role === 'ADMIN' ? ADMIN_NAV : OPS_NAV;

  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-screen">
      {/* ---------- desktop sidebar (hidden on phones) ---------- */}
      <aside className="fixed inset-y-0 hidden w-60 flex-col bg-espresso-950 text-stone-300 lg:flex">
        {/* brand */}
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 text-espresso-950 shadow">
            <Gem size={18} strokeWidth={2.2} />
          </span>
          <div>
            <div className="font-display text-[17px] font-semibold leading-tight text-gold-100">Jewellery ERP</div>
            <div className="text-[10px] uppercase tracking-widest text-stone-500">admin console</div>
          </div>
        </div>

        {/* nav */}
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map(([href, label, Icon]) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active ? 'bg-white/[0.07] text-gold-200' : 'text-stone-400 hover:bg-white/[0.04] hover:text-stone-200'
                }`}
              >
                {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold-400" />}
                <Icon size={16} strokeWidth={2} className={active ? 'text-gold-300' : 'text-stone-500 group-hover:text-stone-300'} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* user chip */}
        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-900/60 text-xs font-semibold text-gold-200 ring-1 ring-gold-700/40">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-stone-200">{user.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">{user.role}</div>
            </div>
            <button
              title="Sign out"
              className="rounded-md p-1.5 text-stone-500 transition-colors hover:bg-white/5 hover:text-stone-200"
              onClick={() => {
                session.clear();
                router.replace('/login');
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- mobile top bar (app-style header) ---------- */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-espresso-950 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 text-espresso-950">
            <Gem size={14} strokeWidth={2.2} />
          </span>
          <span className="font-display text-[15px] font-semibold text-gold-100">Jewellery ERP</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-900/60 text-[10px] font-semibold text-gold-200 ring-1 ring-gold-700/40">
            {initials}
          </span>
          <button
            title="Sign out"
            className="rounded-md p-1.5 text-stone-500 active:bg-white/10"
            onClick={() => {
              session.clear();
              router.replace('/login');
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* content: room for the bottom tab bar on phones */}
      <main className="px-4 pb-24 pt-5 lg:ml-60 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* ---------- mobile bottom tab bar (mirrors the RN app) ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-white/5 bg-espresso-950 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {nav.map(([href, label, Icon]) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} className="flex flex-1 flex-col items-center gap-0.5 pb-2.5 pt-2">
              <span className={`rounded-full px-3.5 py-1 transition-colors ${active ? 'bg-gold-400/15' : ''}`}>
                <Icon size={19} strokeWidth={2} className={active ? 'text-gold-300' : 'text-stone-500'} />
              </span>
              <span className={`text-[10px] font-medium ${active ? 'text-gold-300' : 'text-stone-500'}`}>
                {SHORT_LABEL[label] ?? label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

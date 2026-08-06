/**
 * Small UI primitives shared by every page — one place for the visual
 * language so pages stay lean and consistent.
 *
 * Design rules encoded here (see globals.css for the token layer):
 * - status colours are reserved and ALWAYS carry a text label
 * - stat-tile values are sans semibold with proportional figures
 *   (tabular numerals are for table columns only)
 * - phone lists render as tappable cards (MobileListCard), desktop keeps
 *   the dense tables — pages pair them with sm:hidden / hidden sm:block
 */
import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

/** Page heading block: display-serif title + muted description. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Map every domain status to a badge tone. Labels always shown. */
const STATUS_TONE: Record<string, string> = {
  // stock
  IN_STOCK: 'badge-good',
  RESERVED: 'badge-warn',
  SOLD: 'badge-info',
  IN_TRANSIT: 'badge-warn',
  WITH_KARIGAR: 'badge-warn',
  SCRAPPED: 'badge-neutral',
  RECEIVED: 'badge-good',
  // payment settlement
  UNPAID: 'badge-danger',
  PARTIALLY_PAID: 'badge-warn',
  PAID: 'badge-good',
  REFUNDED: 'badge-neutral',
  // documents
  ISSUED: 'badge-good',
  CONVERTED: 'badge-info',
  CANCELLED: 'badge-danger',
  SUPERSEDED: 'badge-neutral',
  DRAFT: 'badge-neutral',
  // doc types
  TAX_INVOICE: 'badge-info',
  ESTIMATE: 'badge-neutral',
  DELIVERY_CHALLAN: 'badge-neutral',
  // rate sources
  MANUAL_FIX: 'badge-warn',
  FEED: 'badge-neutral',
  // order pipeline
  CONFIRMED: 'badge-info',
  PROCESSING: 'badge-warn',
  READY: 'badge-good',
  DELIVERED: 'badge-info',
  COMPLETED: 'badge-good',
  // purchase orders
  ORDERED: 'badge-info',
};

/** Status pill — tone by status, text label always visible. */
export function Badge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_TONE[status] ?? 'badge-neutral'}`}>{status.replaceAll('_', ' ')}</span>;
}

/**
 * Stat tile: sentence-case label, big sans-semibold value (proportional
 * figures — no tabular-nums at display size), optional footnote.
 */
export function StatTile({ label, value, foot }: { label: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_-6px_rgb(0_0_0/0.06)] ring-1 ring-stone-900/[0.03]">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-tight text-stone-900">{value}</div>
      {foot && <div className="mt-1 text-[11px] text-stone-400">{foot}</div>}
    </div>
  );
}

/** Skeleton row block shown while a list/tile is loading. */
export function SkeletonRows({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-11" />
      ))}
    </div>
  );
}

/** Friendly empty-state for lists with nothing in them yet. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-200 px-4 py-7 text-center">
      <Inbox className="mx-auto mb-2 h-5 w-5 text-stone-300" aria-hidden />
      <p className="text-sm text-stone-400">{children}</p>
    </div>
  );
}

/**
 * Tappable list card for phone layouts — the native-app substitute for a
 * table row. Renders a <button> when onClick is given, otherwise a <div>.
 * Layout: title + badges on the left, right-aligned figure, optional
 * meta line and action row underneath.
 */
export function MobileListCard({
  title,
  badges,
  right,
  meta,
  actions,
  onClick,
}: {
  title: ReactNode;
  badges?: ReactNode;
  right?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-stone-900">{title}</div>
          {badges && <div className="mt-1 flex flex-wrap items-center gap-1.5">{badges}</div>}
        </div>
        {right !== undefined && (
          <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-stone-900">{right}</div>
        )}
      </div>
      {meta && <div className="mt-1.5 text-xs text-stone-500">{meta}</div>}
      {actions && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-2.5">{actions}</div>
      )}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="card-tap block">
      {body}
    </button>
  ) : (
    <div className="card-tap block cursor-default active:scale-100 active:bg-white">{body}</div>
  );
}

/**
 * Small UI primitives shared by every page — one place for the visual
 * language so pages stay lean and consistent.
 *
 * Design rules encoded here (see globals.css for the token layer):
 * - status colours are reserved and ALWAYS carry a text label
 * - stat-tile values are sans semibold with proportional figures
 *   (tabular numerals are for table columns only)
 */
import type { ReactNode } from 'react';

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
  SOLD: 'badge-info',
  IN_TRANSIT: 'badge-warn',
  WITH_KARIGAR: 'badge-warn',
  SCRAPPED: 'badge-neutral',
  RECEIVED: 'badge-good',
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
    <div className="rounded-xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-stone-900">{value}</div>
      {foot && <div className="mt-0.5 text-[11px] text-stone-400">{foot}</div>}
    </div>
  );
}

/** Friendly empty-state for lists with nothing in them yet. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-400">{children}</p>;
}

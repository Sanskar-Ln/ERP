/**
 * Tenant scoping — the multi-tenancy enforcement layer.
 *
 * ARCHITECTURE RULE: every tenant-scoped table carries `tenantId`, and every
 * query against it MUST be filtered by the current tenant. Rather than trust
 * each call site, this module rewrites Prisma query arguments centrally, so
 * a query that forgets the filter CANNOT leak across tenants:
 *
 * - reads & bulk writes get `tenantId` AND-ed into `where`
 * - unique reads/writes (findUnique/update/delete/upsert) get `tenantId`
 *   merged into the unique `where` (Prisma extended-where semantics — a row
 *   of another tenant simply isn't found)
 * - creates get `tenantId` stamped into `data` (overriding whatever the
 *   caller passed — callers cannot write into another tenant)
 *
 * `scopeArgs` is a pure function (unit-tested without a DB); the Prisma
 * client extension in tenancy.service.ts applies it to every operation.
 */

/** Models that are NOT tenant-scoped (platform-level). Everything else is. */
export const UNSCOPED_MODELS = new Set(['Tenant']);

/** Operations whose `where` is a plain filter (list/aggregate/bulk). */
const FILTER_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/** Operations addressing a single row by unique key. */
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert']);

/** Operations inserting new rows. */
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = Record<string, any>;

/**
 * Rewrite Prisma args so the operation is confined to `tenantId`.
 * Pure function: returns new args, never mutates the input.
 *
 * @param model     Prisma model name (e.g. "Item")
 * @param operation Prisma operation (e.g. "findMany")
 * @param args      original operation args
 * @param tenantId  tenant to confine the operation to
 */
export function scopeArgs(model: string, operation: string, args: AnyArgs | undefined, tenantId: string): AnyArgs {
  const a: AnyArgs = { ...(args ?? {}) };
  if (UNSCOPED_MODELS.has(model)) return a;

  if (FILTER_OPS.has(operation)) {
    // AND-in the tenant filter; preserves any caller-supplied where.
    a.where = a.where ? { AND: [{ tenantId }, a.where] } : { tenantId };
  }

  if (UNIQUE_OPS.has(operation)) {
    // Extended unique where: `{ id, tenantId }` — a row belonging to another
    // tenant is simply "not found", which surfaces as Prisma P2025.
    a.where = { ...(a.where ?? {}), tenantId };
    if (operation === 'upsert') {
      a.create = { ...(a.create ?? {}), tenantId };
      // update side must NOT be able to move the row across tenants
      if (a.update && 'tenantId' in a.update) delete a.update.tenantId;
    }
  }

  if (CREATE_OPS.has(operation)) {
    if (Array.isArray(a.data)) {
      a.data = a.data.map((d: AnyArgs) => ({ ...d, tenantId }));
    } else if (a.data) {
      a.data = { ...a.data, tenantId };
    }
  }

  // Block cross-tenant moves via update data.
  if ((operation === 'update' || operation === 'updateMany') && a.data && 'tenantId' in a.data) {
    delete a.data.tenantId;
  }

  return a;
}

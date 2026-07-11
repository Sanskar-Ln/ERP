/**
 * TenancyService — hands out tenant-scoped Prisma clients.
 *
 * `client(tenantId)` returns a Prisma client extension that pipes EVERY
 * operation through `scopeArgs` (see tenant-scope.ts), so all reads and
 * writes are confined to that tenant. Extended clients are cached per
 * tenant (they are cheap, but a Map avoids rebuilding per request).
 *
 * Interactive transactions on the scoped client keep the scoping —
 * extensions apply inside `$transaction` callbacks too.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { scopeArgs } from './tenant-scope';

/** Build a tenant-confined client from the raw Prisma client. */
export function createTenantClient(prisma: PrismaService, tenantId: string) {
  return prisma.$extends({
    name: `tenant:${tenantId}`,
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(scopeArgs(model, operation, args as never, tenantId) as never);
        },
      },
    },
  });
}

/** The type modules program against: a Prisma client locked to one tenant. */
export type TenantClient = ReturnType<typeof createTenantClient>;

/** A transaction handle within a tenant-scoped interactive transaction. */
export type TenantTx = Parameters<Parameters<TenantClient['$transaction']>[0]>[0];

@Injectable()
export class TenancyService {
  private readonly cache = new Map<string, TenantClient>();

  constructor(private readonly prisma: PrismaService) {}

  /** Get (or build) the scoped client for a tenant. */
  client(tenantId: string): TenantClient {
    let c = this.cache.get(tenantId);
    if (!c) {
      c = createTenantClient(this.prisma, tenantId);
      this.cache.set(tenantId, c);
    }
    return c;
  }
}

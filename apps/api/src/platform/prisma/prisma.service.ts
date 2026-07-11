/**
 * PrismaService — the single raw PrismaClient for the process.
 *
 * IMPORTANT: application code should almost never query this directly.
 * Tenant-scoped modules must go through `TenancyService.client(tenantId)`
 * (src/platform/tenancy) which wraps this client with the tenant guard.
 * Direct use is reserved for genuinely tenant-less operations: login
 * (email lookup before a tenant is known) and tenant provisioning.
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

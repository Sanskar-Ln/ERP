/**
 * PlatformModule — cross-cutting infrastructure: Prisma, tenancy, auth
 * (JWT + RBAC guards, registered globally), and the audit log.
 * Global so feature modules only import what they use via DI.
 */
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma/prisma.service';
import { TenancyService } from './tenancy/tenancy.service';
import { AuditService } from './audit/audit.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard } from './auth/jwt.guard';
import { RolesGuard } from './auth/roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      // JWT_SECRET is required in production; the fallback keeps local dev
      // and tests running without a .env file.
      secret: process.env.JWT_SECRET ?? 'dev-only-secret',
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as `${number}h` },
    }),
  ],
  controllers: [AuthController],
  providers: [
    PrismaService,
    TenancyService,
    AuditService,
    AuthService,
    // Order matters: JWT guard authenticates, then RolesGuard authorizes.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PrismaService, TenancyService, AuditService],
})
export class PlatformModule {}

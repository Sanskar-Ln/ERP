/**
 * AuthService — credential verification, JWT issuance, and tenant
 * provisioning (SaaS signup).
 *
 * Login is one of the two places allowed to use the RAW Prisma client
 * (see PrismaService docs): the tenant is not known until the user row is
 * found. Everything after login flows through tenant-scoped clients.
 */
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { newId, Role, type CreateUser, type JwtClaims, type LoginResponse } from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { AuditService } from '../audit/audit.service';

/** Signup payload for provisioning a new tenant (validated in controller). */
export interface RegisterTenantInput {
  tenantName: string;
  stateCode: string;
  gstin?: string;
  branchName: string;
  owner: { email: string; name: string; password: string };
}

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenancy: TenancyService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /** Verify email+password and mint a JWT. */
  async login(email: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findFirst({ where: { email, isActive: true } });
    if (!user) throw new UnauthorizedException('invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid credentials');

    const claims: JwtClaims = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as Role,
      branchId: user.branchId,
    };
    return {
      accessToken: await this.jwt.signAsync(claims),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as Role,
        tenantId: user.tenantId,
        branchId: user.branchId,
      },
    };
  }

  /**
   * Provision a new tenant: Tenant + default Branch + ADMIN user, atomically.
   * This is the SaaS signup path (public endpoint).
   */
  async registerTenant(input: RegisterTenantInput) {
    const existing = await this.prisma.user.findFirst({ where: { email: input.owner.email } });
    if (existing) throw new ConflictException('email already registered');

    const tenantId = newId();
    const branchId = newId();
    const userId = newId();
    const passwordHash = await bcrypt.hash(input.owner.password, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.tenant.create({
        data: { id: tenantId, name: input.tenantName, stateCode: input.stateCode, gstin: input.gstin ?? null },
      }),
      this.prisma.branch.create({
        data: {
          id: branchId,
          tenantId,
          code: 'HQ',
          name: input.branchName,
          stateCode: input.stateCode,
          gstin: input.gstin ?? null,
        },
      }),
      this.prisma.user.create({
        data: {
          id: userId,
          tenantId,
          email: input.owner.email,
          name: input.owner.name,
          passwordHash,
          role: Role.ADMIN,
          branchId,
        },
      }),
    ]);

    await this.audit.log(this.tenancy.client(tenantId), {
      actorUserId: userId,
      entity: 'Tenant',
      entityId: tenantId,
      action: 'REGISTER',
      after: { tenantName: input.tenantName, branchId, ownerUserId: userId },
    });

    return { tenantId, branchId, ownerUserId: userId };
  }

  /** Create a staff user inside the caller's tenant (ADMIN only). */
  async createUser(tenantId: string, actorUserId: string, input: CreateUser) {
    const db = this.tenancy.client(tenantId);
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const id = newId();
    const user = await db.user.create({
      data: {
        id,
        // tenantId is stamped by the tenancy layer
        tenantId,
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role,
        branchId: input.branchId ?? null,
      },
    });
    await this.audit.log(db, {
      actorUserId,
      entity: 'User',
      entityId: id,
      action: 'CREATE',
      after: { email: input.email, role: input.role },
    });
    return { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId };
  }
}

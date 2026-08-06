/**
 * Party masters: customers (with KYC), suppliers, karigars.
 *
 * KYC BUSINESS RULE: high-value cash jewellery purchases require customer
 * KYC (PAN mandatory above statutory cash thresholds under Income-tax
 * rules / PMLA). The MVP stores KYC documents on the customer; enforcement
 * hooks live in billing (which can check `kycDocs` before issuing).
 */
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  newId,
  Role,
  zCreateCustomer,
  zCreateKarigar,
  zCreateSupplier,
  zId,
  zUpdateCustomerRate,
  type CreateCustomer,
  type CreateKarigar,
  type CreateSupplier,
  type JwtClaims,
  type UpdateCustomerRate,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';

const zSearch = z.object({ q: z.string().max(120).optional() });

@ApiTags('master-data')
@ApiBearerAuth()
@Controller()
export class PartiesController {
  constructor(private readonly tenancy: TenancyService) {}

  // ---------------------------------------------------------- customers

  /** Search customers by name/phone substring (salesperson counter flow). */
  @Get('customers')
  listCustomers(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zSearch)) query: z.infer<typeof zSearch>) {
    const db = this.tenancy.client(user.tenantId);
    return db.customer.findMany({
      where: query.q
        ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { phone: { contains: query.q } }] }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('customers/:id')
  getCustomer(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.tenancy.client(user.tenantId).customer.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Set the customer-specific rate adjustment (signed bps on the board
   * rate; −100 = 1% concession). Pricing concessions are ADMIN-only —
   * OPS negotiates within the discount cap instead.
   */
  @Patch('customers/:id/rate')
  @Roles(Role.ADMIN)
  @ApiZodBody(zUpdateCustomerRate)
  setCustomerRate(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Body(new ZodPipe(zUpdateCustomerRate)) body: UpdateCustomerRate,
  ) {
    return this.tenancy.client(user.tenantId).customer.update({
      where: { id },
      data: { rateAdjustBps: body.rateAdjustBps },
    });
  }

  /** Any counter role may register a customer (walk-in flow). */
  @Post('customers')
  @ApiZodBody(zCreateCustomer)
  createCustomer(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateCustomer)) body: CreateCustomer) {
    return this.tenancy.client(user.tenantId).customer.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        name: body.name,
        phone: body.phone,
        email: body.email ?? null,
        addressLine: body.addressLine ?? null,
        city: body.city ?? null,
        stateCode: body.stateCode,
        pincode: body.pincode ?? null,
        gstin: body.gstin ?? null,
        pan: body.pan ?? null,
        kycDocs: body.kycDocs,
      },
    });
  }

  // ---------------------------------------------------------- suppliers

  @Get('suppliers')
  listSuppliers(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).supplier.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('suppliers')
  @Roles(Role.OPS)
  @ApiZodBody(zCreateSupplier)
  createSupplier(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateSupplier)) body: CreateSupplier) {
    return this.tenancy.client(user.tenantId).supplier.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        name: body.name,
        phone: body.phone ?? null,
        gstin: body.gstin ?? null,
        stateCode: body.stateCode,
        addressLine: body.addressLine ?? null,
      },
    });
  }

  // ---------------------------------------------------------- karigars

  @Get('karigars')
  listKarigars(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).karigar.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('karigars')
  @Roles(Role.OPS)
  @ApiZodBody(zCreateKarigar)
  createKarigar(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateKarigar)) body: CreateKarigar) {
    return this.tenancy.client(user.tenantId).karigar.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        name: body.name,
        phone: body.phone ?? null,
        specialty: body.specialty ?? null,
      },
    });
  }
}

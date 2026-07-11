/**
 * Catalog master data: metals & purities, stone types, HSN codes.
 *
 * Reads are open to all authenticated roles; writes require MANAGER
 * (OWNER always passes RBAC). These masters are referenced by inventory
 * and billing, so they are create-only in the MVP (no deletes — rows may
 * already be referenced by immutable documents).
 */
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  newId,
  Role,
  zCreateHsnCode,
  zCreateMetal,
  zCreatePurity,
  zCreateStoneType,
  type CreateHsnCode,
  type CreateMetal,
  type CreatePurity,
  type CreateStoneType,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';

@ApiTags('master-data')
@ApiBearerAuth()
@Controller()
export class CatalogController {
  constructor(private readonly tenancy: TenancyService) {}

  // ------------------------------------------------------------ metals

  /** List metals with their purities. */
  @Get('metals')
  listMetals(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).metal.findMany({
      include: { purities: true },
      orderBy: { code: 'asc' },
    });
  }

  @Post('metals')
  @Roles(Role.MANAGER)
  @ApiZodBody(zCreateMetal)
  createMetal(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateMetal)) body: CreateMetal) {
    return this.tenancy.client(user.tenantId).metal.create({
      data: { id: newId(), tenantId: user.tenantId, code: body.code, name: body.name },
    });
  }

  /** Add a purity (22K/916, 18K/750 …) to a metal. */
  @Post('purities')
  @Roles(Role.MANAGER)
  @ApiZodBody(zCreatePurity)
  createPurity(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreatePurity)) body: CreatePurity) {
    return this.tenancy.client(user.tenantId).purity.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        metalId: body.metalId,
        label: body.label,
        karat: body.karat ?? null,
        finenessPpt: body.finenessPpt,
      },
    });
  }

  // ------------------------------------------------------------ stones

  @Get('stone-types')
  listStoneTypes(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).stoneType.findMany({ orderBy: { code: 'asc' } });
  }

  @Post('stone-types')
  @Roles(Role.MANAGER)
  @ApiZodBody(zCreateStoneType)
  createStoneType(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateStoneType)) body: CreateStoneType) {
    return this.tenancy.client(user.tenantId).stoneType.create({
      data: { id: newId(), tenantId: user.tenantId, code: body.code, name: body.name, isDiamond: body.isDiamond },
    });
  }

  // ------------------------------------------------------------ HSN

  @Get('hsn-codes')
  listHsnCodes(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).hsnCode.findMany({ orderBy: { code: 'asc' } });
  }

  @Post('hsn-codes')
  @Roles(Role.MANAGER, Role.ACCOUNTANT)
  @ApiZodBody(zCreateHsnCode)
  createHsnCode(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateHsnCode)) body: CreateHsnCode) {
    return this.tenancy.client(user.tenantId).hsnCode.create({
      data: { id: newId(), tenantId: user.tenantId, code: body.code, description: body.description },
    });
  }
}

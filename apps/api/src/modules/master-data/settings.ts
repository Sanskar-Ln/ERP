/**
 * Tenant-level billing settings.
 *
 * - GET   /settings   read (any role — the UI shows OPS their discount cap)
 * - PATCH /settings   update (ADMIN)
 *
 * Kept deliberately small: the only knob today is the OPS discount cap
 * (bps of pre-discount value). The cap is ENFORCED in the document engine
 * server-side; this endpoint only configures it.
 */
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, zUpdateBillingSettings, type JwtClaims, type UpdateBillingSettings } from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';

@ApiTags('master-data')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get()
  async get(@CurrentUser() user: JwtClaims) {
    const tenant = await this.tenancy
      .client(user.tenantId)
      .tenant.findUniqueOrThrow({ where: { id: user.tenantId } });
    return { opsMaxDiscountBps: tenant.opsMaxDiscountBps };
  }

  @Patch()
  @Roles(Role.ADMIN)
  @ApiZodBody(zUpdateBillingSettings)
  async update(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zUpdateBillingSettings)) body: UpdateBillingSettings) {
    const tenant = await this.tenancy
      .client(user.tenantId)
      .tenant.update({ where: { id: user.tenantId }, data: { opsMaxDiscountBps: body.opsMaxDiscountBps } });
    return { opsMaxDiscountBps: tenant.opsMaxDiscountBps };
  }
}

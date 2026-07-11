/**
 * InventoryModule — composite items, lots, the append-only stock-movement
 * ledger, and inter-branch transfers. See README.md in this directory.
 */
import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { zId, type JwtClaims } from '@erp/shared';
import { CurrentUser } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ItemsController, ItemsService } from './items';
import { MovementsController, MovementsService } from './movements';
import { TransfersController, TransfersService } from './transfers';

const zSummaryQuery = z.object({ branchId: zId.optional() });

/**
 * Stock summary — dual-unit position per branch and status, derived from
 * the item table (piece/status view) with the movement ledger as the
 * audit-side source of truth.
 */
@ApiTags('inventory')
@ApiBearerAuth()
@Controller('stock')
class StockController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get('summary')
  async summary(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zSummaryQuery)) q: z.infer<typeof zSummaryQuery>) {
    const db = this.tenancy.client(user.tenantId);
    const [byStatus, weights] = await Promise.all([
      db.item.groupBy({
        by: ['branchId', 'status'],
        where: q.branchId ? { branchId: q.branchId } : undefined,
        _sum: { pieces: true },
        _count: { _all: true },
      }),
      db.itemMetalComponent.aggregate({
        where: q.branchId ? { item: { branchId: q.branchId } } : undefined,
        _sum: { grossWeightG: true, netWeightG: true },
      }),
    ]);
    return {
      byStatus,
      totalGrossWeightG: weights._sum.grossWeightG?.toFixed(3) ?? '0.000',
      totalNetWeightG: weights._sum.netWeightG?.toFixed(3) ?? '0.000',
    };
  }
}

@Module({
  controllers: [ItemsController, MovementsController, TransfersController, StockController],
  providers: [ItemsService, MovementsService, TransfersService],
})
export class InventoryModule {}

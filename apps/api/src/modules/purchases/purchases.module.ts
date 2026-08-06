/**
 * PurchasesModule — procurement: supplier → PO → weight-verified goods
 * receipt → intake Lot, with append-only supplier payments. ADMIN-only.
 */
import { Module } from '@nestjs/common';
import { PurchasesController, PurchasesService } from './purchases';

@Module({
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}

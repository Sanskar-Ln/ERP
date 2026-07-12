/**
 * BillingModule — the document engine: one cart shape → Tax Invoice /
 * Estimate / Delivery Challan, GST via the pure domain engine, stock
 * effects, numbering, conversion and cancellation. See README.md here.
 */
import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [BillingController],
  providers: [DocumentsService],
})
export class BillingModule {}

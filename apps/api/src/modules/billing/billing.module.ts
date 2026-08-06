/**
 * BillingModule — the document engine: one cart shape → Tax Invoice /
 * Estimate / Delivery Challan, GST via the pure domain engine, stock
 * effects, numbering, conversion and cancellation — plus the append-only
 * payment ledger against documents. See README.md here.
 */
import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { DocumentsService } from './documents.service';
import { PaymentsController, PaymentsService } from './payments';

@Module({
  controllers: [BillingController, PaymentsController],
  providers: [DocumentsService, PaymentsService],
})
export class BillingModule {}

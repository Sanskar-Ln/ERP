/**
 * PaperBillsModule — digitized paper bills attached to customers.
 *
 * Jewellery shops carry decades of handwritten/printed bills; recurring
 * customers bring them back for exchanges, repairs and valuations. This
 * module lets staff photograph/scan those bills and file them against the
 * customer, so one customer's history = system Documents + PaperBills.
 * See README.md in this directory.
 */
import { Module } from '@nestjs/common';
import { PaperBillsController } from './paper-bills.controller';
import { OcrService } from './ocr.service';

@Module({
  controllers: [PaperBillsController],
  providers: [OcrService],
})
export class PaperBillsModule {}

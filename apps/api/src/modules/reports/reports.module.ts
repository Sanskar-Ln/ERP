/**
 * ReportsModule — downloadable CSV reports for managers/accountants:
 * the period sales register (documents.csv) and the GST filing summary
 * (gst-summary.csv). See README.md in this directory.
 */
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';

@Module({
  controllers: [ReportsController],
})
export class ReportsModule {}

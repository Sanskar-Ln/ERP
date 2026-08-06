/**
 * TaggingModule — per-piece tags, server-side barcode rendering (bwip-js),
 * millimetre label designs (rectangle + jewellery dumbbell), printer
 * profiles with hardware identification, and printing through ZPL / TSPL /
 * browser HTML. See README.md here.
 */
import { Module } from '@nestjs/common';
import { TagsController, TagsService } from './tags';
import { LabelsController, LabelsService } from './labels';
import { PrinterIoService } from './printers';

@Module({
  controllers: [TagsController, LabelsController],
  providers: [TagsService, LabelsService, PrinterIoService],
})
export class TaggingModule {}

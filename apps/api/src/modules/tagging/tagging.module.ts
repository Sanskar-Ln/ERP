/**
 * TaggingModule — per-piece tags, server-side barcode rendering (bwip-js),
 * label templates and batch label generation. See README.md here.
 */
import { Module } from '@nestjs/common';
import { TagsController, TagsService } from './tags';
import { LabelsController, LabelsService } from './labels';

@Module({
  controllers: [TagsController, LabelsController],
  providers: [TagsService, LabelsService],
})
export class TaggingModule {}
